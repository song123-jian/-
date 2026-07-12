export const MOLD_DEVELOPMENT_STAGES = [
  { code: 'REQUIREMENT', label: '需求评审' },
  { code: 'DFM', label: 'DFM评审' },
  { code: 'DESIGN', label: '设计确认' },
  { code: 'MACHINING', label: '加工装配' },
  { code: 'T0', label: 'T0试模' },
  { code: 'T1', label: 'T1修模' },
  { code: 'T2', label: 'T2验证' },
  { code: 'ACCEPTANCE', label: '验收确认' },
  { code: 'HANDOVER', label: '量产移交' },
  { code: 'CLOSED', label: '项目关闭' },
] as const

export const MOLD_PROJECT_STATUS_OPTIONS = [
  { label: '草稿', value: 'DRAFT' },
  { label: '进行中', value: 'IN_PROGRESS' },
  { label: '试模中', value: 'TRIALING' },
  { label: '验收中', value: 'ACCEPTANCE' },
  { label: '已移交量产', value: 'MASS_PRODUCTION' },
  { label: '已关闭', value: 'CLOSED' },
  { label: '暂停', value: 'ON_HOLD' },
  { label: '已取消', value: 'CANCELLED' },
] as const

export const MOLD_TRIAL_STATUS_OPTIONS = [
  { label: '草稿', value: 'DRAFT' },
  { label: '试模中', value: 'TRIALING' },
  { label: '待确认', value: 'WAIT_CONFIRM' },
  { label: '允许量产', value: 'APPROVED_PRODUCTION' },
  { label: '需修模', value: 'REWORK' },
  { label: '已关闭', value: 'CLOSED' },
] as const

export const MOLD_TRIAL_ISSUE_SEVERITY_OPTIONS = [
  { label: '不适用', value: 'NOT_REQUIRED' },
  { label: '低', value: 'LOW' },
  { label: '中', value: 'MEDIUM' },
  { label: '高', value: 'HIGH' },
  { label: '阻断', value: 'BLOCKER' },
] as const

export const MOLD_TRIAL_ISSUE_STATUS_OPTIONS = [
  { label: '不适用', value: 'NOT_REQUIRED' },
  { label: '待整改', value: 'OPEN' },
  { label: '整改中', value: 'IN_PROGRESS' },
  { label: '待复试', value: 'WAIT_RETEST' },
  { label: '已关闭', value: 'CLOSED' },
] as const

export const MOLD_TRIAL_CORRECTION_STATUS_OPTIONS = MOLD_TRIAL_ISSUE_STATUS_OPTIONS

export const MOLD_TRIAL_RETEST_RESULT_OPTIONS = [
  { label: '不适用', value: 'NOT_REQUIRED' },
  { label: '待复试', value: 'PENDING' },
  { label: '通过', value: 'PASS' },
  { label: '失败', value: 'FAIL' },
] as const

export const MOLD_REVISION_STATUS_OPTIONS = [
  { label: '草稿', value: 'DRAFT' },
  { label: '待审批', value: 'PENDING_APPROVAL' },
  { label: '已批准', value: 'APPROVED' },
  { label: '已生效', value: 'EFFECTIVE' },
  { label: '已作废', value: 'VOID' },
] as const

export const MOLD_COMPONENT_STATUS_OPTIONS = [
  { label: '在用', value: 'ACTIVE' },
  { label: '待更换', value: 'WARNING' },
  { label: '已更换', value: 'REPLACED' },
  { label: '停用', value: 'INACTIVE' },
] as const

export const MOLD_COST_TYPE_OPTIONS = [
  { label: '设计费', value: 'DESIGN' },
  { label: '材料费', value: 'MATERIAL' },
  { label: '加工费', value: 'MACHINING' },
  { label: '试模费', value: 'TRIAL' },
  { label: '修模费', value: 'REWORK' },
  { label: '运输费', value: 'LOGISTICS' },
  { label: '其他', value: 'OTHER' },
] as const

