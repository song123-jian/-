import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatStockQtyPair,
  getStockAvailableQty,
  getStockRisk,
  normalizeStockDateOnly,
  stockSearchText,
  stockSupplierText,
  stockTraceLabel,
} from '../frontend-mobile/src/utils/stock-query.ts'

describe('mobile stock query quantities', () => {
  it('keeps zero and negative available quantity visible', () => {
    assert.equal(getStockAvailableQty({ qty: 10, lockedQty: 10 }), 0)
    assert.equal(getStockAvailableQty({ qty: 5, lockedQty: 8 }), -3)
    assert.equal(formatStockQtyPair({ qty: 10, availableQty: 0, unit: 'kg' }), '0kg / 10kg')
  })

  it('uses explicit available quantity when backend provides it', () => {
    assert.equal(getStockAvailableQty({ qty: 10, lockedQty: 3, availableQty: 2 }), 2)
  })
})

describe('mobile stock query risk labels', () => {
  it('detects locked quantity anomalies and unavailable stock', () => {
    assert.deepEqual(getStockRisk({ qty: 5, lockedQty: 8 }), { level: 'danger', text: '锁定异常' })
    assert.deepEqual(getStockRisk({ qty: 5, lockedQty: 5 }), { level: 'danger', text: '无可用库存' })
  })

  it('detects batch expiry and low stock', () => {
    assert.deepEqual(getStockRisk({ qty: 10, lockedQty: 0, batchStatus: 'EXPIRED' }, '2026-07-03'), {
      level: 'danger',
      text: '批次过期',
    })
    assert.deepEqual(getStockRisk({ qty: 10, lockedQty: 0, batchStatus: 'LOCKED' }, '2026-07-03'), {
      level: 'danger',
      text: '批次受限',
    })
    assert.deepEqual(getStockRisk({ qty: 10, lockedQty: 0, batchExpiryDate: '2026-07-02' }, '2026-07-03'), {
      level: 'danger',
      text: '批次过期',
    })
    assert.deepEqual(getStockRisk({ qty: 10, lockedQty: 0, batchStatus: 'EXPIRING' }, '2026-07-03'), {
      level: 'warning',
      text: '批次临期',
    })
    assert.deepEqual(getStockRisk({ qty: 20, lockedQty: 12, safeStock: 10 }, '2026-07-03'), {
      level: 'warning',
      text: '低于安全库存',
    })
  })

  it('labels normal stock as success', () => {
    assert.deepEqual(getStockRisk({ qty: 20, lockedQty: 2, safeStock: 10 }, '2026-07-03'), {
      level: 'success',
      text: '正常',
    })
  })
})

describe('mobile stock query search and date helpers', () => {
  it('builds a stable lowercase search text', () => {
    const text = stockSearchText({
      productCode: 'P-001',
      productName: '透明外壳',
      warehouseName: '成品仓',
      locationCode: 'A-01',
      batchNo: 'B-202607',
      supplierCode: 'GYS-01',
      supplierName: '华东原料',
    })

    assert.equal(text.includes('p-001'), true)
    assert.equal(text.includes('透明外壳'), true)
    assert.equal(text.includes('成品仓'), true)
    assert.equal(text.includes('gys-01'), true)
    assert.equal(text.includes('华东原料'), true)
  })

  it('normalizes valid date-only values', () => {
    assert.equal(normalizeStockDateOnly('2026-07-03T08:30:00'), '2026-07-03')
    assert.equal(normalizeStockDateOnly('bad-date'), '')
  })

  it('formats mobile batch and supplier trace labels', () => {
    assert.equal(stockSupplierText({ supplierCode: 'GYS-01', supplierName: '华东原料' }), 'GYS-01 - 华东原料')
    assert.equal(stockSupplierText({ supplierCode: '', supplierName: '' }), '-')
    assert.equal(
      stockTraceLabel({ batchNo: 'B-202607', supplierCode: 'GYS-01', supplierName: '华东原料' }),
      '批次 B-202607 · 供应商 GYS-01 - 华东原料'
    )
    assert.equal(stockTraceLabel({ batchNo: '', supplierCode: '', supplierName: '' }), '无批次 · 供应商 -')
  })
})

function createSupabaseMock(tables) {
  return {
    from(table) {
      return {
        select() {
          return {
            order() {
              return Promise.resolve({ data: tables[table] || [], error: null })
            },
            in(key, ids) {
              const idSet = new Set((ids || []).map((id) => Number(id)))
              const data = (tables[table] || []).filter((row) => idSet.has(Number(row[key])))
              return Promise.resolve({ data, error: null })
            },
          }
        },
      }
    },
  }
}

async function loadStockWithMock(tables, params = {}) {
  const { __setSupabaseClientForTest } = await import('../frontend-mobile/src/api/supabaseClient.ts')
  const { createSupabaseRequest } = await import('../frontend-mobile/src/api/supabaseRequest.ts')
  __setSupabaseClientForTest(createSupabaseMock(tables))
  try {
    return await createSupabaseRequest().get('/stock', { params })
  } finally {
    __setSupabaseClientForTest()
  }
}

describe('mobile stock query Supabase mapping', () => {
  it('maps batch supplier into mobile stock rows and supplier keyword search', async () => {
    const res = await loadStockWithMock(
      {
        stock: [
          {
            id: 1,
            product_id: 10,
            warehouse_id: 20,
            location_id: 30,
            batch_id: 40,
            qty: 12,
            locked_qty: 2,
            updated_at: '2026-07-04T08:00:00Z',
          },
        ],
        product: [{ id: 10, code: 'P-001', name: '透明外壳', unit: 'pcs', safe_stock: 5 }],
        warehouse: [{ id: 20, name: '成品仓' }],
        warehouse_location: [{ id: 30, code: 'A-01' }],
        material_batch: [{ id: 40, batch_no: 'B-202607', supplier_id: 50, expiry_date: '2026-12-31' }],
        supplier: [{ id: 50, code: 'GYS-01', name: '华东原料' }],
      },
      { keyword: '华东原料' }
    )

    assert.equal(res.data.total, 1)
    assert.equal(res.data.records[0].supplierId, 50)
    assert.equal(res.data.records[0].supplierCode, 'GYS-01')
    assert.equal(res.data.records[0].supplierName, '华东原料')
    assert.equal(res.data.records[0].riskText, '正常')
  })

  it('keeps rows readable when a batch references a missing supplier', async () => {
    const res = await loadStockWithMock({
      stock: [
        {
          id: 2,
          product_id: 11,
          warehouse_id: 21,
          location_id: 31,
          batch_id: 41,
          qty: 8,
          locked_qty: 0,
          updated_at: '2026-07-04T08:00:00Z',
        },
      ],
      product: [{ id: 11, code: 'P-002', name: '白色端盖', unit: 'pcs', safe_stock: 0 }],
      warehouse: [{ id: 21, name: '原料仓' }],
      warehouse_location: [{ id: 31, code: 'B-01' }],
      material_batch: [{ id: 41, batch_no: 'B-202608', supplier_id: 999, expiry_date: '2026-12-31' }],
      supplier: [],
    })

    const row = res.data.records[0]
    assert.equal(row.supplierId, 999)
    assert.equal(row.supplierCode, '')
    assert.equal(row.supplierName, '')
    assert.equal(stockTraceLabel(row), '批次 B-202608 · 供应商 -')
  })
})
