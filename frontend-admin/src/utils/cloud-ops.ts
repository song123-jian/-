import { DEFAULT_SYSTEM_CONFIG, normalizeSystemConfig, type SystemConfigForm } from './system-config.ts'

export const CLOUD_OPS_REQUIRED_ENV_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_AUTH_EMAIL_DOMAIN',
  'VITE_SUPABASE_STORAGE_BUCKET',
] as const

export type CloudOpsState = 'success' | 'warning' | 'danger' | 'info'

export type CloudOpsEnvInput = {
  hasUrl?: boolean
  hasAnonKey?: boolean
  hasAuthEmailDomain?: boolean
  hasStorageBucket?: boolean
  authEmailDomain?: string
  storageBucket?: string
}

export type CloudOpsEnvRow = {
  key: (typeof CLOUD_OPS_REQUIRED_ENV_KEYS)[number]
  required: boolean
  configured: boolean
  state: CloudOpsState
  stateText: string
  valueText: string
  description: string
}

export type CloudOpsBackupPolicy = {
  enabled: boolean
  time: string
  keepDays: number
  state: CloudOpsState
  stateText: string
  summary: string
  nextActions: string[]
}

export type CloudOpsConsoleEntry = {
  title: string
  path: string
  purpose: string
}

export type CloudOpsChecklistItem = {
  step: string
  title: string
  detail: string
  risk: CloudOpsState
}

export type CloudOpsExportPackage = {
  exportedAt: string
  environment: CloudOpsEnvRow[]
  backupPolicy: CloudOpsBackupPolicy
  consoleEntries: CloudOpsConsoleEntry[]
  recoveryChecklist: CloudOpsChecklistItem[]
}