export function buildMoldDevelopmentCode(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return `${prefix}-${stamp}-${Math.floor(Math.random() * 90 + 10)}`
}

export function textOf(value: unknown, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function numberOf(value: unknown) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

export function stageLabel(value: unknown) {
  return MOLD_DEVELOPMENT_STAGES.find((item) => item.code === String(value || '').toUpperCase())?.label || textOf(value)
}

export function statusLabel(options: ReadonlyArray<{ label: string; value: string }>, value: unknown) {
  return options.find((item) => item.value === String(value || '').toUpperCase())?.label || textOf(value)
}

export function riskTagType(value: unknown) {
  const risk = String(value || '').toUpperCase()
  if (['OVERDUE', 'REWORK', 'CRITICAL'].includes(risk)) return 'danger' as const
  if (['WARNING', 'MAINTENANCE', 'HIGH'].includes(risk)) return 'warning' as const
  if (['APPROVED', 'NORMAL', 'LOW'].includes(risk)) return 'success' as const
  return 'info' as const
}

export function nextDevelopmentStage(current: unknown) {
  const index = MOLD_DEVELOPMENT_STAGES.findIndex((item) => item.code === String(current || '').toUpperCase())
  return MOLD_DEVELOPMENT_STAGES[Math.min(index < 0 ? 0 : index + 1, MOLD_DEVELOPMENT_STAGES.length - 1)]
}

export function calculateLifeForecast(row: Record<string, any>) {
  const usedShots = numberOf(row.usedShots)
  const lifetime = numberOf(row.lifetime)
  const hasRemainingShots = row.remainingShots !== undefined && row.remainingShots !== null && row.remainingShots !== ''
  const remainingShots = Math.max(hasRemainingShots ? numberOf(row.remainingShots) : lifetime - usedShots, 0)
  const avgDailyShots = numberOf(row.avgDailyShots)
  const hasEstimatedDays = row.estimatedDaysToLife !== undefined && row.estimatedDaysToLife !== null && row.estimatedDaysToLife !== ''
  const estimatedDays = hasEstimatedDays ? numberOf(row.estimatedDaysToLife) : (avgDailyShots > 0 ? remainingShots / avgDailyShots : 0)
  const lifeRate = lifetime > 0 ? usedShots / lifetime : 0
  return {
    ...row,
    usedShots,
    lifetime,
    remainingShots,
    avgDailyShots,
    estimatedDaysToLife: estimatedDays,
    lifeRate,
    riskLevel: row.riskLevel || (lifeRate >= 1 ? 'OVERDUE' : lifeRate >= 0.9 ? 'WARNING' : 'NORMAL'),
  }
}

export type MoldTrialReleaseCheck = {
  passed: boolean
  blockers: string[]
  warnings: string[]
}

export type MoldProjectStageGateCheck = MoldTrialReleaseCheck & {
  nextStage: string
}

function isPassResult(value: unknown) {
  return ['PASS', 'OK', 'QUALIFIED', 'APPROVED'].includes(String(value || '').trim().toUpperCase())
}

function isTrue(value: unknown) {
  return value === true || ['TRUE', '1', 'YES'].includes(String(value || '').trim().toUpperCase())
}

export function validateMoldTrialIssue(row: Record<string, any>): MoldTrialReleaseCheck {
  const blockers: string[] = []
  const warnings: string[] = []
  const defectSummary = String(row.defectSummary ?? row.defect_summary ?? '').trim()

  if (!defectSummary) return { passed: true, blockers, warnings }

  const issueSeverity = String(row.issueSeverity ?? row.issue_severity ?? '').trim().toUpperCase()
  const correctionAction = String(row.correctionAction ?? row.correction_action ?? '').trim()
  const correctionStatus = String(row.correctionStatus ?? row.correction_status ?? row.issueStatus ?? row.issue_status ?? '').trim().toUpperCase()
  const retestResult = String(row.retestResult ?? row.retest_result ?? '').trim().toUpperCase()
  const closureEvidence = String(row.closureEvidence ?? row.closure_evidence ?? '').trim()

  if (!['LOW', 'MEDIUM', 'HIGH', 'BLOCKER'].includes(issueSeverity)) blockers.push('试模存在缺陷时必须填写有效问题严重度')
  if (!correctionAction) blockers.push('试模存在缺陷时必须填写整改措施')
  if (correctionStatus !== 'CLOSED') blockers.push('试模问题必须关闭后才能放行')
  if (retestResult !== 'PASS') blockers.push('试模问题复试结果必须为通过')
  if (!closureEvidence) blockers.push('试模问题关闭时必须填写关闭证据')

  return { passed: blockers.length === 0, blockers, warnings }
}

export function validateMoldTrialRelease(row: Record<string, any>, attachments: Array<Record<string, any>> = []): MoldTrialReleaseCheck {
  const blockers: string[] = []
  const warnings: string[] = []
  const stage = String(row.trialStage || row.trial_stage || '').trim().toUpperCase()
  const projectId = row.projectId ?? row.project_id
  const hasAcceptanceAttachment = attachments.some((item) => {
    const attachmentProjectId = item.projectId ?? item.project_id
    return String(item.attachmentType || item.attachment_type || '').toUpperCase() === 'ACCEPTANCE'
      && ['ACTIVE', ''].includes(String(item.status || '').toUpperCase())
      && projectId !== undefined
      && projectId !== null
      && String(attachmentProjectId) === String(projectId)
  })

  if (projectId === undefined || projectId === null || projectId === '') blockers.push('试模记录必须关联开发项目')
  if (!['T2', 'PILOT'].includes(stage)) blockers.push('必须完成 T2 或小批验证后才能放行')
  if (!isPassResult(row.dimensionResult ?? row.dimension_result)) blockers.push('尺寸结果必须为通过')
  if (!isPassResult(row.qualityResult ?? row.quality_result)) blockers.push('质量结果必须为通过')
  if (!isPassResult(row.productionResult ?? row.production_result)) blockers.push('量产结果必须为通过')
  if (!isTrue(row.firstPass ?? row.first_pass)) blockers.push('首件通过标记必须勾选')
  const issueCheck = validateMoldTrialIssue(row)
  blockers.push(...issueCheck.blockers)
  warnings.push(...issueCheck.warnings)
  if (!hasAcceptanceAttachment) blockers.push('必须登记至少一份当前项目的有效验收资料')

  return { passed: blockers.length === 0, blockers, warnings }
}

function contextRows(context: Record<string, any>, ...keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(context[key])) return context[key] as Array<Record<string, any>>
  }
  return []
}

