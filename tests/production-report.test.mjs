import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  getProdReportBadRate,
  getProdReportGoodQty,
  isProdReportOrderStatus,
  isProdReportProcessMatch,
  normalizeProdReportProcessFilter,
  normalizeProdReportProcessName,
  validateProdReportProcessName,
} from '../frontend-admin/src/utils/production-report.ts'

const source = readFileSync('frontend-admin/src/views/prod/reports.vue', 'utf8')

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

describe('production report order and quantity rules', () => {
  it('recognizes only scheduled, running and paused orders as reportable', () => {
    assert.equal(isProdReportOrderStatus('SCHEDULED'), true)
    assert.equal(isProdReportOrderStatus('running'), true)
    assert.equal(isProdReportOrderStatus('PAUSED'), true)
    assert.equal(isProdReportOrderStatus('WAITING'), false)
    assert.equal(isProdReportOrderStatus('FINISHED'), false)
    assert.equal(isProdReportOrderStatus('CANCELLED'), false)
  })

  it('calculates good quantity and bad rate safely', () => {
    assert.equal(getProdReportGoodQty({ qty: 100, badQty: 6 }), 94)
    assert.equal(getProdReportGoodQty({ qty: 3, bad_qty: 5 }), 0)
    assert.equal(getProdReportBadRate({ qty: 80, badQty: 2 }), 2.5)
    assert.equal(getProdReportBadRate({ qty: 0, badQty: 2 }), 0)
  })
})

describe('production report page delivery target', () => {
  it('keeps the page aligned with report, quality and labor closed-loop fields', () => {
    for (const marker of [
      '报工记录',
      '新增报工',
      '工单编号',
      '机台',
      '模具',
      '类型',
      '工序',
      '班次',
      '产量',
      '不良',
      '合格',
      '不良率',
      '模次',
      '工时',
      '开始时间',
      '结束时间',
    ]) {
      assert.equal(source.includes(marker), true)
    }
  })

  it('keeps visible failure feedback for report loading and write operations', () => {
    for (const marker of [
      '报工记录加载失败',
      '报工基础选项加载失败',
      '报工记录创建失败',
      '报工记录更新失败',
      '报工记录删除失败',
      'errorMessage',
      'page-alert',
    ]) {
      assert.equal(source.includes(marker), true)
    }
  })

  it('keeps guards for reportable orders and production quantity boundaries', () => {
    for (const marker of [
      'isProdReportOrderStatus',
      '产量必须是非负整数',
      '不良数量必须是非负整数',
      '不良数量不能超过产量',
      '模次必须是非负整数',
      '结束时间不能早于开始时间',
    ]) {
      assert.equal(source.includes(marker), true)
    }
  })

  it('keeps the site execution scan entry and gate checks visible before report submit', () => {
    for (const marker of [
      '扫码报工入口',
      '现场门禁',
      '扫描或输入工单号/工单 ID',
      '工艺卡',
      '首件确认',
      '齐套检查',
      '配料烘料',
      'summarizeSiteExecutionGate',
      '现场门禁未通过',
      '兼容模式允许报工',
    ]) {
      assert.equal(source.includes(marker), true)
    }
  })
})