function stateText(state: CloudOpsState) {
  const map: Record<CloudOpsState, string> = {
    success: '正常',
    warning: '待确认',
    danger: '缺失',
    info: '信息',
  }
  return map[state]
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

export function buildCloudOpsEnvRows(input: CloudOpsEnvInput = {}): CloudOpsEnvRow[] {
  const rows: CloudOpsEnvRow[] = [
    {
      key: 'VITE_SUPABASE_URL',
      required: true,
      configured: Boolean(input.hasUrl),
      state: input.hasUrl ? 'success' : 'danger',
      stateText: input.hasUrl ? stateText('success') : stateText('danger'),
      valueText: input.hasUrl ? '已配置' : '未配置',
      description: '前端直连 Supabase 项目的 URL。',
    },
    {
      key: 'VITE_SUPABASE_ANON_KEY',
      required: true,
      configured: Boolean(input.hasAnonKey),
      state: input.hasAnonKey ? 'success' : 'danger',
      stateText: input.hasAnonKey ? stateText('success') : stateText('danger'),
      valueText: input.hasAnonKey ? '已配置' : '未配置',
      description: '前端调用 Supabase 的匿名访问密钥，不在页面展示明文。',
    },
    {
      key: 'VITE_SUPABASE_AUTH_EMAIL_DOMAIN',
      required: false,
      configured: Boolean(input.hasAuthEmailDomain),
      state: input.hasAuthEmailDomain ? 'success' : 'warning',
      stateText: input.hasAuthEmailDomain ? stateText('success') : stateText('warning'),
      valueText: text(input.authEmailDomain) || 'inject-erp.example.com',
      description: '员工账号转邮箱登录时使用的默认域名。',
    },
    {
      key: 'VITE_SUPABASE_STORAGE_BUCKET',
      required: false,
      configured: Boolean(input.hasStorageBucket),
      state: input.hasStorageBucket ? 'success' : 'warning',
      stateText: input.hasStorageBucket ? stateText('success') : stateText('warning'),
      valueText: text(input.storageBucket) || 'erp-files',
      description: '质检图片、导入文件等业务附件所在存储桶。',
    },
  ]
  return rows
}

export function getCloudOpsEnvState(rows: CloudOpsEnvRow[]) {
  const missingRequired = rows.filter((row) => row.required && !row.configured)
  if (missingRequired.length) {
    return {
      state: 'danger' as CloudOpsState,
      stateText: 'Supabase 未配置',
      summary: `缺少 ${missingRequired.map((item) => item.key).join('、')}`,
    }
  }
  const warningRows = rows.filter((row) => row.state === 'warning')
  if (warningRows.length) {
    return {
      state: 'warning' as CloudOpsState,
      stateText: 'Supabase 可用，存在默认配置',
      summary: `建议补齐 ${warningRows.map((item) => item.key).join('、')}`,
    }
  }
  return {
    state: 'success' as CloudOpsState,
    stateText: 'Supabase 已连接',
    summary: '必填和运维辅助环境变量已配置。',
  }
}

export function buildCloudOpsBackupPolicy(configInput: Record<string, unknown> | SystemConfigForm = DEFAULT_SYSTEM_CONFIG): CloudOpsBackupPolicy {
  const config = normalizeSystemConfig(configInput)
  const enabled = Boolean(config.auto_backup)
  return {
    enabled,
    time: config.backup_time,
    keepDays: config.backup_keep_days,
    state: enabled ? 'success' : 'warning',
    stateText: enabled ? '策略已启用' : '策略未启用',
    summary: enabled
      ? `建议每日 ${config.backup_time} 后核对 Supabase 备份状态，保留 ${config.backup_keep_days} 天。`
      : '系统配置中未启用自动备份策略，建议在 Supabase 控制台确认项目备份计划。',
    nextActions: enabled
      ? [
          '在 Supabase Console -> Database -> Backups 核对最近一次备份时间。',
          '保留期变更后，同步确认内部审计或财务留存要求。',
          '每次版本上线前，记录当前 schema 脚本和恢复时间点。',
        ]
      : [
          '进入系统配置页启用自动备份策略。',
          '在 Supabase 控制台确认项目套餐是否支持 PITR 或定期备份。',
          '形成手工导出和恢复演练记录。',
        ],
  }
}

export function buildCloudOpsConsoleEntries(input: CloudOpsEnvInput = {}): CloudOpsConsoleEntry[] {
  const storageBucket = text(input.storageBucket) || 'erp-files'

  return [
    {
      title: '数据库备份',
      path: 'Supabase Console -> Database -> Backups',
      purpose: '核对自动备份、PITR 和恢复时间点。',
    },
    {
      title: 'SQL 初始化',
      path: 'Supabase Console -> Database -> SQL Editor',
      purpose: '执行 database/init.sql 与 database/supabase-cloud.sql。',
    },
    {
      title: '认证用户',
      path: 'Supabase Console -> Authentication -> Users',
      purpose: '核对 Auth 用户与 sys_user 映射关系。',
    },
    {
      title: '业务附件',
      path: `Supabase Console -> Storage -> Buckets -> ${storageBucket}`,
      purpose: '核对质检图片、导入文件和存储桶权限。',
    },
  ]
}

export function buildCloudOpsRecoveryChecklist(): CloudOpsChecklistItem[] {
  return [
    {
      step: '01',
      title: '停写窗口',
      detail: '确认恢复时间点和业务停写窗口一致，恢复期间暂停新增单据、库存移动和工资结算。',
      risk: 'danger',
    },
    {
      step: '02',
      title: '身份与权限',
      detail: '同步核对 sys_user、Supabase Auth 用户、角色字段和 RLS/存储策略。',
      risk: 'warning',
    },
    {
      step: '03',
      title: '数据与附件',
      detail: '确认数据库、Storage 附件和导入文件是否需要同一时间点回退。',
      risk: 'warning',
    },
    {
      step: '04',
      title: '业务链路复核',
      detail: '恢复后验证登录、销售订单、出库、回款、生产报工、库存台账和财务报表。',
      risk: 'success',
    },
  ]
}

export function buildCloudOpsExportPackage(
  envInput: CloudOpsEnvInput = {},
  configInput: Record<string, unknown> | SystemConfigForm = DEFAULT_SYSTEM_CONFIG,
  exportedAt = new Date().toISOString(),
): CloudOpsExportPackage {
  const environment = buildCloudOpsEnvRows(envInput)
  return {
    exportedAt,
    environment,
    backupPolicy: buildCloudOpsBackupPolicy(configInput),
    consoleEntries: buildCloudOpsConsoleEntries(envInput),
    recoveryChecklist: buildCloudOpsRecoveryChecklist(),
  }
}