function belongsToProject(row: Record<string, any>, projectId: unknown) {
  const rowProjectId = row.projectId ?? row.project_id
  if (rowProjectId === undefined || rowProjectId === null || rowProjectId === '') return true
  if (projectId === undefined || projectId === null || projectId === '') return true
  return String(rowProjectId) === String(projectId)
}

function hasValue(value: unknown) {
  return String(value ?? '').trim() !== ''
}

export function validateMoldProjectStageGate(
  project: Record<string, any>,
  context: Record<string, any> = {},
): MoldProjectStageGateCheck {
  const blockers: string[] = []
  const warnings: string[] = []
  const currentStage = String(project.currentStage ?? project.current_stage ?? '').trim().toUpperCase()
  const nextStage = nextDevelopmentStage(currentStage).code
  const projectId = project.id ?? project.projectId ?? project.project_id
  const milestones = contextRows(context, 'milestones', 'projectMilestones', 'project_milestones')
    .filter((row) => belongsToProject(row, projectId))
  const revisions = contextRows(context, 'revisions', 'moldRevisions', 'mold_revisions')
    .filter((row) => belongsToProject(row, projectId))
  const trials = contextRows(context, 'trials', 'trialDetails', 'trial_details')
    .filter((row) => belongsToProject(row, projectId))
  const attachments = contextRows(context, 'attachments', 'moldAttachments', 'mold_attachments')
    .filter((row) => belongsToProject(row, projectId))

  if (!MOLD_DEVELOPMENT_STAGES.some((item) => item.code === currentStage)) {
    blockers.push('项目当前阶段无效，不能推进')
  } else if (currentStage === 'CLOSED') {
    blockers.push('已关闭项目不能继续推进')
  } else if (currentStage === 'REQUIREMENT') {
    if (!hasValue(project.ownerId ?? project.owner_id)) blockers.push('需求评审必须指定负责人')
    if (!hasValue(project.plannedDueDate ?? project.planned_due_date)) blockers.push('需求评审必须填写计划交期')
    if (!hasValue(project.requirement)) blockers.push('需求评审必须填写需求说明')
  } else if (['DFM', 'MACHINING'].includes(currentStage)) {
    const hasDeliverable = milestones.some((row) => {
      const stage = String(row.stageCode ?? row.stage_code ?? '').trim().toUpperCase()
      return stage === currentStage && hasValue(row.deliverable)
    })
    if (!hasDeliverable) blockers.push(`${currentStage} 节点必须提交交付物`)
  } else if (currentStage === 'DESIGN') {
    const hasApprovedRevision = revisions.some((row) => ['EFFECTIVE', 'APPROVED'].includes(String(row.status || '').trim().toUpperCase()))
    if (!hasApprovedRevision) blockers.push('设计确认必须至少有一个已批准或已生效版本')
  } else if (['T0', 'T1'].includes(currentStage)) {
    const hasStageTrial = trials.some((row) => String(row.trialStage ?? row.trial_stage ?? '').trim().toUpperCase() === currentStage)
    if (!hasStageTrial) blockers.push(`${currentStage} 节点必须登记对应阶段试模`)

    const hasOpenSevereIssue = trials.some((row) => {
      const severity = String(row.issueSeverity ?? row.issue_severity ?? '').trim().toUpperCase()
      const status = String(row.correctionStatus ?? row.correction_status ?? row.issueStatus ?? row.issue_status ?? '').trim().toUpperCase()
      return ['HIGH', 'BLOCKER'].includes(severity) && status !== 'CLOSED'
    })
    if (hasOpenSevereIssue) blockers.push('存在未关闭的高严重度或阻断问题')
  } else if (currentStage === 'T2') {
    const hasProductionApproval = trials.some((row) => String(row.status || '').trim().toUpperCase() === 'APPROVED_PRODUCTION')
    if (!hasProductionApproval) blockers.push('T2 节点必须完成量产放行试模')
  } else if (currentStage === 'ACCEPTANCE') {
    const hasAcceptanceAttachment = attachments.some((row) => {
      const type = String(row.attachmentType ?? row.attachment_type ?? '').trim().toUpperCase()
      const status = String(row.status || '').trim().toUpperCase()
      return type === 'ACCEPTANCE' && ['ACTIVE', ''].includes(status)
    })
    if (!hasAcceptanceAttachment) blockers.push('验收节点必须提交有效验收附件')
  } else if (currentStage === 'HANDOVER') {
    if (!hasValue(project.moldId ?? project.mold_id)) blockers.push('移交前必须关联模具')
    if (!hasValue(project.productId ?? project.product_id)) blockers.push('移交前必须关联产品')
    const hasHandoverAttachment = attachments.some((row) => {
      const type = String(row.attachmentType ?? row.attachment_type ?? '').trim().toUpperCase()
      const status = String(row.status || '').trim().toUpperCase()
      return type === 'HANDOVER' && ['ACTIVE', ''].includes(status)
    })
    if (!hasHandoverAttachment) blockers.push('移交前必须提交有效移交附件')
  }

  return { passed: blockers.length === 0, blockers, warnings, nextStage }
}

export function totalOf(rows: Array<Record<string, any>>, key: string) {
  return rows.reduce((sum, row) => sum + numberOf(row[key]), 0)
}
