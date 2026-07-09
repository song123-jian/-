import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const source = readFileSync('frontend-admin/src/views/prod/orders.vue', 'utf8')

describe('production order page delivery target', () => {
  it('keeps the page aligned with the production closed-loop columns', () => {
    for (const marker of ['计划数量', '完成数量', '计划用料', '已领料', '领料状态', '已入库', '入库状态', '进度']) {
      assert.equal(source.includes(marker), true)
    }
    for (const marker of ['getPlannedMaterialQty', 'getPickedMaterialQty', 'getProductionInboundStatus', 'completionPercent']) {
      assert.equal(source.includes(marker), true)
    }
  })

  it('keeps visible failure feedback for loading and write operations', () => {
    for (const marker of [
      '生产工单加载失败',
      '生产工单基础选项加载失败',
      '生产工单创建失败',
      '生产工单更新失败',
      '生产工单删除失败',
      '生产工单${text}失败',
      'errorMessage',
      'page-alert',
    ]) {
      assert.equal(source.includes(marker), true)
    }
  })

  it('keeps lifecycle guards before production order status transitions', () => {
    for (const marker of [
      '派工前必须指定机台',
      '开工前必须指定机台',
      '没有报工产量，不能直接完工',
      '工单领料未完成，不能完工',
    ]) {
      assert.equal(source.includes(marker), true)
    }
  })
})
