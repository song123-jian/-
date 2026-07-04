import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildStockTransferPayload,
  getMaxSingleTransferQty,
  getSuggestedTransferStock,
  getTransferAmount,
  getTransferAvailableQty,
  getTransferStockAvailableQty,
  getTransferStockCandidates,
  getTransferStockUnitCost,
  isTransferProductEnabled,
  isTransferWarehouseEnabled,
  validateStockTransferInput,
} from '../frontend-admin/src/utils/stock-transfer.ts'
import { getLedgerRelatedOrderText } from '../frontend-admin/src/utils/stock-ledger.ts'

const stockRows = [
  {
    id: 1,
    productId: 20,
    warehouseId: 3,
    locationId: 101,
    batchId: 201,
    availableQty: 40,
    unitCost: 4.12555,
    batchNo: 'B-002',
    batchExpiryDate: '2026-10-01',
    batchStatus: 'NORMAL',
  },
  {
    id: 2,
    productId: 20,
    warehouseId: 3,
    locationId: 102,
    batchId: 202,
    qty: 120,
    lockedQty: 30,
    stockUnitCost: 5,
    batchNo: 'B-001',
    batchExpiryDate: '2026-08-01',
    batchStatus: 'NORMAL',
  },
  {
    id: 3,
    productId: 20,
    warehouseId: 3,
    batchId: 203,
    availableQty: 200,
    batchStatus: 'EXPIRED',
  },
  {
    id: 4,
    productId: 20,
    warehouseId: 4,
    batchId: 204,
    availableQty: 999,
  },
]

describe('stock transfer option and stock rules', () => {
  it('filters enabled warehouses, products and usable stock candidates', () => {
    assert.equal(isTransferWarehouseEnabled({ id: 1, isEnabled: 1 }), true)
    assert.equal(isTransferWarehouseEnabled({ id: 1, isEnabled: 0 }), false)
    assert.equal(isTransferProductEnabled({ id: 1, status: 1 }), true)
    assert.equal(isTransferProductEnabled({ id: 1, status: 0 }), false)

    const candidates = getTransferStockCandidates(stockRows, 20, 3)
    assert.deepEqual(candidates.map((item) => item.batchId), [202, 201])
    assert.equal(getTransferAvailableQty(candidates), 130)
    assert.equal(getMaxSingleTransferQty(candidates), 90)
    assert.equal(getTransferStockAvailableQty(candidates[0]), 90)
    assert.equal(getTransferStockUnitCost(candidates[1]), 4.1255)
    assert.equal(getTransferAmount(11, 4.1256), 45.38)
  })

  it('suggests the first single stock row that can satisfy quantity', () => {
    const candidates = getTransferStockCandidates(stockRows, 20, 3)

    assert.equal(getSuggestedTransferStock(candidates, 50)?.batchId, 202)
    assert.equal(getSuggestedTransferStock(candidates, 100), null)
  })
})

describe('stock transfer validation and payload', () => {
  const validInput = {
    moveNo: 'DB-20260704-001',
    productId: 20,
    warehouseId: 3,
    toWarehouseId: 5,
    qty: 12,
    remark: '  车间补料  ',
  }

  it('builds a payload with source stock location, batch, cost and transfer relation', () => {
    const candidates = getTransferStockCandidates(stockRows, 20, 3)
    const payload = buildStockTransferPayload(validInput, candidates)

    assert.deepEqual(payload, {
      moveNo: 'DB-20260704-001',
      productId: 20,
      warehouseId: 3,
      toWarehouseId: 5,
      locationId: 102,
      batchId: 202,
      toBatchId: 202,
      qty: 12,
      unitCost: 5,
      amount: 60,
      relatedOrderType: 'STOCK_TRANSFER',
      remark: '车间补料',
    })
  })

  it('rejects missing fields, same warehouse, total stock and single-batch boundaries', () => {
    const candidates = getTransferStockCandidates(stockRows, 20, 3)

    assert.equal(validateStockTransferInput({ ...validInput, productId: 0 }, candidates), '请选择产品')
    assert.equal(validateStockTransferInput({ ...validInput, warehouseId: 0 }, candidates), '请选择调出仓库')
    assert.equal(validateStockTransferInput({ ...validInput, toWarehouseId: 0 }, candidates), '请选择调入仓库')
    assert.equal(validateStockTransferInput({ ...validInput, toWarehouseId: 3 }, candidates), '调入仓库不能与调出仓库相同')
    assert.equal(validateStockTransferInput({ ...validInput, qty: 1.5 }, candidates), '调拨数量必须是大于 0 的整数')
    assert.equal(validateStockTransferInput({ ...validInput, qty: 140 }, candidates), '调拨数量不能超过可用库存')
    assert.equal(validateStockTransferInput({ ...validInput, qty: 100 }, candidates), '单批次或库位可用库存不足，请拆分调拨')
    assert.throws(() => buildStockTransferPayload({ ...validInput, qty: 100 }, candidates), /单批次或库位可用库存不足/)
  })
})

describe('stock transfer page, API and ledger integration', () => {
  it('uses shared transfer rules in the page and Supabase request adapter', () => {
    const pageSource = readFileSync(new URL('../frontend-admin/src/views/stock/transfer.vue', import.meta.url), 'utf8')
    const requestSource = readFileSync(new URL('../frontend-admin/src/api/supabaseRequest.ts', import.meta.url), 'utf8')
    const cloudSource = readFileSync(new URL('../database/supabase-cloud.sql', import.meta.url), 'utf8')

    assert.match(pageSource, /buildStockTransferPayload/)
    assert.match(pageSource, /getTransferStockCandidates/)
    assert.match(pageSource, /sourceStockOptions/)
    assert.match(requestSource, /import \{ buildStockTransferPayload \} from '..\/utils\/stock-transfer'/)
    assert.match(requestSource, /path === 'stock\/transfer'/)
    assert.match(requestSource, /async function validateStockTransferMove/)
    assert.match(requestSource, /async function createStockTransferDocument/)
    assert.match(requestSource, /relatedOrderType = 'STOCK_TRANSFER'/)
    assert.match(cloudSource, /create table if not exists public\.stock_transfer/)
    assert.match(cloudSource, /create table if not exists public\.stock_transfer_item/)
  })

  it('keeps transfer numbers visible in ledger related-order output', () => {
    assert.equal(getLedgerRelatedOrderText({ moveType: 'TRANSFER', transferNo: 'DB-001' }), 'DB-001')
  })
})
