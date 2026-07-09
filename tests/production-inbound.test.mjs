import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  getInboundedProductionAmount,
  getInboundedProductionQty,
  getProductionInboundAmount,
  getProductionInboundStatus,
  getProductionInboundUnitCost,
  getQualifiedProductionQty,
  getRemainingProductionInboundQty,
  getRequiredMaterialQtyForInbound,
  isProductionInboundOrderStatus,
} from '../frontend-admin/src/utils/production-inbound.ts'

const source = readFileSync('frontend-admin/src/views/stock/in-produce.vue', 'utf8')

describe('production inbound quantities', () => {
  it('uses explicit qualified quantity and stored inbound totals', () => {
    const order = { qualifiedQty: 120, completedQty: 130, badQty: 20, inboundedQty: 45, inboundedAmount: 678.456 }

    assert.equal(getQualifiedProductionQty(order), 120)
    assert.equal(getInboundedProductionQty(order), 45)
    assert.equal(getInboundedProductionAmount(order), 678.46)
    assert.equal(getRemainingProductionInboundQty(order), 75)
  })

  it('falls back to completed minus bad quantity', () => {
    const order = { completedQty: 80, badQty: 6, inboundedQty: 14 }

    assert.equal(getQualifiedProductionQty(order), 74)
    assert.equal(getRemainingProductionInboundQty(order), 60)
  })

  it('calculates finished goods cost from picked material amount first', () => {
    const order = { qualifiedQty: 50, pickedMaterialAmount: 375, inboundedQty: 0 }
    const product = { piecePrice: 12.5, rawMaterialUsage: 1.2 }

    assert.equal(getProductionInboundUnitCost(order, product), 7.5)
    assert.equal(getProductionInboundAmount(12, order, product), 90)
    assert.equal(getRequiredMaterialQtyForInbound(12, product), 14.4)
  })

  it('falls back to product piece price when material cost is unavailable', () => {
    const order = { qualifiedQty: 20, pickedMaterialAmount: 0 }
    const product = { piecePrice: 9.87654 }

    assert.equal(getProductionInboundUnitCost(order, product), 9.8765)
    assert.equal(getProductionInboundAmount(3, order, product), 29.63)
  })
})

describe('production inbound page delivery target', () => {
  it('keeps the page aligned with finished-goods inbound closed-loop fields', () => {
    for (const marker of [
      '成品入库',
      '新增入库',
      '入库单号',
      '生产工单',
      '产品',
      '入库数量',
      '入库单价',
      '入库金额',
      '仓库',
      '合格产量',
      '已入库',
      '可入库',
      '预计金额',
    ]) {
      assert.equal(source.includes(marker), true)
    }
  })

  it('keeps visible failure feedback for inbound loading and submit operations', () => {
    for (const marker of [
      '成品入库记录加载失败',
      '成品入库基础选项加载失败',
      '成品入库记录刷新失败',
      '成品入库提交失败',
      'errorMessage',
      'page-alert',
    ]) {
      assert.equal(source.includes(marker), true)
    }
  })

  it('keeps guards for inboundable orders and quantity boundaries', () => {
    for (const marker of [
      'isProductionInboundOrderStatus',
      '入库数量必须是大于 0 的整数',
      '入库数量不能超过可入库数量',
      'getQualifiedProductionQty',
      'getProductionInboundUnitCost',
      'getProductionInboundAmount',
    ]) {
      assert.equal(source.includes(marker), true)
    }
  })
})

describe('production inbound statuses', () => {
  it('recognizes only running, paused and finished orders as inboundable', () => {
    assert.equal(isProductionInboundOrderStatus('RUNNING'), true)
    assert.equal(isProductionInboundOrderStatus('paused'), true)
    assert.equal(isProductionInboundOrderStatus('FINISHED'), true)
    assert.equal(isProductionInboundOrderStatus('SCHEDULED'), false)
    assert.equal(isProductionInboundOrderStatus('CANCELLED'), false)
  })

  it('labels no output, none, partial and done states', () => {
    assert.equal(getProductionInboundStatus({ completedQty: 0, badQty: 0 }), 'NO_OUTPUT')
    assert.equal(getProductionInboundStatus({ qualifiedQty: 10, inboundedQty: 0 }), 'NONE')
    assert.equal(getProductionInboundStatus({ qualifiedQty: 10, inboundedQty: 4 }), 'PARTIAL')
    assert.equal(getProductionInboundStatus({ qualifiedQty: 10, inboundedQty: 10 }), 'DONE')
  })
})
