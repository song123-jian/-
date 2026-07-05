export type InjectionModuleKey =
  | 'process-card'
  | 'trial-mold'
  | 'material-mix'
  | 'batch-trace'
  | 'startup-check'
  | 'maintenance-order'
  | 'mold-maintenance-plan'
  | 'andon-event'
  | 'label-template'
  | 'customer-complaint'
  | 'oee-record'
  | 'process-change'
  | 'purchase-requisition'

export type InjectionFieldType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'datetime' | 'boolean'

export type InjectionFormField = {
  prop: string
  label: string
  type: InjectionFieldType
  required?: boolean
  placeholder?: string
  options?: Array<{ label: string; value: string | number | boolean }>
  min?: number
  max?: number
}

export type InjectionModuleDefinition = {
  key: InjectionModuleKey
  order: number
  title: string
  shortTitle: string
  description: string
  resource: string
  table: string
  codeField: string
  codePrefix: string
  statusOptions: Array<{ label: string; value: string }>
  listFields: InjectionFormField[]
  formFields: InjectionFormField[]
  mobileRequiredFields: string[]
}

export type InjectionAction = 'submit' | 'approve' | 'reject' | 'assign' | 'start' | 'finish' | 'close' | 'print' | 'generate'

const commonStatusOptions = [
  { label: '草稿', value: 'DRAFT' },
  { label: '已提交', value: 'SUBMITTED' },
  { label: '已审核', value: 'APPROVED' },
  { label: '已驳回', value: 'REJECTED' },
  { label: '已关闭', value: 'CLOSED' },
]

const activeStatusOptions = [
  { label: '草稿', value: 'DRAFT' },
  { label: '启用', value: 'ACTIVE' },
  { label: '停用', value: 'INACTIVE' },
  { label: '已关闭', value: 'CLOSED' },
]

const andonStatusOptions = [
  { label: '打开', value: 'OPEN' },
  { label: '已分派', value: 'ASSIGNED' },
  { label: '处理中', value: 'PROCESSING' },
  { label: '已关闭', value: 'CLOSED' },
]

const yesNoOptions = [
  { label: '是', value: true },
  { label: '否', value: false },
]

const levelOptions = [
  { label: '一般', value: 'INFO' },
  { label: '警告', value: 'WARNING' },
  { label: '严重', value: 'CRITICAL' },
]

const numberField = (prop: string, label: string, required = false): InjectionFormField => ({ prop, label, type: 'number', required })
const textField = (prop: string, label: string, required = false): InjectionFormField => ({ prop, label, type: 'text', required })
const textareaField = (prop: string, label: string): InjectionFormField => ({ prop, label, type: 'textarea' })

