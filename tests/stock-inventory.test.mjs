import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildInventoryApprovalSummary,
  buildInventoryStockKey,
  buildStockInventoryDetailCsv,
  getInventoryApprovalWarnings,
  getInventoryDiffQty,
  getInventorySupplierId,
  inventoryItemText,
  inventorySupplierText,
  summarizeInventoryItems,
  validateInventoryApproval,
  validateInventoryCountItems,
  validateInventoryReviewSubmit,
  validateInventoryStatus,
} from '../frontend-admin/src/utils/stock-inventory.ts'

const item = {
  id: 1,
  productId: 101,
  productCode: 'P-001',
  productName: '透明外壳',
  locationId: 2,
  batchId: 3,
  supplierId: 8,
  supplierCode: 'GYS-01',
  supplierName: '华东原料',
  bookQty: 100,
  actualQty: 96,
  reason: '抽盘盘亏',
}

const stock = {
  productId: 101,
  warehouseId: 5,
  locationId: 2,
  batchId: 3,
  qty: 100,
  lockedQty: 5,
}

describe('stock inventory status rules', () => {
  it('allows only expected status transitions and keeps legacy submitted approvable', () => {
    assert.equal(validateInventoryStatus('DRAFT', 'start'), '')
    assert.equal(validateInventoryStatus('COUNTING', 'submit'), '')
    assert.equal(validateInventoryStatus('PENDING_APPROVE', 'approve'), '')
    assert.equal(validateInventoryStatus('SUBMITTED', 'approve'), '')
    assert.equal(validateInventoryStatus('FINISHED', 'approve'), '当前状态不能审核通过')
  })
})

describe('stock inventory count validation', () => {
  it('requires integer physical quantity and reason for differences', () => {
    assert.equal(validateInventoryCountItems([{ ...item, actualQty: 1.5 }]), '实盘数量必须是大于等于 0 的整数')
    assert.equal(
      validateInventoryCountItems([{ ...item, actualQty: 96, reason: '' }]),
      'P-001 - 透明外壳 / GYS-01 - 华东原料 存在盘点差异，请填写原因'
    )
    assert.equal(validateInventoryCountItems([{ ...item, actualQty: 100, reason: '' }]), '')
  })

  it('rejects missing and duplicated detail ids', () => {
    assert.equal(validateInventoryCountItems([{ ...item, id: 0 }]), '盘点明细不存在')
    assert.equal(validateInventoryCountItems([item, item]), '盘点明细重复')
  })
})

describe('stock inventory review and approval', () => {
  it('blocks review submission when count details are incomplete', () => {
    assert.equal(validateInventoryReviewSubmit({ status: 'DRAFT' }, [item]), '当前状态不能提交审核')
    assert.equal(
      validateInventoryReviewSubmit({ status: 'COUNTING' }, [{ ...item, reason: '' }]),
      'P-001 - 透明外壳 / GYS-01 - 华东原料 存在盘点差异，请填写原因'
    )
    assert.equal(validateInventoryReviewSubmit({ status: 'COUNTING' }, [item]), '')
  })

  it('blocks approval that would make stock negative or lower than locked quantity', () => {
    assert.equal(
      validateInventoryApproval({ status: 'PENDING_APPROVE' }, [{ ...item, actualQty: 0 }], [stock]),
      'P-001 - 透明外壳 / GYS-01 - 华东原料 盘亏后库存不能小于锁定量'
    )
    assert.equal(
      validateInventoryApproval({ status: 'PENDING_APPROVE' }, [{ ...item, actualQty: 90 }], [{ ...stock, qty: 5, lockedQty: 0 }]),
      'P-001 - 透明外壳 / GYS-01 - 华东原料 盘亏后库存不能小于 0'
    )
    assert.equal(validateInventoryApproval({ status: 'PENDING_APPROVE' }, [item], [stock]), '')
  })

  it('returns approval warnings for page-level visibility', () => {
    assert.deepEqual(
      getInventoryApprovalWarnings([{ ...item, actualQty: 0 }], [stock]),
      ['P-001 - 透明外壳 / GYS-01 - 华东原料 盘亏后库存不能小于锁定量']
    )
    assert.deepEqual(
      getInventoryApprovalWarnings([{ ...item, actualQty: 90 }], []),
      ['P-001 - 透明外壳 / GYS-01 - 华东原料 盘亏后库存不能小于 0']
    )
  })
})

describe('stock inventory summaries', () => {
  it('summarizes profit, loss and net difference', () => {
    const rows = [
      { ...item, id: 1, actualQty: 96 },
      { ...item, id: 2, productCode: 'P-002', actualQty: 110 },
      { ...item, id: 3, productCode: 'P-003', actualQty: 100, reason: '' },
    ]

    assert.deepEqual(summarizeInventoryItems(rows), {
      itemCount: 3,
      diffItemCount: 2,
      profitItemCount: 1,
      lossItemCount: 1,
      profitQty: 10,
      lossQty: 4,
      netDiffQty: 6,
    })
    assert.equal(buildInventoryApprovalSummary(rows), '共 3 项，差异 2 项，盘盈 10，盘亏 4，净差异 6')
  })

  it('builds stable stock keys and recomputes diff when explicit diff is absent', () => {
    assert.equal(buildInventoryStockKey(item), '101|2|3')
    assert.equal(getInventoryDiffQty({ ...item, diffQty: undefined }), -4)
  })

  it('formats supplier traceability without changing stock identity keys', () => {
    assert.equal(getInventorySupplierId(item), 8)
    assert.equal(inventorySupplierText(item), 'GYS-01 - 华东原料')
    assert.equal(inventorySupplierText({ ...item, supplierCode: '', supplierName: '' }), '-')
    assert.equal(inventoryItemText(item), 'P-001 - 透明外壳 / GYS-01 - 华东原料')
    assert.equal(buildInventoryStockKey(item), '101|2|3')
  })

  it('exports inventory detail csv with supplier traceability and escaping', () => {
    const csv = buildStockInventoryDetailCsv(
      { inventoryNo: 'PD-001' },
      [
        item,
        { ...item, id: 2, supplierCode: '', supplierName: '', batchNo: 'B,002', reason: '盘亏,复核' },
      ]
    )

    assert.equal(csv.startsWith('盘点单号,产品,库位,批次,供应商,账面数量,实盘数量,差异数量,原因'), true)
    assert.equal(csv.includes('PD-001,P-001 - 透明外壳'), true)
    assert.equal(csv.includes('GYS-01 - 华东原料'), true)
    assert.equal(csv.includes('"B,002",-'), true)
    assert.equal(csv.includes('"盘亏,复核"'), true)
  })

  it('keeps the same inventory detail csv header when there are no rows', () => {
    assert.equal(
      buildStockInventoryDetailCsv({ inventoryNo: 'PD-EMPTY' }, []),
      '盘点单号,产品,库位,批次,供应商,账面数量,实盘数量,差异数量,原因'
    )
  })
})

describe('stock inventory page integration', () => {
  it('keeps page-level failure feedback visible for inventory lifecycle actions', () => {
    const source = readFileSync(new URL('../frontend-admin/src/views/stock/inventory.vue', import.meta.url), 'utf8')

    assert.match(source, /v-if="errorMessage"/)
    assert.match(source, /failureText\(error, '盘点单加载失败/)
    assert.match(source, /failureText\(error, '实盘保存失败/)
    assert.match(source, /failureText\(error, '盘点审核通过失败/)
  })
})
