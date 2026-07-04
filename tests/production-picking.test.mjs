import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getMaxSingleBatchQty,
  getPickedMaterialAmount,
  getPickedMaterialQty,
  getPickingBatchCandidates,
  getPlannedMaterialQty,
  getRemainingMaterialQty,
  getSuggestedPickingBatch,
  isPickingOrderStatus,
} from '../frontend-admin/src/utils/production-picking.ts'

describe('production picking material quantities', () => {
  it('uses explicit order raw material quantity before product usage', () => {
    const order = { planQty: 100, rawMaterialQty: 88, pickedMaterialQty: 18, pickedMaterialAmount: 123.456 }
    const product = { rawMaterialUsage: 1.25 }

    assert.equal(getPlannedMaterialQty(order, product), 88)
    assert.equal(getPickedMaterialQty(order), 18)
    assert.equal(getPickedMaterialAmount(order), 123.46)
    assert.equal(getRemainingMaterialQty(order, product), 70)
  })

  it('calculates planned material quantity from finished product usage', () => {
    const order = { planQty: 36, pickedMaterialQty: 5 }
    const product = { rawMaterialUsage: 2.5 }

    assert.equal(getPlannedMaterialQty(order, product), 90)
    assert.equal(getRemainingMaterialQty(order, product), 85)
  })

  it('recognizes only scheduled, running and paused orders as pickable', () => {
    assert.equal(isPickingOrderStatus('SCHEDULED'), true)
    assert.equal(isPickingOrderStatus('running'), true)
    assert.equal(isPickingOrderStatus('PAUSED'), true)
    assert.equal(isPickingOrderStatus('WAITING'), false)
    assert.equal(isPickingOrderStatus('FINISHED'), false)
  })
})

describe('production picking stock batches', () => {
  const rows = [
    {
      id: 1,
      productId: 10,
      warehouseId: 2,
      batchId: 101,
      availableQty: 30,
      batchNo: 'B-101',
      batchExpiryDate: '2026-12-31',
      batchProductionDate: '2026-01-01',
      updateTime: '2026-02-01T00:00:00Z',
    },
    {
      id: 2,
      productId: 10,
      warehouseId: 2,
      batchId: 102,
      availableQty: 80,
      batchNo: 'B-102',
      batchExpiryDate: '2026-08-01',
      batchProductionDate: '2026-03-01',
      updateTime: '2026-03-01T00:00:00Z',
    },
    {
      id: 3,
      productId: 10,
      warehouseId: 2,
      batchId: 103,
      availableQty: 50,
      batchNo: 'B-103',
      batchExpiryDate: '2026-01-01',
      batchStatus: 'EXPIRED',
    },
    {
      id: 4,
      productId: 10,
      warehouseId: 2,
      batchId: 104,
      availableQty: 0,
      batchNo: 'B-104',
      batchExpiryDate: '2026-07-01',
    },
    {
      id: 5,
      productId: 10,
      warehouseId: 3,
      batchId: 105,
      availableQty: 500,
      batchNo: 'B-105',
      batchExpiryDate: '2026-07-01',
    },
  ]

  it('filters stock by product, warehouse and usable batch status', () => {
    const candidates = getPickingBatchCandidates(rows, 10, 2, '2026-07-03')

    assert.deepEqual(candidates.map((item) => item.batchId), [102, 101])
    assert.equal(getMaxSingleBatchQty(candidates), 80)
  })

  it('suggests the earliest usable single batch that can satisfy quantity', () => {
    const candidates = getPickingBatchCandidates(rows, 10, 2, '2026-07-03')

    assert.equal(getSuggestedPickingBatch(candidates, 20)?.batchId, 102)
    assert.equal(getSuggestedPickingBatch(candidates, 60)?.batchId, 102)
    assert.equal(getSuggestedPickingBatch(candidates, 100)?.batchId, 102)
  })
})