export const INJECTION_MODULES: InjectionModuleDefinition[] = [
  {
    key: 'process-card',
    order: 1,
    title: '工艺参数 / 工艺卡管理',
    shortTitle: '工艺卡',
    description: '维护产品、模具、机台、原料对应的标准注塑工艺参数和版本。',
    resource: 'process-cards',
    table: 'process_card',
    codeField: 'cardNo',
    codePrefix: 'PC',
    statusOptions: activeStatusOptions,
    listFields: [textField('cardNo', '工艺卡号'), textField('productId', '产品'), textField('versionNo', '版本'), textField('status', '状态')],
    formFields: [
      textField('cardNo', '工艺卡号'), numberField('productId', '产品ID', true), numberField('moldId', '模具ID'), numberField('machineId', '机台ID'),
      numberField('materialId', '原料ID'), numberField('versionNo', '版本号', true), numberField('materialTemp', '料温'), numberField('moldTemp', '模温'),
      numberField('injectionPressure', '注射压力'), numberField('holdingPressure', '保压'), numberField('coolingSeconds', '冷却秒数'), numberField('cycleSeconds', '周期秒数'),
      numberField('clampingForce', '锁模力'), numberField('backPressure', '背压'), textareaField('changeReason', '变更原因'),
    ],
    mobileRequiredFields: ['productId', 'versionNo'],
  },
  {
    key: 'trial-mold',
    order: 2,
    title: '试模 / 首件确认',
    shortTitle: '首件确认',
    description: '记录试模参数、首件质检、照片和是否允许量产。',
    resource: 'trial-mold-records',
    table: 'trial_mold_record',
    codeField: 'trialNo',
    codePrefix: 'TM',
    statusOptions: [
      { label: '待试模', value: 'WAIT_TRIAL' },
      { label: '试模中', value: 'TRIALING' },
      { label: '待确认', value: 'WAIT_CONFIRM' },
      { label: '允许量产', value: 'APPROVED_PRODUCTION' },
      { label: '驳回', value: 'REJECTED' },
    ],
    listFields: [textField('trialNo', '试模单号'), textField('prodOrderId', '工单'), textField('firstArticleResult', '首件结果'), textField('status', '状态')],
    formFields: [textField('trialNo', '试模单号'), numberField('prodOrderId', '工单ID', true), numberField('processCardId', '工艺卡ID', true), numberField('moldId', '模具ID'), numberField('machineId', '机台ID'), textField('firstArticleResult', '首件结果', true), textareaField('remark', '确认说明')],
    mobileRequiredFields: ['prodOrderId', 'processCardId', 'firstArticleResult'],
  },
  {
    key: 'material-mix',
    order: 3,
    title: '配料 / 烘料 / 回料管理',
    shortTitle: '配料烘料',
    description: '记录原料批次、回料比例、烘料温度和烘料时间。',
    resource: 'material-mix-orders',
    table: 'material_mix_order',
    codeField: 'mixNo',
    codePrefix: 'MM',
    statusOptions: commonStatusOptions,
    listFields: [textField('mixNo', '配料单'), textField('prodOrderId', '工单'), textField('materialBatchId', '原料批次'), textField('status', '状态')],
    formFields: [textField('mixNo', '配料单号'), numberField('prodOrderId', '工单ID', true), numberField('productId', '产品ID'), numberField('materialBatchId', '原料批次ID', true), numberField('materialQty', '原料用量', true), numberField('regrindRatio', '回料比例%'), numberField('dryingTemp', '烘料温度'), numberField('dryingMinutes', '烘料分钟'), textareaField('remark', '备注')],
    mobileRequiredFields: ['prodOrderId', 'materialBatchId', 'materialQty'],
  },
  {
    key: 'batch-trace',
    order: 4,
    title: '批次追溯中心',
    shortTitle: '批次追溯',
    description: '串联采购、领料、生产、质检、入库、出库和客诉的批次链路。',
    resource: 'batch-trace-links',
    table: 'batch_trace_link',
    codeField: 'traceNo',
    codePrefix: 'BT',
    statusOptions: commonStatusOptions,
    listFields: [textField('traceNo', '追溯号'), textField('sourceType', '来源'), textField('targetType', '去向'), textField('batchId', '批次')],
    formFields: [textField('traceNo', '追溯号'), textField('sourceType', '来源类型', true), numberField('sourceId', '来源ID', true), textField('targetType', '目标类型', true), numberField('targetId', '目标ID', true), numberField('batchId', '批次ID'), numberField('prodOrderId', '工单ID'), numberField('saleOrderId', '销售订单ID'), textareaField('remark', '追溯说明')],
    mobileRequiredFields: ['sourceType', 'sourceId', 'targetType', 'targetId'],
  },
  {
    key: 'startup-check',
    order: 5,
    title: '开工准备 / 齐套检查',
    shortTitle: '齐套检查',
    description: '开工前检查原料、模具、机台、工艺卡、首件和人员班次。',
    resource: 'startup-checks',
    table: 'startup_check',
    codeField: 'checkNo',
    codePrefix: 'SC',
    statusOptions: [{ label: '待检查', value: 'PENDING' }, { label: '通过', value: 'PASSED' }, { label: '不通过', value: 'FAILED' }, { label: '已关闭', value: 'CLOSED' }],
    listFields: [textField('checkNo', '检查单'), textField('prodOrderId', '工单'), textField('failedItemsText', '不通过项'), textField('status', '状态')],
    formFields: [textField('checkNo', '检查单号'), numberField('prodOrderId', '工单ID', true), numberField('processCardId', '工艺卡ID'), { prop: 'materialReady', label: '原料齐套', type: 'boolean', options: yesNoOptions }, { prop: 'moldReady', label: '模具可用', type: 'boolean', options: yesNoOptions }, { prop: 'machineReady', label: '机台可用', type: 'boolean', options: yesNoOptions }, { prop: 'firstArticleOk', label: '首件通过', type: 'boolean', options: yesNoOptions }, { prop: 'staffReady', label: '人员班次确认', type: 'boolean', options: yesNoOptions }, textareaField('remark', '备注')],
    mobileRequiredFields: ['prodOrderId'],
  },
  {
    key: 'maintenance-order',
    order: 6,
    title: '设备维修 / 备件管理',
    shortTitle: '设备维修',
    description: '故障上报、维修派工、备件消耗、完成验收和机台状态联动。',
    resource: 'maintenance-orders',
    table: 'maintenance_order',
    codeField: 'orderNo',
    codePrefix: 'MO',
    statusOptions: [{ label: '已上报', value: 'REPORTED' }, { label: '已分派', value: 'ASSIGNED' }, { label: '维修中', value: 'PROCESSING' }, { label: '已完成', value: 'FINISHED' }, { label: '已关闭', value: 'CLOSED' }],
    listFields: [textField('orderNo', '维修单'), textField('machineId', '机台'), textField('faultType', '故障'), textField('status', '状态')],
    formFields: [textField('orderNo', '维修单号'), numberField('machineId', '机台ID', true), textField('faultType', '故障类型', true), { prop: 'priority', label: '优先级', type: 'select', options: levelOptions }, numberField('assigneeId', '维修人ID'), numberField('sparePartCost', '备件费用'), textareaField('remark', '故障说明')],
    mobileRequiredFields: ['machineId', 'faultType'],
  },
  {
    key: 'mold-maintenance-plan',
    order: 7,
    title: '模具寿命 / 保养计划看板',
    shortTitle: '模具保养',
    description: '按模次、寿命、保养周期和异常次数识别待保养与逾期风险。',
    resource: 'mold-maintenance-plans',
    table: 'mold_maintenance_plan',
    codeField: 'planNo',
    codePrefix: 'MP',
    statusOptions: [{ label: '正常', value: 'NORMAL' }, { label: '待保养', value: 'WARNING' }, { label: '逾期', value: 'OVERDUE' }, { label: '已生成任务', value: 'GENERATED' }, { label: '已关闭', value: 'CLOSED' }],
    listFields: [textField('planNo', '计划号'), textField('moldId', '模具'), textField('riskLevel', '风险'), textField('status', '状态')],
    formFields: [textField('planNo', '计划号'), numberField('moldId', '模具ID', true), textField('moldCode', '模具编码'), numberField('maintenanceCycle', '保养周期模次', true), numberField('shotsSinceMaintenance', '距上次保养模次'), numberField('lifetime', '寿命模次'), numberField('usedShots', '已用模次'), numberField('abnormalCount', '异常次数'), { prop: 'lastMaintenanceDate', label: '上次保养', type: 'date' }, { prop: 'nextMaintenanceDate', label: '下次保养', type: 'date' }, textareaField('remark', '备注')],
    mobileRequiredFields: ['moldId', 'maintenanceCycle'],
  },
  {
    key: 'andon-event',
    order: 8,
    title: '安灯异常中心',
    shortTitle: '安灯异常',
    description: '现场异常统一上报、分派、处理、关闭和超时追踪。',
    resource: 'andon-events',
    table: 'andon_event',
    codeField: 'eventNo',
    codePrefix: 'AE',
    statusOptions: andonStatusOptions,
    listFields: [textField('eventNo', '异常号'), textField('title', '标题'), textField('level', '等级'), textField('status', '状态')],
    formFields: [textField('eventNo', '异常号'), textField('sourceType', '来源类型', true), numberField('sourceId', '来源ID'), { prop: 'level', label: '等级', type: 'select', options: levelOptions }, textField('title', '异常标题', true), textareaField('description', '异常描述'), numberField('assigneeId', '处理人ID')],
    mobileRequiredFields: ['sourceType', 'title'],
  },
  {
    key: 'label-template',
    order: 9,
    title: '包装 / 标签 / 条码中心',
    shortTitle: '包装标签',
    description: '维护产品码、批次码、箱标、客户标签模板和打印任务。',
    resource: 'label-templates',
    table: 'label_template',
    codeField: 'templateNo',
    codePrefix: 'LT',
    statusOptions: activeStatusOptions,
    listFields: [textField('templateNo', '模板号'), textField('name', '模板名称'), textField('targetType', '对象'), textField('status', '状态')],
    formFields: [textField('templateNo', '模板号'), textField('name', '模板名称', true), textField('targetType', '适用对象', true), textareaField('templateContent', '模板内容'), numberField('versionNo', '版本号')],
    mobileRequiredFields: ['name', 'targetType'],
  },
  {
    key: 'customer-complaint',
    order: 10,
    title: '客户投诉 / 8D 改善',
    shortTitle: '客诉8D',
    description: '客诉登记、批次证据、8D 责任闭环和关闭验证。',
    resource: 'customer-complaints',
    table: 'customer_complaint',
    codeField: 'complaintNo',
    codePrefix: 'CC',
    statusOptions: [{ label: '已登记', value: 'REGISTERED' }, { label: '分析中', value: 'ANALYZING' }, { label: '改善中', value: 'IMPROVING' }, { label: '验证中', value: 'VERIFYING' }, { label: '已关闭', value: 'CLOSED' }],
    listFields: [textField('complaintNo', '客诉号'), textField('customerId', '客户'), textField('severity', '严重度'), textField('status', '状态')],
    formFields: [textField('complaintNo', '客诉号'), numberField('customerId', '客户ID', true), numberField('productId', '产品ID'), numberField('batchId', '批次ID'), textField('severity', '严重度'), textareaField('defectDesc', '不良描述'), textareaField('correctiveAction', '纠正措施'), textareaField('preventiveAction', '预防措施')],
    mobileRequiredFields: ['customerId', 'defectDesc'],
  },
  {
    key: 'oee-record',
    order: 11,
    title: 'OEE / 机台稼动率分析',
    shortTitle: 'OEE分析',
    description: '按机台和班次记录稼动率、性能效率、良品率和 OEE。',
    resource: 'oee-records',
    table: 'oee_record',
    codeField: 'recordNo',
    codePrefix: 'OEE',
    statusOptions: commonStatusOptions,
    listFields: [textField('recordDate', '日期'), textField('machineId', '机台'), textField('shift', '班次'), textField('oee', 'OEE')],
    formFields: [{ prop: 'recordDate', label: '日期', type: 'date', required: true }, textField('shift', '班次', true), numberField('machineId', '机台ID', true), numberField('plannedMinutes', '计划分钟', true), numberField('runningMinutes', '运行分钟', true), numberField('idealCycleSeconds', '标准周期秒'), numberField('actualQty', '总产量'), numberField('goodQty', '良品数'), numberField('downtimeMinutes', '停机分钟'), numberField('changeoverMinutes', '换模分钟')],
    mobileRequiredFields: ['recordDate', 'machineId', 'plannedMinutes', 'runningMinutes'],
  },
  {
    key: 'process-change',
    order: 12,
    title: '工艺变更 / 版本管理',
    shortTitle: '工艺变更',
    description: '记录工艺卡、BOM、原料替代和模具变更的版本、原因和审批状态。',
    resource: 'process-changes',
    table: 'process_change',
    codeField: 'changeNo',
    codePrefix: 'CHG',
    statusOptions: commonStatusOptions,
    listFields: [textField('changeNo', '变更号'), textField('changeType', '类型'), textField('targetType', '对象'), textField('status', '状态')],
    formFields: [textField('changeNo', '变更号'), textField('changeType', '变更类型', true), textField('targetType', '对象类型', true), numberField('targetId', '对象ID', true), textField('oldVersion', '旧版本'), textField('newVersion', '新版本'), textareaField('reason', '变更原因'), { prop: 'effectiveAt', label: '生效时间', type: 'datetime' }],
    mobileRequiredFields: ['changeType', 'targetType', 'targetId', 'reason'],
  },
  {
    key: 'purchase-requisition',
    order: 13,
    title: '采购计划 / 请购单',
    shortTitle: '请购单',
    description: '承接 BOM/MRP 缺料结果，生成请购建议和采购状态跟踪。',
    resource: 'purchase-requisitions',
    table: 'purchase_requisition',
    codeField: 'requisitionNo',
    codePrefix: 'PR',
    statusOptions: [{ label: '草稿', value: 'DRAFT' }, { label: '已提交', value: 'SUBMITTED' }, { label: '已审核', value: 'APPROVED' }, { label: '已转采购', value: 'CONVERTED' }, { label: '已关闭', value: 'CLOSED' }],
    listFields: [textField('requisitionNo', '请购单'), textField('materialId', '物料'), textField('requestedQty', '请购量'), textField('status', '状态')],
    formFields: [textField('requisitionNo', '请购单号'), numberField('materialId', '物料ID', true), numberField('shortageQty', '缺料量'), numberField('requestedQty', '请购量', true), numberField('supplierId', '建议供应商ID'), { prop: 'expectedDate', label: '期望到货', type: 'date' }, textareaField('remark', '备注')],
    mobileRequiredFields: ['materialId', 'requestedQty'],
  },
]

