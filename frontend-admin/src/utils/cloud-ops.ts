import { DEFAULT_SYSTEM_CONFIG, normalizeSystemConfig, type SystemConfigForm } from './system-config.ts'
import { resolveSupabaseAuthEmailDomain } from './supabase-runtime-config.ts'

export const CLOUD_OPS_REQUIRED_ENV_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_AUTH_EMAIL_DOMAIN',
  'VITE_SUPABASE_STORAGE_BUCKET',
] as const

export type CloudOpsState = 'success' | 'warning' | 'danger' | 'info'

export type CloudOpsEnvInput = {
  url?: string
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
  coverage: string[]
  evidence: string[]
  acceptance: string
}

export type CloudOpsExportPackage = {
  exportedAt: string
  environment: CloudOpsEnvRow[]
  backupPolicy: CloudOpsBackupPolicy
  consoleEntries: CloudOpsConsoleEntry[]
  recoveryChecklist: CloudOpsChecklistItem[]
  qualityTraceabilityReadiness: QualityTraceabilityDeliveryReadiness
  coverageReport: CloudOpsCoverageReport
}

export type QualityTraceabilityReadinessInput = {
  envState?: CloudOpsState
  schemaApplied?: boolean
  validationPassed?: boolean
  browserSmokePassed?: boolean
  recoveryCoveragePassed?: boolean
}

export type QualityTraceabilityDeliveryGate = {
  key: string
  title: string
  state: CloudOpsState
  stateText: string
  summary: string
  evidence: string[]
  nextAction: string
}

export type QualityTraceabilityDeliveryReadiness = {
  state: CloudOpsState
  stateText: string
  summary: string
  gates: QualityTraceabilityDeliveryGate[]
  commands: string[]
  smokeRoutes: string[]
  coreFiles: string[]
}

export type CloudOpsCoverageStatus = 'covered' | 'pending'

export type CloudOpsCoverageReport = {
  generatedAt: string
  status: CloudOpsCoverageStatus
  summary: string
  operator: string
  restorePoint: string
  items: Array<{
    title: string
    coverage: string[]
    evidence: string[]
    acceptance: string
    status: CloudOpsCoverageStatus
    evidenceNote: string
    checkedBy: string
    checkedAt: string
    metadata: Record<string, string | boolean>
  }>
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
  const authEmailDomain = resolveSupabaseAuthEmailDomain(input.url, input.authEmailDomain)
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
      configured: Boolean(authEmailDomain),
      state: authEmailDomain ? 'success' : 'warning',
      stateText: authEmailDomain ? stateText('success') : stateText('warning'),
      valueText: authEmailDomain || '等待 VITE_SUPABASE_URL 推导',
      description: '员工账号转邮箱登录时使用的域名；未显式配置时自动采用项目 URL 的 hostname。',
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
      purpose: '全新项目仅执行一次 database/supabase-cloud.sql。',
    },
    {
      title: '认证用户',
      path: 'Supabase Console -> Authentication -> Users',
      purpose: '核对 Auth 用户与 sys_user 映射关系。',
    },
    {
      title: '用户管理函数',
      path: 'Supabase Console -> Edge Functions -> erp-user-admin',
      purpose: '部署受保护的 Auth 用户创建、更新、重置密码与删除函数。',
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
      coverage: ['数据', '业务链路'],
      evidence: ['恢复时间点', '停写开始时间', '停写结束时间', '恢复负责人'],
      acceptance: '恢复窗口内无新增业务写入，恢复时间点与备份/PITR 时间点一致。',
    },
    {
      step: '02',
      title: '身份与权限',
      detail: '同步核对 sys_user、Supabase Auth 用户、角色字段和 RLS/存储策略。',
      risk: 'warning',
      coverage: ['身份', '业务链路'],
      evidence: ['sys_user', 'Authentication Users', '角色字段', 'RLS/Storage Policy'],
      acceptance: '管理员、现场角色和只读角色均可按权限登录，越权菜单不可访问。',
    },
    {
      step: '03',
      title: '数据与附件',
      detail: '确认数据库、Storage 附件和导入文件是否需要同一时间点回退。',
      risk: 'warning',
      coverage: ['数据', '附件'],
      evidence: ['Database Backups/PITR', 'Storage Bucket', '导入文件', '质检图片'],
      acceptance: '质量记录、批次追溯、客诉附件和导入文件可打开，数据库记录与附件引用一致。',
    },
    {
      step: '04',
      title: '业务链路复核',
      detail: '恢复后验证登录、销售订单、出库、回款、生产报工、库存台账和财务报表。',
      risk: 'success',
      coverage: ['身份', '数据', '附件', '业务链路'],
      evidence: ['登录验收', '质量追溯冒烟', '库存/财务链路抽样', '操作日志'],
      acceptance: '恢复后完成核心链路抽样，页面无缺表、无空白、无未授权异常。',
    },
  ]
}

