import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (path) => readFileSync(path, 'utf8')

const sources = {
  routeConfig: read('frontend-admin/src/router/route-config.ts'),
  qcRecords: read('frontend-admin/src/views/qc/records.vue'),
  processInspection: read('frontend-admin/src/views/qc/process-inspection.vue'),
  defectDisposal: read('frontend-admin/src/views/qc/defect-disposal.vue'),
  defectAnalysis: read('frontend-admin/src/views/qc/defect-analysis.vue'),
  injectionModule: read('frontend-admin/src/views/injection/module.vue'),
  injectionProfessional: read('frontend-admin/src/utils/injection-professional.ts'),
  supabaseRequest: read('frontend-admin/src/api/supabaseRequest.ts'),
  cloudOps: read('frontend-admin/src/utils/cloud-ops.ts'),
  cloudOpsPage: read('frontend-admin/src/views/system/backup.vue'),
  initSql: read('database/init.sql'),
  cloudSql: read('database/supabase-cloud.sql'),
  packageJson: read('package.json'),
}

function assertIncludes(source, marker, label) {
  assert.equal(source.includes(marker), true, `${label} missing marker: ${marker}`)
}

function assertNotIncludes(source, marker, label) {
  assert.equal(source.includes(marker), false, `${label} should not include marker: ${marker}`)
}

function assertAll(label, source, markers) {
  for (const marker of markers) assertIncludes(source, marker, label)
}

describe('quality traceability delivery target', () => {
  it('keeps all quality traceability child pages registered under one menu', () => {
    assertAll('quality route config', sources.routeConfig, [
      "path: '/qc'",
      "title: '质量追溯'",
      "view: 'qc/records.vue'",
      'qualityRoutes.processInspection',
      'qualityRoutes.defectDisposal',
      "view: 'qc/defect-analysis.vue'",
      'injectionRoutes.batchTrace',
      'injectionRoutes.customerComplaint',
    ])
  })

  it('makes qc records the guarded quality data entry point', () => {
    assertAll('qc records page', sources.qcRecords, [
      'errorMessage',
      'page-alert',
      ':loading="submitting"',
      'failureText',
      '不合格质检必须填写缺陷类型',
      '不合格质检必须填写缺陷描述',
      '不合格质检必须填写大于 0 的不良数量',
      '不良数量不能超过抽样数量',
      "route.query.action === 'create'",
      "handleAdd({ checkType: queryCheckType })",
    ])
    assertAll('qc record backend', sources.supabaseRequest, [
      'function assertQcRecordTraceable',
      '抽样数量必须大于 0',
      '不良数量不能超过抽样数量',
      '不合格质检必须填写缺陷类型',
      "disposal_status: checkResult === 'FAIL' ? 'OPEN' : 'CLOSED'",
    ])
  })

  it('keeps process inspection as an IPQC-focused entry with visible failure feedback', () => {
    assertAll('process inspection page', sources.processInspection, [
      '过程巡检加载失败',
      'page-alert',
      "checkType: 'IPQC'",
      "router.push({ path: '/qc/records', query: { action: 'create', checkType: 'IPQC' } })",
    ])
  })

  it('persists defect disposal workflow to Supabase instead of local storage', () => {
    assertAll('defect disposal page', sources.defectDisposal, [
      'updateQcRecord',
      'disposalStatus',
      'disposalAssignee',
      'disposalCloseReason',
      'disposalUpdatedAt',
      '不良品处置状态保存失败',
      '关闭不良品处置必须填写处置结果',
      'page-alert',
    ])
    assertNotIncludes(sources.defectDisposal, 'localStorage', 'defect disposal page')
    assertNotIncludes(sources.defectDisposal, 'STORAGE_KEY', 'defect disposal page')
    assertAll('qc record schema', sources.initSql, [
      'disposal_status VARCHAR(32)',
      'disposal_assignee VARCHAR(100)',
      'disposal_close_reason TEXT',
      'disposal_updated_at TIMESTAMP',
    ])
    assertAll('qc cloud schema', sources.cloudSql, [
      'create table if not exists public.qc_record',
      'disposal_status varchar(32)',
      'disposal_assignee varchar(100)',
      'disposal_close_reason text',
      'disposal_updated_at timestamp',
    ])
    assertAll('supabase qc columns', sources.supabaseRequest, [
      'disposal_status',
      'disposal_assignee',
      'disposal_close_reason',
      'disposal_updated_at',
    ])
  })

  it('keeps defect analysis readable when data fails or is empty', () => {
    assertAll('defect analysis page', sources.defectAnalysis, [
      '不良分析加载失败',
      'page-alert',
      '暂无不良类型数据',
      '暂无不良趋势数据',
      'ElMessage.error',
      'buildCharts([])',
    ])
  })

  it('keeps batch traceability and customer 8D closed-loop gates in quality traceability scope', () => {
    assertAll('batch trace module', sources.injectionProfessional, [
      "key: 'batch-trace'",
      "resource: 'batch-trace-links'",
      'sourceType',
      'targetType',
      'batchId',
    ])
    assertAll('customer 8D module', sources.injectionProfessional, [
      "key: 'customer-complaint'",
      'D1 团队',
      'D2 问题描述',
      'D3 临时围堵',
      'D4 根因分析',
      'D5 永久纠正',
      'D6 实施验证',
      'D7 预防再发',
      'D8 关闭确认',
      '客诉8D关闭前必须完整填写 D1-D8',
    ])
    assertAll('customer 8D backend gate', sources.supabaseRequest, [
      "route.table === 'customer_complaint' && action === 'close'",
      'isEightDComplete(toCamelDeep(data))',
      '客诉8D关闭前必须完整填写 D1-D8',
    ])
    assertAll('shared module feedback', sources.injectionModule, [
      'errorMessage',
      'page-alert',
      '保存失败',
      '删除失败',
      '流转权限',
    ])
  })

  it('exposes a quality traceability delivery readiness gate for handoff use', () => {
    assertAll('cloud ops quality readiness model', sources.cloudOps, [
      'buildQualityTraceabilityDeliveryReadiness',
      'QUALITY_TRACEABILITY_SMOKE_ROUTES',
      'QUALITY_TRACEABILITY_CORE_FILES',
      'npm run verify:quality-traceability',
      '/qc/records?action=create&checkType=IPQC',
      'database/supabase-cloud.sql',
      'disposal_status',
    ])
    assertAll('cloud ops quality readiness page', sources.cloudOpsPage, [
      'qualityReadiness',
      'buildQualityTraceabilityDeliveryReadiness',
      '质量追溯交付就绪',
      '验收命令',
      '冒烟路由',
    ])
    assertAll('quality traceability verify script', sources.packageJson, [
      '"verify:quality-traceability"',
      'tests/quality-traceability-delivery.test.mjs',
      'tests/mobile-qc-record.test.mjs',
      'npm run build',
    ])
  })
})