export const INJECTION_MODULE_MAP = Object.fromEntries(INJECTION_MODULES.map((item) => [item.key, item])) as Record<InjectionModuleKey, InjectionModuleDefinition>

export function getInjectionModuleByKey(key?: string) {
  return INJECTION_MODULES.find((item) => item.key === key) || INJECTION_MODULES[0]
}

export function getInjectionModuleByResource(resource?: string) {
  return INJECTION_MODULES.find((item) => item.resource === resource)
}

function toNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export function buildInjectionCode(prefix: string, date: Date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${prefix}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function injectionStatusText(status?: string) {
  const normalized = normalizeText(status).toUpperCase()
  const labels: Record<string, string> = {
    DRAFT: '草稿', SUBMITTED: '已提交', APPROVED: '已审核', REJECTED: '已驳回', CLOSED: '已关闭', ACTIVE: '启用', INACTIVE: '停用',
    WAIT_TRIAL: '待试模', TRIALING: '试模中', WAIT_CONFIRM: '待确认', APPROVED_PRODUCTION: '允许量产', PENDING: '待检查', PASSED: '通过', FAILED: '不通过',
    REPORTED: '已上报', ASSIGNED: '已分派', PROCESSING: '处理中', FINISHED: '已完成', OPEN: '打开', REGISTERED: '已登记', ANALYZING: '分析中', IMPROVING: '改善中', VERIFYING: '验证中', CONVERTED: '已转采购',
    NORMAL: '正常', WARNING: '待保养', OVERDUE: '逾期', GENERATED: '已生成任务', PRINTED: '已打印',
  }
  return labels[normalized] || status || '-'
}

export function buildInjectionRecordPayload(moduleKey: InjectionModuleKey, input: Record<string, any>, now: Date = new Date()) {
  const module = INJECTION_MODULE_MAP[moduleKey]
  const payload: Record<string, any> = {}
  for (const field of module.formFields) {
    const value = input[field.prop]
    if (value === undefined || value === '') continue
    payload[field.prop] = field.type === 'number' ? toNumber(value) : value
  }
  payload[module.codeField] = normalizeText(input[module.codeField]) || buildInjectionCode(module.codePrefix, now)
  payload.status = normalizeText(input.status) || module.statusOptions[0]?.value || 'DRAFT'
  if (moduleKey === 'startup-check') {
    const result = buildStartupCheckResult(payload)
    payload.failedItems = result.failedItems
    payload.failedItemsText = result.failedItemsText
    payload.status = result.passed ? 'PASSED' : 'FAILED'
  }
  if (moduleKey === 'mold-maintenance-plan') {
    const [plan] = summarizeMoldMaintenancePlan([payload])
    payload.maintenanceRate = Number((plan.maintenanceRate * 100).toFixed(2))
    payload.lifeRate = Number((plan.lifeRate * 100).toFixed(2))
    payload.riskLevel = plan.riskLevel
    if (plan.riskLevel === 'danger') payload.status = 'OVERDUE'
    else if (plan.riskLevel === 'warning') payload.status = 'WARNING'
    else payload.status = normalizeText(input.status) || 'NORMAL'
  }
  if (moduleKey === 'oee-record') {
    Object.assign(payload, calculateInjectionOee(payload))
  }
  return payload
}

export function validateInjectionRecord(moduleKey: InjectionModuleKey, input: Record<string, any>) {
  const module = INJECTION_MODULE_MAP[moduleKey]
  for (const field of module.formFields) {
    if (field.required && (input[field.prop] === undefined || input[field.prop] === '' || input[field.prop] === null)) {
      return `请填写${field.label}`
    }
  }
  if (moduleKey === 'process-card' && toNumber(input.cycleSeconds) <= 0 && input.cycleSeconds !== undefined) return '周期秒数必须大于0'
  if (moduleKey === 'material-mix' && (toNumber(input.regrindRatio) < 0 || toNumber(input.regrindRatio) > 100)) return '回料比例必须在0-100之间'
  if (moduleKey === 'material-mix' && toNumber(input.dryingMinutes) < 0) return '烘料时间不能为负数'
  if (moduleKey === 'mold-maintenance-plan' && toNumber(input.maintenanceCycle) <= 0) return '保养周期模次必须大于0'
  if (moduleKey === 'oee-record' && toNumber(input.runningMinutes) > toNumber(input.plannedMinutes)) return '运行分钟不能大于计划分钟'
  if (moduleKey === 'purchase-requisition' && toNumber(input.requestedQty) <= 0) return '请购量必须大于0'
  return ''
}

export function getInjectionNextActions(status?: string): InjectionAction[] {
  const normalized = normalizeText(status).toUpperCase() || 'DRAFT'
  const map: Record<string, InjectionAction[]> = {
    DRAFT: ['submit'], SUBMITTED: ['approve', 'reject'], APPROVED: ['close'], REJECTED: ['submit'], OPEN: ['assign'], ASSIGNED: ['start'], PROCESSING: ['finish', 'close'],
    REPORTED: ['assign'], WAIT_TRIAL: ['start'], TRIALING: ['finish'], WAIT_CONFIRM: ['approve', 'reject'], ACTIVE: ['close'], PENDING: ['approve', 'reject'], FAILED: ['assign'],
    REGISTERED: ['assign'], ANALYZING: ['start'], IMPROVING: ['finish'], VERIFYING: ['close'], CONVERTED: ['close'], NORMAL: ['generate'],
    WARNING: ['generate', 'close'], OVERDUE: ['generate', 'close'], GENERATED: ['close'], PRINTED: ['close'],
  }
  return map[normalized] || []
}

export function summarizeInjectionRecords(rows: any[] = []) {
  return rows.reduce(
    (summary, row) => {
      const status = normalizeText(row.status).toUpperCase()
      summary.total += 1
      if (['CLOSED', 'FINISHED', 'APPROVED_PRODUCTION', 'PASSED'].includes(status)) summary.closed += 1
      else summary.open += 1
      if (['FAILED', 'REJECTED', 'OPEN', 'REPORTED'].includes(status) || normalizeText(row.level).toUpperCase() === 'CRITICAL') summary.risk += 1
      return summary
    },
    { total: 0, open: 0, closed: 0, risk: 0 },
  )
}

export function buildStartupCheckResult(input: Record<string, any>) {
  const checks = [
    ['materialReady', '原料未齐套'], ['moldReady', '模具不可用'], ['machineReady', '机台不可用'], ['firstArticleOk', '首件未通过'], ['staffReady', '人员班次未确认'],
  ] as const
  const failedItems = checks.filter(([key]) => input[key] !== true && input[key] !== 1 && input[key] !== 'true').map(([, label]) => label)
  return { passed: failedItems.length === 0, failedItems, failedItemsText: failedItems.join('、') }
}

export function canStartProductionFromInjectionGates(input: { processCardStatus?: string; firstArticleStatus?: string; startupStatus?: string }) {
  const blockers: string[] = []
  if (normalizeText(input.processCardStatus).toUpperCase() !== 'ACTIVE') blockers.push('缺少启用状态的工艺卡')
  if (normalizeText(input.firstArticleStatus).toUpperCase() !== 'APPROVED_PRODUCTION') blockers.push('首件未允许量产')
  if (normalizeText(input.startupStatus).toUpperCase() !== 'PASSED') blockers.push('开工齐套检查未通过')
  return { allowed: blockers.length === 0, blockers }
}

export function buildAndonFromFailedStartup(check: Record<string, any>) {
  const result = buildStartupCheckResult(check)
  if (result.passed) return null
  return {
    eventNo: buildInjectionCode('AE'),
    sourceType: 'STARTUP_CHECK',
    sourceId: check.id || check.checkId || 0,
    level: 'WARNING',
    title: '开工齐套检查未通过',
    description: result.failedItemsText,
    status: 'OPEN',
  }
}

export function buildBatchTraceLinks(input: { traceNo?: string; prodOrderId?: number; batchId?: number; events?: Array<{ sourceType: string; sourceId: number; targetType: string; targetId: number }> }) {
  const traceNo = input.traceNo || buildInjectionCode('BT')
  return (input.events || []).map((event, index) => ({ ...event, traceNo: `${traceNo}-${index + 1}`, prodOrderId: input.prodOrderId || 0, batchId: input.batchId || 0 }))
}

export function summarizeMoldMaintenancePlan(molds: any[] = []) {
  return molds.map((mold) => {
    const cycle = toNumber(mold.maintenanceCycle)
    const shots = toNumber(mold.shotsSinceMaintenance)
    const lifetime = toNumber(mold.lifetime)
    const used = toNumber(mold.usedShots)
    const maintenanceRate = cycle > 0 ? shots / cycle : 0
    const lifeRate = lifetime > 0 ? used / lifetime : 0
    const riskLevel = maintenanceRate >= 1 || lifeRate >= 1 ? 'danger' : maintenanceRate >= 0.8 || lifeRate >= 0.9 ? 'warning' : 'normal'
    return { ...mold, maintenanceRate, lifeRate, riskLevel, needMaintenance: riskLevel !== 'normal' }
  })
}

export function calculateInjectionOee(input: Record<string, any>) {
  const plannedMinutes = toNumber(input.plannedMinutes)
  const runningMinutes = toNumber(input.runningMinutes)
  const idealCycleSeconds = toNumber(input.idealCycleSeconds)
  const actualQty = toNumber(input.actualQty)
  const goodQty = toNumber(input.goodQty)
  const availability = plannedMinutes > 0 ? runningMinutes / plannedMinutes : 0
  const performance = runningMinutes > 0 && idealCycleSeconds > 0 ? Math.min((actualQty * idealCycleSeconds) / (runningMinutes * 60), 1.5) : 0
  const qualityRate = actualQty > 0 ? goodQty / actualQty : 0
  const oee = availability * performance * qualityRate
  const round = (value: number) => Number((value * 100).toFixed(2))
  return { availability: round(availability), performance: round(performance), qualityRate: round(qualityRate), oee: round(oee) }
}

export function buildLabelPayload(input: Record<string, any>) {
  const tokens = ['productCode', 'productName', 'batchNo', 'customerName', 'qty', 'date']
  return {
    templateNo: normalizeText(input.templateNo) || buildInjectionCode('LT'),
    name: normalizeText(input.name) || '默认箱标',
    targetType: normalizeText(input.targetType) || 'PRODUCT',
    templateContent: normalizeText(input.templateContent) || tokens.map((item) => `{{${item}}}`).join('\n'),
    versionNo: toNumber(input.versionNo) || 1,
    status: normalizeText(input.status) || 'ACTIVE',
  }
}

export function summarizeComplaint8d(input: Record<string, any>) {
  const fields = ['d1Team', 'd2Problem', 'd3Containment', 'd4RootCause', 'd5CorrectiveAction', 'd6Implementation', 'd7Prevention', 'd8Closure']
  const completed = fields.filter((field) => normalizeText(input[field]).length > 0).length
  return { completed, total: fields.length, complete: completed === fields.length, rate: Number(((completed / fields.length) * 100).toFixed(1)) }
}

export function isEightDComplete(input: Record<string, any>) {
  return summarizeComplaint8d(input).complete
}

export function buildPurchaseRequisitionSuggestion(requirement: Record<string, any>) {
  const shortageQty = Math.max(toNumber(requirement.shortageQty), 0)
  const safetyQty = Math.max(toNumber(requirement.safetyQty ?? requirement.safetyStock), 0)
  const requestedQty = Math.ceil(shortageQty + safetyQty)
  return {
    requisitionNo: buildInjectionCode('PR'),
    materialId: toNumber(requirement.materialId),
    shortageQty,
    requestedQty,
    sourceMrpNo: normalizeText(requirement.sourceMrpNo || requirement.orderNo),
    status: requestedQty > 0 ? 'DRAFT' : 'CLOSED',
  }
}