export function buildCloudOpsExportPackage(
  envInput: CloudOpsEnvInput = {},
  configInput: Record<string, unknown> | SystemConfigForm = DEFAULT_SYSTEM_CONFIG,
  exportedAt = new Date().toISOString(),
): CloudOpsExportPackage {
  const environment = buildCloudOpsEnvRows(envInput)
  const envState = getCloudOpsEnvState(environment)
  return {
    exportedAt,
    environment,
    backupPolicy: buildCloudOpsBackupPolicy(configInput),
    consoleEntries: buildCloudOpsConsoleEntries(envInput),
    recoveryChecklist: buildCloudOpsRecoveryChecklist(),
    qualityTraceabilityReadiness: buildQualityTraceabilityDeliveryReadiness({
      envState: envState.state,
    }),
    coverageReport: buildCloudOpsCoverageReport({
      generatedAt: exportedAt,
    }),
  }
}

export function buildCloudOpsCoverageReport(input: Partial<CloudOpsCoverageReport> = {}): CloudOpsCoverageReport {
  const generatedAt = text(input.generatedAt) || new Date().toISOString()
  const operator = text(input.operator)
  const restorePoint = text(input.restorePoint)
  const sourceItems = Array.isArray(input.items) && input.items.length
    ? input.items
    : buildCloudOpsRecoveryChecklist().map((item) => ({
        title: item.title,
        coverage: item.coverage,
        evidence: item.evidence,
        acceptance: item.acceptance,
        status: 'pending' as CloudOpsCoverageStatus,
        evidenceNote: '',
        checkedBy: '',
        checkedAt: '',
        metadata: {},
      }))
  const items = sourceItems.map((item) => ({
    title: text(item.title) || '未命名覆盖项',
    coverage: Array.isArray(item.coverage) ? item.coverage.map(text).filter(Boolean) : [],
    evidence: Array.isArray(item.evidence) ? item.evidence.map(text).filter(Boolean) : [],
    acceptance: text(item.acceptance),
    status: item.status === 'covered' ? 'covered' as CloudOpsCoverageStatus : 'pending' as CloudOpsCoverageStatus,
    evidenceNote: text(item.evidenceNote),
    checkedBy: text(item.checkedBy),
    checkedAt: text(item.checkedAt),
    metadata: item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
      ? Object.fromEntries(
          Object.entries(item.metadata)
            .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
            .map(([key, value]) => [key, typeof value === 'boolean' ? value : text(value)]),
        )
      : {},
  }))
  const coveredCount = items.filter((item) => item.status === 'covered').length
  const status: CloudOpsCoverageStatus = items.length > 0 && coveredCount === items.length ? 'covered' : 'pending'
  return {
    generatedAt,
    status,
    summary: status === 'covered'
      ? `恢复覆盖已闭环：${coveredCount}/${items.length} 项。`
      : `恢复覆盖待补齐：${coveredCount}/${items.length} 项已闭环。`,
    operator,
    restorePoint,
    items,
  }
}

export function parseCloudOpsCoveragePackage(raw: unknown): CloudOpsCoverageReport {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw as any
  const report = data?.coverageReport || data
  if (!report || typeof report !== 'object') {
    throw new Error('覆盖包格式错误')
  }
  return buildCloudOpsCoverageReport(report)
}

export const QUALITY_TRACEABILITY_SMOKE_ROUTES = [
  '/qc/records',
  '/qc/records?action=create&checkType=IPQC',
  '/qc/process-inspection',
  '/qc/defect-disposal',
  '/qc/defect-analysis',
  '/injection/batch-trace',
  '/injection/customer-complaint',
] as const

export const QUALITY_TRACEABILITY_CORE_FILES = [
  'database/init.sql',
  'database/supabase-cloud.sql',
  'frontend-admin/src/api/supabaseRequest.ts',
  'frontend-admin/src/views/qc/records.vue',
  'frontend-admin/src/views/qc/process-inspection.vue',
  'frontend-admin/src/views/qc/defect-disposal.vue',
  'frontend-admin/src/views/qc/defect-analysis.vue',
  'frontend-admin/src/utils/injection-professional.ts',
  'tests/quality-traceability-delivery.test.mjs',
] as const

function deliveryStateText(state: CloudOpsState) {
  if (state === 'success') return '已通过'
  if (state === 'danger') return '阻断'
  if (state === 'warning') return '待确认'
  return '信息'
}

