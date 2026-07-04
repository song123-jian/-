import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildSaleShipmentPayload,
  getDeliveredSaleQty,
  getMaxSingleSaleShipmentBatchQty,
  getRemainingSaleShipmentQty,
  getSaleShipmentBatchCandidates,
  getSaleShipmentCostAmount,
  getSaleShipmentSaleAmount,
  getSaleShipmentStockAvailableQty,
  getSaleShipmentStockOptionValue,
  getSaleShipmentUnitCost,
  getSelectedSaleShipmentBatch,
  getSuggestedSaleShipmentBatch,
  isSaleOrderCollectable,
  isSaleOrderShippable,
  validateSaleShipmentInput,
} from '../frontend-admin/src/utils/sale-shipment.ts'

describe('sale shipment order quantities', () => {
  it('calculates delivered, remaining and sale amount from order item', () => {
    const item = { qty: 120, deliveredQty: 35, unitPrice: 8.5 }

    assert.equal(getDeliveredSaleQty(item), 35)
    assert.equal(getRemainingSaleShipmentQty(item), 85)
    assert.equal(getSaleShipmentSaleAmount(12, item), 102)
  })

  it('normalizes shippable and collectable statuses', () => {
    assert.equal(isSaleOrderShippable('APPROVED'), true)
    assert.equal(isSaleOrderShippable('partial'), true)
    assert.equal(isSaleOrderShippable('SHIPPED'), false)
    assert.equal(isSaleOrderShippable('DRAFT'), false)

    assert.equal(isSaleOrderCollectable('SHIPPED'), true)
    assert.equal(isSaleOrderCollectable('CANCELLED'), false)
  })
})

describe('sale shipment stock batches', () => {
  const rows = [
    {
      id: 1,
      productId: 20,
      warehouseId: 3,
      batchId: 201,
      availableQty: 40,
      batchExpiryDate: '2026-10-01',
      batchProductionDate: '2026-01-01',
      unitCost: 4.12555,
    },
    {
      id: 2,
      productId: 20,
      warehouseId: 3,
      batchId: 202,
      availableQty: 90,
      batchExpiryDate: '2026-08-01',
      batchProductionDate: '2026-03-01',
      inventoryAmount: 450,
    },
    {
      id: 3,
      productId: 20,
      warehouseId: 3,
      batchId: 203,
      availableQty: 200,
      batchStatus: 'EXPIRED',
      batchExpiryDate: '2026-01-01',
    },
    {
      id: 4,
      productId: 20,
      warehouseId: 4,
      batchId: 204,
      availableQty: 999,
      batchExpiryDate: '2026-07-20',
    },
  ]

  it('filters usable batches by product, warehouse and expiry', () => {
    const candidates = getSaleShipmentBatchCandidates(rows, 20, 3, '2026-07-03')

    assert.deepEqual(candidates.map((item) => item.batchId), [202, 201])
    assert.equal(getMaxSingleSaleShipmentBatchQty(candidates), 90)
  })

  it('suggests the earliest usable batch and calculates cost', () => {
    const candidates = getSaleShipmentBatchCandidates(rows, 20, 3, '2026-07-03')
    const suggested = getSuggestedSaleShipmentBatch(candidates, 50)

    assert.equal(suggested?.batchId, 202)
    assert.equal(getSaleShipmentUnitCost(suggested, { piecePrice: 7 }), 5)
    assert.equal(getSaleShipmentUnitCost(candidates[1], { piecePrice: 7 }), 4.1255)
    assert.equal(getSaleShipmentCostAmount(11, 4.1256), 45.38)
  })
})
