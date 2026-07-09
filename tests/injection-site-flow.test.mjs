import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildAndonFromFailedStartup,
  buildAndonFromFirstArticleRejection,
  buildAndonFromMaterialMixRejection,
  buildAndonFromSiteGateFailure,
  buildInjectionRecordPayload,
  buildStartupCheckResult,
  calculateInjectionOee,
  summarizeInjectionRecords,
  summarizeMoldMaintenancePlan,
  validateInjectionRecord,
} from '../frontend-admin/src/utils/injection-professional.ts'

describe('注塑现场闭环', () => {
  it('齐套检查失败时生成不通过项和安灯异常', () => {
    const result = buildStartupCheckResult({ materialReady: true, moldReady: false, machineReady: true, firstArticleOk: false, staffReady: true })
    assert.equal(result.passed, false)
    assert.deepEqual(result.failedItems, ['模具不可用', '首件未通过'])
    const andon = buildAndonFromFailedStartup({ id: 8, ...result })
    assert.equal(andon.title, '开工齐套检查未通过')
    assert.equal(andon.status, 'OPEN')
  })

  it('首件驳回、配料异常和门禁失败可派生安灯异常', () => {
    const firstArticle = buildAndonFromFirstArticleRejection({ id: 12, status: 'REJECTED', remark: '尺寸超差' })
    assert.equal(firstArticle.title, '首件确认驳回')
    assert.equal(firstArticle.sourceType, 'FIRST_ARTICLE')

    const materialMix = buildAndonFromMaterialMixRejection({ id: 13, status: 'FAILED', remark: '烘料不足' })
    assert.equal(materialMix.title, '配料烘料异常')
    assert.equal(materialMix.sourceType, 'MATERIAL_MIX')

    const gate = buildAndonFromSiteGateFailure({
      prodOrderId: 9,
      processCardStatus: 'ACTIVE',
      firstArticleStatus: 'REJECTED',
      startupStatus: 'FAILED',
      materialMixStatus: 'APPROVED',
    })
    assert.equal(gate.title, '现场开工门禁未通过')
    assert.equal(gate.level, 'CRITICAL')
    assert.match(gate.description, /首件确认未通过/)
    assert.match(gate.description, /齐套检查失败/)
  })

  it('配料回料比例和烘料时间必须有效', () => {
    assert.equal(validateInjectionRecord('material-mix', { prodOrderId: 1, materialBatchId: 2, materialQty: 50, regrindRatio: 15, dryingMinutes: 120 }), '')
    assert.equal(validateInjectionRecord('material-mix', { prodOrderId: 1, materialBatchId: 2, materialQty: 50, regrindRatio: 120 }), '回料比例必须在0-100之间')
  })

  it('维修和安灯记录能纳入未闭环统计', () => {
    const summary = summarizeInjectionRecords([
      { status: 'REPORTED' },
      { status: 'PROCESSING' },
      { status: 'CLOSED' },
      { status: 'REJECTED' },
    ])
    assert.deepEqual(summary, { total: 4, open: 3, closed: 1, risk: 2 })
  })

  it('模具保养计划按模次和寿命识别风险', () => {
    const [warning, danger] = summarizeMoldMaintenancePlan([
      { code: 'M-01', maintenanceCycle: 10000, shotsSinceMaintenance: 8500, lifetime: 100000, usedShots: 60000 },
      { code: 'M-02', maintenanceCycle: 10000, shotsSinceMaintenance: 12000, lifetime: 100000, usedShots: 98000 },
    ])
    assert.equal(warning.riskLevel, 'warning')
    assert.equal(danger.riskLevel, 'danger')
  })

  it('OEE 计算稼动率、性能效率、良品率和综合 OEE', () => {
    const oee = calculateInjectionOee({ plannedMinutes: 480, runningMinutes: 420, idealCycleSeconds: 30, actualQty: 760, goodQty: 720 })
    assert.equal(oee.availability, 87.5)
    assert.equal(oee.qualityRate, 94.74)
    assert.equal(oee.oee > 70, true)
    const payload = buildInjectionRecordPayload('oee-record', { recordDate: '2026-07-04', shift: 'DAY', machineId: 1, plannedMinutes: 480, runningMinutes: 420, idealCycleSeconds: 30, actualQty: 760, goodQty: 720 })
    assert.equal(payload.oee, oee.oee)
  })
})
