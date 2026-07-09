import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  buildCloudOpsBackupPolicy,
  buildCloudOpsConsoleEntries,
  buildCloudOpsCoverageReport,
  buildCloudOpsEnvRows,
  buildCloudOpsExportPackage,
  buildCloudOpsRecoveryChecklist,
  buildQualityTraceabilityDeliveryReadiness,
  getCloudOpsEnvState,
  parseCloudOpsCoveragePackage,
  QUALITY_TRACEABILITY_SMOKE_ROUTES,
} from '../frontend-admin/src/utils/cloud-ops.ts'
import { DEFAULT_SYSTEM_CONFIG } from '../frontend-admin/src/utils/system-config.ts'

const read = (path) => readFileSync(path, 'utf8')

describe('cloud ops environment state', () => {
  it('marks missing required Supabase URL and key as a blocking configuration risk', () => {
    const rows = buildCloudOpsEnvRows({
      hasAuthEmailDomain: true,
      hasStorageBucket: true,
      authEmailDomain: 'erp.example.com',
      storageBucket: 'erp-private-files',
    })
    const state = getCloudOpsEnvState(rows)

    assert.equal(rows.length, 4)
    assert.equal(rows.find((row) => row.key === 'VITE_SUPABASE_URL').state, 'danger')
    assert.equal(rows.find((row) => row.key === 'VITE_SUPABASE_ANON_KEY').valueText, '未配置')
    assert.equal(state.state, 'danger')
    assert.match(state.summary, /VITE_SUPABASE_URL/)
    assert.match(state.summary, /VITE_SUPABASE_ANON_KEY/)
  })

  it('keeps optional defaults visible while warning operators to confirm them', () => {
    const rows = buildCloudOpsEnvRows({
      hasUrl: true,
      hasAnonKey: true,
    })
    const state = getCloudOpsEnvState(rows)

    assert.equal(rows.find((row) => row.key === 'VITE_SUPABASE_AUTH_EMAIL_DOMAIN').valueText, 'inject-erp.example.com')
    assert.equal(rows.find((row) => row.key === 'VITE_SUPABASE_STORAGE_BUCKET').valueText, 'erp-files')
    assert.equal(state.state, 'warning')
    assert.equal(state.stateText, 'Supabase 可用，存在默认配置')
  })

  it('reports a complete runtime environment without exposing URL or API key values', () => {
    const rows = buildCloudOpsEnvRows({
      hasUrl: true,
      hasAnonKey: true,
      hasAuthEmailDomain: true,
      hasStorageBucket: true,
      authEmailDomain: 'corp.example.com',
      storageBucket: 'quality-images',
    })
    const state = getCloudOpsEnvState(rows)

    assert.equal(state.state, 'success')
    assert.equal(rows.find((row) => row.key === 'VITE_SUPABASE_URL').valueText, '已配置')
    assert.equal(rows.find((row) => row.key === 'VITE_SUPABASE_ANON_KEY').valueText, '已配置')
    assert.equal(rows.find((row) => row.key === 'VITE_SUPABASE_STORAGE_BUCKET').valueText, 'quality-images')
  })
})

describe('cloud ops backup policy and console entries', () => {
  it('normalizes enabled backup policy into an auditable checklist', () => {
    const policy = buildCloudOpsBackupPolicy({
      ...DEFAULT_SYSTEM_CONFIG,
      auto_backup: 'true',
      backup_time: '2:5',
      backup_keep_days: '60',
    })

    assert.equal(policy.enabled, true)
    assert.equal(policy.state, 'success')
    assert.equal(policy.time, '02:05')
    assert.equal(policy.keepDays, 60)
    assert.equal(policy.nextActions.length, 3)
  })

  it('flags disabled backup policy as an operational warning', () => {
    const policy = buildCloudOpsBackupPolicy({
      ...DEFAULT_SYSTEM_CONFIG,
      auto_backup: false,
      backup_keep_days: 0,
    })

    assert.equal(policy.enabled, false)
    assert.equal(policy.state, 'warning')
    assert.equal(policy.keepDays, 1)
    assert.match(policy.summary, /未启用自动备份策略/)
  })

  it('uses the configured storage bucket in console and export paths', () => {
    const entries = buildCloudOpsConsoleEntries({ storageBucket: 'private-qc-assets' })

    assert.equal(entries.find((item) => item.title === '业务附件').path, 'Supabase Console -> Storage -> Buckets -> private-qc-assets')
  })
})