export function buildQualityTraceabilityDeliveryReadiness(
  input: QualityTraceabilityReadinessInput = {},
): QualityTraceabilityDeliveryReadiness {
  const envState = input.envState || 'warning'
  const schemaState: CloudOpsState = input.schemaApplied ? 'success' : 'warning'
  const validationState: CloudOpsState = input.validationPassed === false ? 'danger' : input.validationPassed ? 'success' : 'warning'
  const smokeState: CloudOpsState = input.browserSmokePassed === false ? 'danger' : input.browserSmokePassed ? 'success' : 'warning'
  const recoveryState: CloudOpsState = input.recoveryCoveragePassed === false ? 'danger' : input.recoveryCoveragePassed ? 'success' : 'warning'
  const gates: QualityTraceabilityDeliveryGate[] = [
    {
      key: 'supabase-env',
      title: 'Supabase 运行环境',
      state: envState,
      stateText: deliveryStateText(envState),
      summary: envState === 'success'
        ? '管理端已具备连接 Supabase 云库的运行配置。'
        : '需要补齐或复核 VITE_SUPABASE_URL、VITE_SUPABASE_ANON_KEY 与附件存储桶配置。',
      evidence: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_STORAGE_BUCKET'],
      nextAction: '在 .env.local 或生产环境变量中补齐 Supabase 运行配置后重新检查。',
    },
    {
      key: 'qc-schema',
      title: '质量追溯云库结构',
      state: schemaState,
      stateText: deliveryStateText(schemaState),
      summary: input.schemaApplied
        ? 'qc_record 与不良处置字段已按交付口径确认。'
        : '本地迁移脚本已具备 qc_record 与处置字段，云端既有库上线前需执行并确认。',
      evidence: [
        'database/supabase-cloud.sql',
        'qc_record',
        'disposal_status',
        'disposal_assignee',
        'disposal_close_reason',
        'disposal_updated_at',
      ],
      nextAction: '在 Supabase SQL Editor 执行 database/supabase-cloud.sql，并确认 qc_record 四个处置字段存在。',
    },
    {
      key: 'quality-workflow',
      title: '质量追溯业务闭环',
      state: 'success',
      stateText: deliveryStateText('success'),
      summary: '质检录入、IPQC 巡检、不良处置、不良分析、批次追溯和客诉 8D 已形成同一闭环。',
      evidence: [...QUALITY_TRACEABILITY_SMOKE_ROUTES],
      nextAction: '按页面顺序完成一条不合格记录从录入到关闭的业务抽样。',
    },
    {
      key: 'automated-validation',
      title: '自动化验收命令',
      state: validationState,
      stateText: deliveryStateText(validationState),
      summary: input.validationPassed
        ? '编码、测试和构建命令已完成并达到验收标准。'
        : '上线前必须重新执行质量追溯专用验证命令。',
      evidence: ['npm run verify:quality-traceability', 'npm test', 'npm run build'],
      nextAction: '执行 npm run verify:quality-traceability，并保留终端输出作为交付证据。',
    },
    {
      key: 'browser-smoke',
      title: '浏览器冒烟验收',
      state: smokeState,
      stateText: deliveryStateText(smokeState),
      summary: input.browserSmokePassed
        ? '核心质量追溯路由已完成非空页面和控制台错误检查。'
        : '上线前需以管理员或现场角色访问核心路由，确认页面非空且无运行时错误。',
      evidence: [...QUALITY_TRACEABILITY_SMOKE_ROUTES],
      nextAction: '按冒烟路由清单逐页打开，确认可见错误仅为环境配置提示或真实业务空态。',
    },
    {
      key: 'recovery-coverage',
      title: '恢复覆盖清单',
      state: recoveryState,
      stateText: deliveryStateText(recoveryState),
      summary: input.recoveryCoveragePassed
        ? '恢复前检查已覆盖数据、身份、附件和业务链路四类对象。'
        : '恢复演练前必须确认数据、身份、附件和业务链路同步纳入检查。',
      evidence: ['数据', '身份', '附件', '业务链路'],
      nextAction: '导出云库运维清单，按恢复前检查清单逐项留存负责人、时间点和验收截图。',
    },
  ]
  const priority: Record<CloudOpsState, number> = { danger: 3, warning: 2, info: 1, success: 0 }
  const state = gates.reduce<CloudOpsState>((current, gate) => (
    priority[gate.state] > priority[current] ? gate.state : current
  ), 'success')

  return {
    state,
    stateText: state === 'success' ? '质量追溯可交付' : state === 'danger' ? '质量追溯存在阻断项' : '质量追溯待上线确认',
    summary: state === 'success'
      ? '质量追溯实施、迁移、验证和冒烟证据已满足交付使用。'
      : `仍有 ${gates.filter((gate) => gate.state !== 'success').length} 项需要处理或复核。`,
    gates,
    commands: [
      'npm run check-encoding',
      'node --test tests/quality-traceability-delivery.test.mjs tests/quality-board.test.mjs tests/mobile-qc-record.test.mjs tests/injection-traceability.test.mjs',
      'npm test',
      'npm run build',
      'npm run verify:quality-traceability',
    ],
    smokeRoutes: [...QUALITY_TRACEABILITY_SMOKE_ROUTES],
    coreFiles: [...QUALITY_TRACEABILITY_CORE_FILES],
  }
}
