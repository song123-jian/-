import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildMobileInventoryCheckPayload,
  chooseInventoryStockRow,
  formatInventoryQty,
  getInventoryAvailableQty,
  getInventoryDiffQty,
  inventorySupplierText,
  inventoryTraceLabel,
  validateMobileInventoryCheckInput,
} from '../frontend-mobile/src/utils/inventory-check.ts'

const stockRow = {
  id: 1,
  productId: 101,
  productCode: 'P-001',
  productName: '透明外壳',
  warehouseId: 2,
  warehouseName: '成品仓',
  locationId: 3,
  locationCode: 'A-01',
  batchId: 5,
  batchNo: 'B-001',
  supplierCode: 'GYS-01',
  supplierName: '华东原料',
  qty: 120,
  lockedQty: 20,
  unit: '件',
}

describe('mobile inventory validation', () => {
  it('rejects missing required fields and invalid actual quantity', () => {
    assert.equal(validateMobileInventoryCheckInput({}), '请选择仓库')
    assert.equal(
      validateMobileInventoryCheckInput({ warehouseId: 2, locationId: 3, productId: 101 }),
      '请输入实盘数量'
    )
    assert.equal(
      validateMobileInventoryCheckInput({ warehouseId: 2, locationId: 3, productId: 101, actualQuantity: -1 }),
      '实盘数量必须是大于等于 0 的整数'
    )
    assert.equal(
      validateMobileInventoryCheckInput({ warehouseId: 2, locationId: 3, productId: 101, actualQuantity: 1.5 }),
      '实盘数量必须是大于等于 0 的整数'
    )
  })

  it('requires an audit reason when the physical count differs from book stock', () => {
    assert.equal(
      validateMobileInventoryCheckInput(
        { warehouseId: 2, locationId: 3, productId: 101, actualQuantity: 119 },
        stockRow,
        { requireStock: true }
      ),
      '存在盘点差异时必须填写原因'
    )
    assert.equal(
      validateMobileInventoryCheckInput(
        { warehouseId: 2, locationId: 3, productId: 101, actualQuantity: 119, reason: '盘亏复核' },
        stockRow,
        { requireStock: true }
      ),
      ''
    )
  })

  it('rejects stock rows outside the selected warehouse and location', () => {
    assert.equal(
      validateMobileInventoryCheckInput(
        { warehouseId: 9, locationId: 3, productId: 101, actualQuantity: 120 },
        stockRow,
        { requireStock: true }
      ),
      '账面库存与所选仓库不一致'
    )
  })
})

describe('mobile inventory stock selection', () => {
  it('selects stock by exact product code or product id within scope', () => {
    assert.equal(chooseInventoryStockRow([stockRow], 'P-001', { warehouseId: 2, locationId: 3 }).row, stockRow)
    assert.equal(chooseInventoryStockRow([stockRow], 101, { warehouseId: 2, locationId: 3 }).row, stockRow)
  })

  it('blocks ambiguous multi-batch stock for one mobile count', () => {
    const result = chooseInventoryStockRow(
      [
        stockRow,
        { ...stockRow, id: 2, batchId: 6, batchNo: 'B-002' },
      ],
      'P-001',
      { warehouseId: 2, locationId: 3 }
    )

    assert.equal(result.error, '当前产品库位存在多个批次，请在管理端按批次盘点')
  })

  it('blocks broad matches until the operator enters an exact identifier', () => {
    const result = chooseInventoryStockRow(
      [
        stockRow,
        { ...stockRow, id: 2, productId: 102, productCode: 'P-002' },
      ],
      '透明',
      { warehouseId: 2, locationId: 3 }
    )

    assert.equal(result.error, '匹配到多个库存，请输入准确产品编码或产品ID')
  })
})

describe('mobile inventory calculations and payload', () => {
  it('computes available quantity and count differences without clamping', () => {
    assert.equal(getInventoryAvailableQty(stockRow), 100)
    assert.equal(getInventoryDiffQty({ actualQuantity: 118 }, stockRow), -2)
    assert.equal(formatInventoryQty(118.25, 'kg'), '118.25kg')
  })

  it('builds a normalized payload for the Supabase submission path', () => {
    assert.deepEqual(
      buildMobileInventoryCheckPayload(
        { warehouseId: '2', locationId: '3', productId: '101', actualQuantity: '118', reason: '抽盘盘亏' },
        stockRow
      ),
      {
        warehouseId: 2,
        locationId: 3,
        productId: 101,
        actualQuantity: 118,
        bookQty: 120,
        diffQty: -2,
        batchId: 5,
        reason: '抽盘盘亏',
      }
    )
  })
})

