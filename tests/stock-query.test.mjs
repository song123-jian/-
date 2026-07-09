import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  getStockQueryAvailableQty,
  getStockQueryRisk,
  getStockQueryRiskTag,
  summarizeStockQueryRows,
} from '../frontend-admin/src/utils/stock-query.ts'

describe('admin stock query risk rules', () => {
  it('keeps locked anomalies and negative available stock visible', () => {
    const row = { qty: 5, lockedQty: 8, safeStock: 10 }

    assert.equal(getStockQueryAvailableQty(row), -3)
    assert.deepEqual(getStockQueryRisk(row, '2026-07-04'), { level: 'danger', text: '锁定异常' })
    assert.equal(getStockQueryRiskTag('danger'), 'danger')
  })

  it('detects expired, restricted, unavailable and low stock rows', () => {
    assert.deepEqual(getStockQueryRisk({ qty: 10, lockedQty: 0, batchExpiryDate: '2026-07-01' }, '2026-07-04'), {
      level: 'danger',
      text: '批次过期',
    })
    assert.deepEqual(getStockQueryRisk({ qty: 10, lockedQty: 0, batchStatus: 'LOCKED' }, '2026-07-04'), {
      level: 'danger',
      text: '批次受限',
    })
    assert.deepEqual(getStockQueryRisk({ qty: 0, lockedQty: 0 }, '2026-07-04'), {
      level: 'danger',
      text: '无可用库存',
    })
    assert.deepEqual(getStockQueryRisk({ qty: 20, lockedQty: 12, safeStock: 10 }, '2026-07-04'), {
      level: 'warning',
      text: '低于安全库存',
    })
  })

  it('summarizes current page quantities, values and risk counts', () => {
    const summary = summarizeStockQueryRows(
      [
        { qty: 5, lockedQty: 8, safeStock: 10, inventoryAmount: 25 },
        { qty: 20, lockedQty: 12, safeStock: 10, inventoryAmount: 100 },
        { qty: 30, lockedQty: 0, batchStatus: 'NORMAL', availableQty: 30, inventoryAmount: 150 },
      ],
      '2026-07-04'
    )

    assert.deepEqual(summary, {
      recordCount: 3,
      totalQty: 55,
      lockedQty: 20,
      availableQty: 35,
      inventoryAmount: 275,
      dangerCount: 1,
      warningCount: 1,
      lowStockCount: 2,
      expiredCount: 0,
      lockedAnomalyCount: 1,
      noAvailableCount: 1,
    })
  })
})

describe('admin stock query page integration', () => {
  it('renders risk summary, row risk tags and page-level failure alert', () => {
    const source = readFileSync(new URL('../frontend-admin/src/views/stock/query.vue', import.meta.url), 'utf8')

    assert.match(source, /class="stock-risk-summary"/)
    assert.match(source, /summarizeStockQueryRows\(tableData\.value\)/)
    assert.match(source, /stockRiskText\(row\)/)
    assert.match(source, /v-if="errorMessage"/)
    assert.match(source, /库存查询失败/)
  })
})
