import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildIntegrationResult,
  convertIntegrationScale,
  inferIntegrationCodeType,
  normalizeIntegrationLabel,
  normalizeIntegrationPush,
  normalizeIntegrationScan,
  normalizeIntegrationTelemetry,
  validateIntegrationLabel,
  validateIntegrationPush,
  validateIntegrationScale,
  validateIntegrationScan,
  validateIntegrationTelemetry,
} from '../frontend-admin/src/utils/integration-center.ts'

describe('integration telemetry normalization and validation', () => {
  it('normalizes PLC telemetry into a stable payload', () => {
    const payload = normalizeIntegrationTelemetry({
      machineCode: ' IM-001 ',
      status: 'running',
      qty: '100',
      badQty: '2',
      shots: '120.9',
      reportType: '',
      shift: '',
      source: '',
      remark: '  ok  ',
    })

    assert.deepEqual(payload, {
      machineCode: 'IM-001',
      status: 'RUNNING',
      qty: 100,
      badQty: 2,
      shots: 120,
      reportType: 'OUTPUT',
      shift: 'DAY',
      source: 'WEB',
      remark: 'ok',
    })
  })

  it('rejects missing machine, invalid enum, quantity and time boundaries', () => {
    assert.equal(validateIntegrationTelemetry({ qty: 1 }), '机台编号或机台编码至少填写一个')
    assert.equal(validateIntegrationTelemetry({ machineCode: 'IM-001', status: 'BAD' }), '机台状态不在允许范围内')
    assert.equal(validateIntegrationTelemetry({ machineCode: 'IM-001', qty: 1, badQty: 2 }), '不良数不能超过产量')
    assert.equal(validateIntegrationTelemetry({ machineCode: 'IM-001', startTime: '2026-07-02', endTime: '2026-07-01' }), '结束时间不能早于开始时间')
    assert.equal(validateIntegrationTelemetry({ machineCode: 'IM-001' }), '')
  })
})

describe('integration scan and label', () => {
  it('infers and normalizes scan codes', () => {
    assert.equal(inferIntegrationCodeType('machine:IM-001'), 'MACHINE')
    assert.deepEqual(normalizeIntegrationScan({ code: 'MOLD:MO-001' }), {
      rawCode: 'MOLD:MO-001',
      code: 'MO-001',
      codeType: 'MOLD',
    })
    assert.deepEqual(normalizeIntegrationScan({ code: 'PR-001', codeType: 'product' }), {
      rawCode: 'PR-001',
      code: 'PR-001',
      codeType: 'PRODUCT',
    })
  })

  it('validates scan and label inputs', () => {
    assert.equal(validateIntegrationScan({ code: '' }), '请输入扫码内容')
    assert.equal(validateIntegrationScan({ code: 'MACHINE:' }), '扫码内容缺少业务编码')
    assert.equal(validateIntegrationScan({ code: 'UNKNOWN:1' }), '无法识别扫码类型，请选择机台、模具、产品或批次')
    assert.equal(validateIntegrationScan({ code: `MACHINE:${'A'.repeat(101)}` }), '业务编码不能超过 100 个字符')
    assert.equal(validateIntegrationScan({ code: 'MACHINE:IM-001' }), '')
    assert.equal(validateIntegrationLabel({ targetType: '', targetId: 1 }), '请选择目标类型')
    assert.equal(validateIntegrationLabel({ targetType: 'MACHINE', targetId: 0 }), '请输入有效的目标编号')
    assert.equal(validateIntegrationLabel({ targetType: 'MACHINE', targetId: 1 }), '')
    assert.deepEqual(normalizeIntegrationLabel({ targetType: 'batch', targetId: '8' }), { targetType: 'BATCH', targetId: 8 })
  })
})

describe('integration scale conversion', () => {
  it('converts gross, tare and unit weight into integer quantity', () => {
    assert.deepEqual(convertIntegrationScale({ productId: '6', grossWeight: 12.5, tareWeight: 0.5, unitWeight: 0.05 }), {
      productId: 6,
      grossWeight: 12.5,
      tareWeight: 0.5,
      netWeight: 12,
      unitWeight: 0.05,
      quantity: 240,
    })
  })

  it('validates scale boundaries', () => {
    assert.equal(validateIntegrationScale({ grossWeight: 0 }), '毛重必须大于 0')
    assert.equal(validateIntegrationScale({ grossWeight: 1, tareWeight: 2 }), '皮重不能大于毛重')
    assert.equal(validateIntegrationScale({ grossWeight: 1, unitWeight: 0 }), '单件重必须大于 0')
    assert.equal(validateIntegrationScale({ grossWeight: 1, tareWeight: 0.2 }), '')
  })
})

describe('integration push and result shape', () => {
  it('normalizes and validates push messages', () => {
    assert.deepEqual(normalizeIntegrationPush({ title: ' T ', content: ' C ', type: 'warning' }), {
      title: 'T',
      content: 'C',
      type: 'WARNING',
    })
    assert.equal(validateIntegrationPush({ title: '', content: 'C' }), '请输入标题')
    assert.equal(validateIntegrationPush({ title: 'T', content: '' }), '请输入内容')
    assert.equal(validateIntegrationPush({ title: 'T', content: 'C', type: 'BAD' }), '消息类型不在允许范围内')
    assert.equal(validateIntegrationPush({ title: 'T', content: 'C' }), '')
  })

  it('builds a stable integration result envelope', () => {
    assert.deepEqual(buildIntegrationResult('warning', '需要处理', { id: 1 }), {
      accepted: true,
      state: 'warning',
      stateText: '提示',
      summary: '需要处理',
      payload: { id: 1 },
    })
    assert.equal(buildIntegrationResult('error', '失败').accepted, false)
  })
})
