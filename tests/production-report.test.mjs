import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isProdReportProcessMatch,
  normalizeProdReportProcessFilter,
  normalizeProdReportProcessName,
  validateProdReportProcessName,
} from '../frontend-admin/src/utils/production-report.ts'

describe('production report process names', () => {
  it('normalizes blank process names to the compatible injection default', () => {
    assert.equal(normalizeProdReportProcessName(''), '注塑')
    assert.equal(normalizeProdReportProcessName('  包装  '), '包装')
  })

  it('keeps blank search filters empty instead of applying the default process', () => {
    assert.equal(normalizeProdReportProcessFilter('  '), '')
    assert.equal(normalizeProdReportProcessFilter(' 注 '), '注')
  })

  it('validates required and length boundaries', () => {
    assert.equal(validateProdReportProcessName(''), '请输入工序名称')
    assert.equal(validateProdReportProcessName('A'.repeat(51)), '工序名称不能超过 50 个字符')
    assert.equal(validateProdReportProcessName('A'.repeat(50)), '')
  })

  it('matches report rows by persisted camel or snake case process fields', () => {
    assert.equal(isProdReportProcessMatch({ processName: '注塑一序' }, '注塑'), true)
    assert.equal(isProdReportProcessMatch({ process_name: '包装' }, '注塑'), false)
    assert.equal(isProdReportProcessMatch({ process_name: '' }, ''), true)
  })
})
