import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  getStockTransferStatusText,
  getTransferReceivedQty,
  getTransferRemainingQty,
  getTransferTotalQty,
  isStockTransferReceivable,
  transferItemTraceLabel,
  transferSupplierText,
  validateStockTransferReceive,
} from '../frontend-mobile/src/utils/stock-transfer.ts'

describe('mobile stock transfer status and quantity rules', () => {
  it('recognizes only shipped transfers as receivable', () => {
    assert.equal(isStockTransferReceivable('SHIPPED'), true)
    assert.equal(isStockTransferReceivable('shipped'), true)
    assert.equal(isStockTransferReceivable('DRAFT'), false)
    assert.equal(isStockTransferReceivable('RECEIVED'), false)
    assert.equal(getStockTransferStatusText('SHIPPED'), '已发出')
    assert.equal(getStockTransferStatusText('RECEIVED'), '已收货')
  })

  it('calculates total, received and remaining quantities from transfer items', () => {
    const items = [
      { qty: 20, receivedQty: 5 },
      { qty: '12', received_qty: '2' },
      { qty: null, receivedQty: 0 },
    ]

    assert.equal(getTransferTotalQty(items), 32)
    assert.equal(getTransferReceivedQty(items), 7)
    assert.equal(getTransferRemainingQty(items), 25)
  })
})

describe('mobile stock transfer receive validation', () => {
  it('allows a shipped transfer with open item quantities', () => {
    const transfer = {
      id: 10,
      status: 'SHIPPED',
      items: [{ id: 1, qty: 8, receivedQty: 0 }],
    }

    assert.equal(validateStockTransferReceive(transfer), '')
  })

  it('blocks repeated or invalid receive operations', () => {
    assert.equal(validateStockTransferReceive(null), '请选择调拨单')
    assert.equal(
      validateStockTransferReceive({ id: 10, status: 'RECEIVED', items: [{ qty: 8, receivedQty: 8 }] }),
      '调拨单已收货，不能重复确认'
    )
    assert.equal(
      validateStockTransferReceive({ id: 10, status: 'DRAFT', items: [{ qty: 8, receivedQty: 0 }] }),
      '仅已发出调拨单允许确认收货'
    )
    assert.equal(validateStockTransferReceive({ id: 10, status: 'SHIPPED', items: [] }), '调拨单缺少明细，不能确认收货')
    assert.equal(
      validateStockTransferReceive({ id: 10, status: 'SHIPPED', items: [{ qty: 0, receivedQty: 0 }] }),
      '调拨明细数量必须大于 0'
    )
    assert.equal(
      validateStockTransferReceive({ id: 10, status: 'SHIPPED', items: [{ qty: 5, receivedQty: 6 }] }),
      '已收数量不能大于调拨数量'
    )
    assert.equal(
      validateStockTransferReceive({ id: 10, status: 'SHIPPED', items: [{ qty: 5, receivedQty: 5 }] }),
      '调拨单明细已全部收货，不能重复确认'
    )
  })
})

describe('mobile stock transfer traceability display', () => {
  it('formats transfer item location, batch, supplier and remaining quantity', () => {
    const item = {
      fromLocationCode: 'A-01',
      toLocationCode: 'B-02',
      batchNo: 'B-202607',
      supplierCode: 'GYS-01',
      supplierName: '华东原料',
      qty: 20,
      receivedQty: 5,
      unit: '件',
    }

    assert.equal(transferSupplierText(item), 'GYS-01 - 华东原料')
    assert.equal(
      transferItemTraceLabel(item),
      'A-01 → B-02 · 批次 B-202607 · 供应商 GYS-01 - 华东原料 · 待收 15件'
    )
  })

  it('keeps transfer item labels readable when batch or supplier data is missing', () => {
    const item = {
      fromLocationCode: '-',
      toLocationCode: '',
      batchNo: '-',
      supplierCode: '-',
      supplierName: '-',
      qty: 3,
      receivedQty: 10,
    }

    assert.equal(transferSupplierText(item), '-')
    assert.equal(transferItemTraceLabel(item), '- → - · 无批次 · 供应商 - · 待收 0')
  })

  it('binds transfer detail cells to the traceability label formatter', () => {
    const source = readFileSync(new URL('../frontend-mobile/src/views/transfer/index.vue', import.meta.url), 'utf8')

    assert.match(source, /:label="transferItemLabel\(item\)"/)
    assert.match(source, /function transferItemLabel\(item: any\)\s*{\s*return transferItemTraceLabel\(item\)\s*}/)
  })
})

