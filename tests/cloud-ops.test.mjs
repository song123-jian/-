import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCloudOpsBackupPolicy,
  buildCloudOpsConsoleEntries,
  buildCloudOpsEnvRows,
  buildCloudOpsExportPackage,
  buildCloudOpsRecoveryChecklist,
  getCloudOpsEnvState,
} from '../frontend-admin/src/utils/cloud-ops.ts'
import { DEFAULT_SYSTEM_CONFIG } from '../frontend-admin/src/utils/system-config.ts'

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
  })

  it('keeps destructive recovery steps outside the front-end action model', () => {
    const checklist = buildCloudOpsRecoveryChecklist()
    const packageText = JSON.stringify(buildCloudOpsExportPackage())

    assert.equal(checklist.some((item) => item.risk === 'danger' && item.title === '停写窗口'), true)
    assert.equal(packageText.includes('delete'), false)
    assert.equal(packageText.includes('service_role'), false)
  })
})
