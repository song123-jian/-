import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  INJECTION_MODULES,
  buildInjectionRecordPayload,
  canStartProductionFromInjectionGates,
  getInjectionNextActions,
  validateInjectionRecord,
} from '../frontend-admin/src/utils/injection-professional.ts'

describe('注塑专业工艺与首件闭环', () => {
  it('按 1-13 顺序提供完整模块定义', () => {
    assert.equal(INJECTION_MODULES.length, 13)
    assert.deepEqual(INJECTION_MODULES.map((item) => item.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    assert.equal(INJECTION_MODULES[0].key, 'process-card')
    assert.equal(INJECTION_MODULES[12].key, 'purchase-requisition')
  })

  it('校验工艺卡并生成版本化工艺参数载荷', () => {
    assert.equal(validateInjectionRecord('process-card', { productId: 1, versionNo: 1, cycleSeconds: 28 }), '')
    assert.equal(validateInjectionRecord('process-card', { productId: 1, versionNo: 1, cycleSeconds: 0 }), '周期秒数必须大于0')
    const payload = buildInjectionRecordPayload('process-card', { productId: 1, versionNo: 2, cycleSeconds: 28, status: 'ACTIVE' }, new Date('2026-07-04T08:00:00'))
    assert.equal(payload.cardNo, 'PC-20260704-080000')
    assert.equal(payload.status, 'ACTIVE')
  })

  it('开工前必须满足工艺卡、首件和齐套检查三道门', () => {
    const blocked = canStartProductionFromInjectionGates({ processCardStatus: 'ACTIVE', firstArticleStatus: 'WAIT_CONFIRM', startupStatus: 'PASSED' })
    assert.equal(blocked.allowed, false)
    assert.deepEqual(blocked.blockers, ['首件未允许量产'])
    const allowed = canStartProductionFromInjectionGates({ processCardStatus: 'ACTIVE', firstArticleStatus: 'APPROVED_PRODUCTION', startupStatus: 'PASSED' })
    assert.equal(allowed.allowed, true)
  })

  it('状态流转覆盖提交、审核、分派、开始、完成和关闭', () => {
    assert.deepEqual(getInjectionNextActions('DRAFT'), ['submit'])
    assert.deepEqual(getInjectionNextActions('SUBMITTED'), ['approve', 'reject'])
    assert.deepEqual(getInjectionNextActions('ASSIGNED'), ['start'])
    assert.deepEqual(getInjectionNextActions('PROCESSING'), ['finish', 'close'])
    assert.deepEqual(getInjectionNextActions('WARNING'), ['generate', 'close'])
    assert.deepEqual(getInjectionNextActions('GENERATED'), ['close'])
  })
})