function createTransferSupabaseMock(tables) {
  function projectRows(rows, columns) {
    const text = String(columns || '*').trim()
    if (!text || text === '*') return rows
    const keys = text.split(',').map((item) => item.trim()).filter(Boolean)
    return rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])))
  }

  function matchIlike(row, key, value) {
    const pattern = String(value || '').replace(/^%|%$/g, '').toLowerCase()
    return String(row[key] || '').toLowerCase().includes(pattern)
  }

  return {
    from(table) {
      return {
        select(columns) {
          if (table === 'stock_transfer') {
            const query = {
              rows: tables.stock_transfer || [],
              eq(key, value) {
                query.rows = query.rows.filter((row) => String(row[key] || '').toUpperCase() === String(value || '').toUpperCase())
                return query
              },
              or(filter) {
                const conditions = String(filter || '').split(',').map((item) => item.trim()).filter(Boolean)
                query.rows = query.rows.filter((row) =>
                  conditions.some((condition) => {
                    const [key, operator, value] = condition.split('.')
                    return operator === 'ilike' && matchIlike(row, key, value)
                  })
                )
                return query
              },
              order(key, options = {}) {
                const direction = options.ascending === false ? -1 : 1
                query.rows = [...query.rows].sort((left, right) => String(left[key] || '').localeCompare(String(right[key] || '')) * direction)
                return query
              },
              range(from, to) {
                const filtered = query.rows
                const data = projectRows(filtered.slice(from, to + 1), columns)
                return Promise.resolve({ data, count: filtered.length, error: null })
              },
            }
            return query
          }
          if (table === 'stock_transfer_item') {
            const query = {
              in(_key, ids) {
                const idSet = new Set((ids || []).map((id) => Number(id)))
                query.rows = (tables.stock_transfer_item || []).filter((row) => idSet.has(Number(row.transfer_id)))
                return query
              },
              order() {
                return Promise.resolve({ data: projectRows(query.rows || [], columns), error: null })
              },
              rows: [],
            }
            return query
          }
          return {
            in(key, ids) {
              const idSet = new Set((ids || []).map((id) => Number(id)))
              const data = projectRows((tables[table] || []).filter((row) => idSet.has(Number(row[key]))), columns)
              return Promise.resolve({ data, error: null })
            },
          }
        },
      }
    },
  }
}

async function loadTransfersWithMock(tables, params = {}) {
  const { __setSupabaseClientForTest } = await import('../frontend-mobile/src/api/supabaseClient.ts')
  const { createSupabaseRequest } = await import('../frontend-mobile/src/api/supabaseRequest.ts')
  __setSupabaseClientForTest(createTransferSupabaseMock(tables))
  try {
    return await createSupabaseRequest().get('/stock-transfers', { params })
  } finally {
    __setSupabaseClientForTest()
  }
}

describe('mobile stock transfer Supabase mapping', () => {
  it('maps batch supplier into mobile transfer items', async () => {
    const res = await loadTransfersWithMock(
      {
        stock_transfer: [
          {
            id: 100,
            transfer_no: 'DB-001',
            from_warehouse_id: 1,
            to_warehouse_id: 2,
            status: 'SHIPPED',
            created_at: '2026-07-04T08:00:00Z',
          },
          {
            id: 101,
            transfer_no: 'DB-001-DRAFT',
            from_warehouse_id: 1,
            to_warehouse_id: 2,
            status: 'DRAFT',
            created_at: '2026-07-04T09:00:00Z',
          },
          {
            id: 102,
            transfer_no: 'DB-999',
            from_warehouse_id: 1,
            to_warehouse_id: 2,
            status: 'SHIPPED',
            created_at: '2026-07-04T10:00:00Z',
          },
        ],
        stock_transfer_item: [
          {
            id: 200,
            transfer_id: 100,
            product_id: 10,
            from_location_id: 11,
            to_location_id: 12,
            from_batch_id: 13,
            qty: 8,
            received_qty: 2,
          },
        ],
        warehouse: [
          { id: 1, name: '原料仓' },
          { id: 2, name: '车间仓' },
        ],
        product: [{ id: 10, code: 'P-001', name: '透明外壳', unit: '件' }],
        warehouse_location: [
          { id: 11, code: 'A-01' },
          { id: 12, code: 'B-02' },
        ],
        material_batch: [{ id: 13, batch_no: 'B-202607', supplier_id: 50 }],
        supplier: [{ id: 50, code: 'GYS-01', name: '华东原料' }],
      },
      { status: 'SHIPPED', keyword: 'DB-001' }
    )

    assert.equal(res.data.total, 1)
    assert.equal(res.data.records.length, 1)
    const record = res.data.records[0]
    const item = record.items[0]
    assert.equal(record.transferNo, 'DB-001')
    assert.equal(record.remainingQty, 6)
    assert.equal(item.supplierId, 50)
    assert.equal(item.supplierCode, 'GYS-01')
    assert.equal(item.supplierName, '华东原料')
    assert.equal(transferItemTraceLabel(item), 'A-01 → B-02 · 批次 B-202607 · 供应商 GYS-01 - 华东原料 · 待收 6件')
  })
})
