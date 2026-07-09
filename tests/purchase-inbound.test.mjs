import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildPurchaseInboundPayload,
  getPurchaseInboundAmount,
  getPurchaseInboundQty,
  getPurchaseInboundUnitCost,
  isPurchaseInboundMaterial,
  isPurchaseInboundSupplierEnabled,
  isPurchaseInboundWarehouseEnabled,
  normalizePurchaseDate,
  todayPurchaseDate,
  validatePurchaseInboundInput,
} from '../frontend-admin/src/utils/purchase-inbound.ts'

describe('purchase inbound amount and option rules', () => {
  it('normalizes quantities, unit costs and purchase amounts', () => {
    const input = { qty: '12', unitCost: '3.45678' }

    assert.equal(todayPurchaseDate(new Date('2026-07-04T08:00:00')), '2026-07-04')
    assert.equal(getPurchaseInboundQty(input), 12)
    assert.equal(getPurchaseInboundUnitCost(input), 3.4568)
    assert.equal(getPurchaseInboundAmount(input), 41.48)
    assert.equal(getPurchaseInboundAmount({ ...input, purchaseAmount: '40.125' }), 40.13)
  })

  it('filters usable suppliers, warehouses and material products', () => {
    assert.equal(isPurchaseInboundSupplierEnabled({ status: 1 }), true)
    assert.equal(isPurchaseInboundSupplierEnabled({ status: 0 }), false)
    assert.equal(isPurchaseInboundWarehouseEnabled({ isEnabled: 1 }), true)
    assert.equal(isPurchaseInboundWarehouseEnabled({ is_enabled: 0 }), false)
    assert.equal(isPurchaseInboundMaterial({ type: 'RAW' }), true)
    assert.equal(isPurchaseInboundMaterial({ type: 'semi' }), true)
    assert.equal(isPurchaseInboundMaterial({ type: 'FINISHED' }), false)
  })
})

describe('purchase inbound validation and payload', () => {
  const validInput = {
    supplierId: 8,
    productId: 10,
    warehouseId: 3,
    qty: 12,
    unitCost: 3.45678,
    inDate: '2026-07-04',
    batchNo: '  B-20260704  ',
    productionDate: '2026-07-01',
    expiryDate: '2026-12-31',
    remark: '  首批采购  ',
  }

  it('builds a normalized purchase inbound payload for page and API submission', () => {
    assert.equal(validatePurchaseInboundInput(validInput, '2026-07-04'), '')
    assert.deepEqual(buildPurchaseInboundPayload(validInput, '2026-07-04'), {
      supplierId: 8,
      productId: 10,
      warehouseId: 3,
      qty: 12,
      unitCost: 3.4568,
      amount: 41.48,
      inDate: '2026-07-04',
      batchNo: 'B-20260704',
      productionDate: '2026-07-01',
      expiryDate: '2026-12-31',
      remark: '首批采购',
    })
  })

  it('rejects missing required fields and numeric boundaries', () => {
    assert.equal(validatePurchaseInboundInput({ ...validInput, supplierId: 0 }, '2026-07-04'), '请选择供应商')
    assert.equal(validatePurchaseInboundInput({ ...validInput, productId: 0 }, '2026-07-04'), '请选择入库物料')
    assert.equal(validatePurchaseInboundInput({ ...validInput, warehouseId: 0 }, '2026-07-04'), '请选择入库仓库')
    assert.equal(validatePurchaseInboundInput({ ...validInput, qty: 1.5 }, '2026-07-04'), '入库数量必须是大于 0 的整数')
    assert.equal(validatePurchaseInboundInput({ ...validInput, unitCost: 0 }, '2026-07-04'), '采购单价必须大于 0')
    assert.throws(() => buildPurchaseInboundPayload({ ...validInput, supplierId: 0 }, '2026-07-04'), /请选择供应商/)
  })

  it('rejects invalid date formats and batch date conflicts', () => {
    assert.equal(normalizePurchaseDate('2026-02-29'), '')
    assert.equal(validatePurchaseInboundInput({ ...validInput, inDate: '' }, '2026-07-04'), '请选择入库日期')
    assert.equal(validatePurchaseInboundInput({ ...validInput, inDate: '20260704' }, '2026-07-04'), '入库日期格式不正确')
    assert.equal(validatePurchaseInboundInput({ ...validInput, inDate: '2026-07-05' }, '2026-07-04'), '入库日期不能晚于今天')
    assert.equal(validatePurchaseInboundInput({ ...validInput, productionDate: '2026-07-05' }, '2026-07-04'), '生产日期不能晚于入库日期')
    assert.equal(validatePurchaseInboundInput({ ...validInput, expiryDate: '2026-07-03' }, '2026-07-04'), '有效期不能早于入库日期')
    assert.equal(
      validatePurchaseInboundInput({ ...validInput, productionDate: '2026-07-02', expiryDate: '2026-07-01' }, '2026-07-04'),
      '有效期不能早于入库日期'
    )
  })
})

describe('purchase inbound page and API integration', () => {
  it('uses shared purchase inbound rules in the page and Supabase request adapter', () => {
    const pageSource = readFileSync(new URL('../frontend-admin/src/views/stock/in-purchase.vue', import.meta.url), 'utf8')
    const requestSource = readFileSync(new URL('../frontend-admin/src/api/supabaseRequest.ts', import.meta.url), 'utf8')

    assert.match(pageSource, /buildPurchaseInboundPayload/)
    assert.match(pageSource, /validatePurchaseInboundInput/)
    assert.match(pageSource, /isPurchaseInboundSupplierEnabled/)
    assert.match(pageSource, /isPurchaseInboundWarehouseEnabled/)
    assert.match(requestSource, /import \{ buildPurchaseInboundPayload \} from '..\/utils\/purchase-inbound'/)
    assert.match(requestSource, /path === 'stock\/in-purchase'[\s\S]*?\{ \.\.\.data, \.\.\.buildPurchaseInboundPayload\(data \|\| \{\}\) \}/)
    assert.match(requestSource, /buildPurchaseInboundPayload\(data \|\| \{\}\)/)
    assert.match(requestSource, /syncWorkflowByBusiness\('purchase_inbound'[\s\S]*?'create'/)
  })
})