describe('cloud ops export package', () => {
  it('builds a stable export package for recovery drills', () => {
    const payload = buildCloudOpsExportPackage(
      {
        hasUrl: true,
        hasAnonKey: true,
        hasAuthEmailDomain: true,
        hasStorageBucket: true,
        authEmailDomain: 'corp.example.com',
        storageBucket: 'private-qc-assets',
      },
      {
        ...DEFAULT_SYSTEM_CONFIG,
        auto_backup: true,
        backup_time: '03:30',
        backup_keep_days: 45,
      },
      '2026-07-04T00:00:00.000Z',
    )

    assert.equal(payload.exportedAt, '2026-07-04T00:00:00.000Z')
    assert.equal(payload.environment.length, 4)
    assert.equal(payload.backupPolicy.time, '03:30')
    assert.equal(payload.consoleEntries.find((item) => item.title === '业务附件').path.endsWith('private-qc-assets'), true)
    assert.equal(payload.recoveryChecklist.length, 4)
    assert.equal(payload.qualityTraceabilityReadiness.gates.length, 6)
    assert.equal(payload.coverageReport.items.length, 4)
    assert.equal(payload.recoveryChecklist.every((item) => item.coverage.length && item.evidence.length && item.acceptance), true)
  })

  it('keeps destructive recovery steps outside the front-end action model', () => {
    const checklist = buildCloudOpsRecoveryChecklist()
    const packageText = JSON.stringify(buildCloudOpsExportPackage())

    assert.equal(checklist.some((item) => item.risk === 'danger' && item.title === '停写窗口'), true)
    assert.equal(packageText.includes('delete'), false)
    assert.equal(packageText.includes('service_role'), false)
  })
})

describe('quality traceability delivery readiness', () => {
  it('summarizes a fully verified quality traceability delivery as ready', () => {
    const readiness = buildQualityTraceabilityDeliveryReadiness({
      envState: 'success',
      schemaApplied: true,
      validationPassed: true,
      browserSmokePassed: true,
      recoveryCoveragePassed: true,
    })

    assert.equal(readiness.state, 'success')
    assert.equal(readiness.gates.length, 6)
    assert.equal(readiness.gates.some((gate) => gate.key === 'recovery-coverage'), true)
    assert.equal(readiness.commands.includes('npm run verify:quality-traceability'), true)
    assert.equal(readiness.smokeRoutes.includes('/qc/records?action=create&checkType=IPQC'), true)
    assert.equal(readiness.coreFiles.includes('database/supabase-cloud.sql'), true)
  })

  it('keeps cloud schema confirmation visible when the live Supabase project has not been proven', () => {
    const readiness = buildQualityTraceabilityDeliveryReadiness({
      envState: 'success',
      validationPassed: true,
      browserSmokePassed: true,
      recoveryCoveragePassed: true,
    })
    const schemaGate = readiness.gates.find((gate) => gate.key === 'qc-schema')

    assert.equal(readiness.state, 'warning')
    assert.equal(schemaGate.state, 'warning')
    assert.equal(schemaGate.evidence.includes('disposal_status'), true)
    assert.deepEqual(readiness.smokeRoutes, [...QUALITY_TRACEABILITY_SMOKE_ROUTES])
  })
})

describe('cloud ops recovery coverage package', () => {
  it('round-trips a coverage report without granting destructive credentials', () => {
    const report = buildCloudOpsCoverageReport({
      generatedAt: '2026-07-06T00:00:00.000Z',
      operator: '运维负责人',
      restorePoint: '2026-07-06 08:00',
      items: buildCloudOpsRecoveryChecklist().map((item) => ({
        title: item.title,
        coverage: item.coverage,
        evidence: item.evidence,
        acceptance: item.acceptance,
        status: 'covered',
        evidenceNote: item.title === '停写窗口' ? '停写通知、恢复窗口、抽查记录已留档' : '验收证据已留档',
        checkedBy: '运维负责人',
        checkedAt: '2026-07-06T08:30:00.000Z',
        metadata: item.title === '停写窗口'
          ? {
              writeStopStart: '2026-07-06 07:50:00',
              writeStopEnd: '2026-07-06 08:30:00',
              writeFreezeConfirmed: true,
            }
          : {},
      })),
    })
    const parsed = parseCloudOpsCoveragePackage(JSON.stringify({ coverageReport: report }))
    const text = JSON.stringify(parsed)

    assert.equal(parsed.status, 'covered')
    assert.equal(parsed.items.length, 4)
    assert.equal(parsed.summary.includes('4/4'), true)
    assert.equal(parsed.items.find((item) => item.title === '停写窗口').metadata.writeFreezeConfirmed, true)
    assert.equal(parsed.items.find((item) => item.title === '停写窗口').evidenceNote.includes('停写通知'), true)
    assert.equal(text.includes('service_role'), false)
  })
})

describe('cloud ops recovery execution page', () => {
  it('keeps write-freeze and identity-permission evidence editable on the backup page', () => {
    const page = read('frontend-admin/src/views/system/backup.vue')

    assert.equal(page.includes('恢复闭环执行'), true)
    assert.equal(page.includes('停写开始'), true)
    assert.equal(page.includes('停写结束'), true)
    assert.equal(page.includes('停写窗口内无新增单据、库存移动、生产报工和工资结算'), true)
    assert.equal(page.includes('管理员账号可登录并访问系统管理'), true)
    assert.equal(page.includes('现场角色、只读角色和越权菜单已抽查'), true)
    assert.equal(page.includes('RLS/Storage 策略和业务附件权限已复核'), true)
    assert.equal(page.includes('applyCoverageReportToDraft'), true)
    assert.equal(page.includes('syncCoverageDraft'), true)
  })
})
