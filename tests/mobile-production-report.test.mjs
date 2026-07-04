import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertMobileReportPiecePrice,
  chooseMobileReportPiecePrice,
  normalizeMobileReportProcessName,
  validateMobileReportProcessName,
} from '../frontend-mobile/src/utils/production-report.ts'

describe('mobile production report process pricing', () => {
  it('normalizes blank process names to injection default', () => {
    assert.equal(normalizeMobileReportProcessName(''), '注塑')
    assert.equal(normalizeMobileReportProcessName('  包装  '), '包装')
  })

  it('validates process name boundaries', () => {
    assert.equal(validateMobileReportProcessName(''), '请输入工序名称')
    assert.equal(validateMobileReportProcessName('A'.repeat(50)), '')
    assert.equal(validateMobileReportProcessName('A'.repeat(51)), '工序名称不能超过 50 个字符')
  })

  it('selects different prices by product, process, and effective date', () => {
    const rows = [
      { id: 1, product_id: 8, process_name: '注塑', price: 0.1, effective_date: '2026-01-01' },
      { id: 2, product_id: 8, process_name: '包装', price: 0.2, effective_date: '2026-01-01' },
      { id: 3, product_id: 8, process_name: '注塑', price: 0.15, effective_date: '2026-06-01' },
    ]

    assert.equal(chooseMobileReportPiecePrice(rows, 8, '包装', '2026-06-10')?.price, 0.2)
    assert.equal(chooseMobileReportPiecePrice(rows, 8, '注塑', '2026-05-31')?.price, 0.1)
    assert.equal(chooseMobileReportPiecePrice(rows, 8, '注塑', '2026-06-10')?.price, 0.15)
  })

  it('blocks posting positive good quantity when piece price is missing', () => {
    assert.throws(
      () => assertMobileReportPiecePrice(undefined, 5, 'A产品', '包装', '2026-07-04'),
      /A产品 \/ 包装 在 2026-07-04 无有效计件单价/
    )
    assert.doesNotThrow(() => assertMobileReportPiecePrice(undefined, 0, 'A产品', '包装', '2026-07-04'))
  })
})