describe('mobile inventory traceability display', () => {
  it('formats supplier and batch traceability for the stock preview', () => {
    assert.equal(inventorySupplierText(stockRow), 'GYS-01 - 华东原料')
    assert.equal(
      inventoryTraceLabel(stockRow),
      '成品仓 / A-01 · 批次 B-001 · 供应商 GYS-01 - 华东原料'
    )
  })

  it('keeps the stock preview readable when batch or supplier data is missing', () => {
    assert.equal(inventorySupplierText({ ...stockRow, supplierCode: '', supplierName: '' }), '-')
    assert.equal(inventorySupplierText({ ...stockRow, supplierCode: '-', supplierName: '-' }), '-')
    assert.equal(
      inventoryTraceLabel(
        { ...stockRow, warehouseName: '', locationCode: '', batchNo: '', supplierCode: '-', supplierName: '-' },
        { warehouseName: '备用仓', locationCode: 'Z-09' }
      ),
      '备用仓 / Z-09 · 无批次 · 供应商 -'
    )
  })
})

function createInventorySubmitSupabaseMock(options = {}) {
  const calls = {
    inventoryPayloads: [],
    itemPayloads: [],
    deletedInventoryIds: [],
  }
  const stockRows = options.stockRows || [
    {
      id: 1,
      product_id: 101,
      warehouse_id: 2,
      location_id: 3,
      batch_id: 5,
      qty: 120,
      locked_qty: 20,
    },
  ]
  const client = {
    from(table) {
      if (table === 'stock') {
        const query = {
          select() {
            return query
          },
          eq() {
            return query
          },
          limit() {
            return Promise.resolve({ data: stockRows, error: null })
          },
        }
        return query
      }
      if (table === 'stock_inventory') {
        return {
          insert(payload) {
            calls.inventoryPayloads.push(payload)
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: { id: 900, inventory_no: payload.inventory_no }, error: null })
                  },
                }
              },
            }
          },
          delete() {
            return {
              eq(_key, id) {
                calls.deletedInventoryIds.push(id)
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      }
      if (table === 'stock_inventory_item') {
        return {
          insert(payload) {
            calls.itemPayloads.push(payload)
            return Promise.resolve({ error: options.itemError || null })
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }
  return { client, calls }
}

async function postInventoryCheckWithMock(mock, payload) {
  const { __setSupabaseClientForTest } = await import('../frontend-mobile/src/api/supabaseClient.ts')
  const { createSupabaseRequest } = await import('../frontend-mobile/src/api/supabaseRequest.ts')
  __setSupabaseClientForTest(mock.client)
  try {
    return await createSupabaseRequest().post('/stock-inventories/mobile-check', payload)
  } finally {
    __setSupabaseClientForTest()
  }
}

describe('mobile inventory Supabase submit traceability', () => {
  it('stores the batch id on mobile inventory items for supplier recovery', async () => {
    const mock = createInventorySubmitSupabaseMock()
    const res = await postInventoryCheckWithMock(mock, {
      warehouseId: 2,
      locationId: 3,
      productId: 101,
      actualQuantity: 118,
      reason: '抽盘盘亏',
    })

    assert.equal(res.data.inventoryId, 900)
    assert.equal(mock.calls.inventoryPayloads[0].inventory_type, 'MOBILE_CHECK')
    assert.equal(mock.calls.itemPayloads[0].batch_id, 5)
    assert.equal(mock.calls.itemPayloads[0].diff_qty, -2)
    assert.equal(mock.calls.itemPayloads[0].reason, '抽盘盘亏')
  })

  it('rolls back the mobile inventory document when item creation fails', async () => {
    const mock = createInventorySubmitSupabaseMock({ itemError: new Error('insert item failed') })

    await assert.rejects(
      () =>
        postInventoryCheckWithMock(mock, {
          warehouseId: 2,
          locationId: 3,
          productId: 101,
          actualQuantity: 120,
        }),
      /insert item failed/
    )
    assert.deepEqual(mock.calls.deletedInventoryIds, [900])
  })
})
