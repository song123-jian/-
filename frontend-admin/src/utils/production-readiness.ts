export type ReadinessSeverity = 'passed' | 'warning' | 'blocked'

export type ProductionReadinessStatus = 'READY' | 'WARNING' | 'BLOCKED'

export type ProductionReadinessCheck = {
  key: string
  label: string
  severity: ReadinessSeverity
  message: string
  detail: string
}

export type ProductionReadinessResult = {
  orderId: number
  orderNo: string
  status: ProductionReadinessStatus
  statusText: string
  canStart: boolean
  score: number
  blockers: string[]
  warnings: string[]
  checks: ProductionReadinessCheck[]
}

export type ProductionReadinessInput = {
  order?: Record<string, any> | null
  product?: Record<string, any> | null
  machine?: Record<string, any> | null
  mold?: Record<string, any> | null
  processCard?: Record<string, any> | null
  firstArticle?: Record<string, any> | null
  startupCheck?: Record<string, any> | null
  materialMix?: Record<string, any> | null
  stockRows?: Record<string, any>[]
  today?: string | Date | null
}

const CLOSED_ORDER_STATUSES = new Set(['FINISHED', 'COMPLETED', 'DONE', 'CANCELLED', 'CLOSED'])
const BAD_MASTER_STATUSES = new Set(['0', 'FALSE', 'INACTIVE', 'DISABLED', 'STOPPED', 'SCRAP', 'SCRAPPED'])
const BAD_MACHINE_STATUSES = new Set(['REPAIR', 'MAINTENANCE', 'DOWN', 'FAULT', 'INACTIVE', 'STOPPED', 'DISABLED'])
const BAD_MOLD_STATUSES = new Set(['REPAIR', 'MAINTENANCE', 'SCRAP', 'SCRAPPED', 'INACTIVE', 'DISABLED'])
const PASS_PROCESS_CARD_STATUSES = new Set(['ACTIVE', 'APPROVED'])
const PASS_FIRST_ARTICLE_STATUSES = new Set(['APPROVED_PRODUCTION', 'PASSED', 'APPROVED'])
const PASS_STARTUP_STATUSES = new Set(['PASSED'])
const PASS_MATERIAL_MIX_STATUSES = new Set(['APPROVED', 'CLOSED', 'FINISHED', 'PASSED'])
const BLOCKED_MATERIAL_MIX_STATUSES = new Set(['REJECTED', 'FAILED'])

function toNumber(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function normalizeText(value: unknown, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeStatus(value: unknown) {
  return normalizeText(value).toUpperCase()
}

function normalizeDateOnly(value?: string | Date | null) {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function enabledStatus(row?: Record<string, any> | null) {
  const status = normalizeStatus(row?.status ?? row?.isEnabled ?? row?.enabled)
  return !status || !BAD_MASTER_STATUSES.has(status)
}

function check(label: string, severity: ReadinessSeverity, message: string, detail = '', key = label): ProductionReadinessCheck {
  return { key, label, severity, message, detail }
}

function plannedMaterialQty(order: Record<string, any>, product?: Record<string, any> | null) {
  const explicit = toNumber(order.rawMaterialQty ?? order.raw_material_qty)
  if (explicit > 0) return explicit
  const usage = toNumber(product?.rawMaterialUsage ?? product?.raw_material_usage)
  const planQty = toNumber(order.planQty ?? order.plan_qty ?? order.quantity)
  return usage > 0 && planQty > 0 ? usage * planQty : 0
}

function pickedMaterialQty(order: Record<string, any>) {
  return toNumber(order.pickedMaterialQty ?? order.picked_material_qty)
}

function availableMaterialQty(product?: Record<string, any> | null, stockRows: Record<string, any>[] = []) {
  const rawMaterialId = toNumber(product?.rawMaterialId ?? product?.raw_material_id)
  if (!rawMaterialId) return 0
  return stockRows.reduce((sum, row) => {
    const productId = toNumber(row.productId ?? row.product_id)
    if (productId !== rawMaterialId) return sum
    const qty = toNumber(row.availableQty ?? row.available_qty ?? row.qty)
    const lockedQty = toNumber(row.lockedQty ?? row.locked_qty)
    return sum + (row.availableQty === undefined && row.available_qty === undefined ? Math.max(qty - lockedQty, 0) : qty)
  }, 0)
}

function statusCheck(
  label: string,
  row: Record<string, any> | null | undefined,
  passStatuses: Set<string>,
  missingMessage: string,
  pendingMessage: string,
  blockedStatuses = new Set<string>(),
) {
  if (!row) return check(label, 'warning', missingMessage, '', label)
  const status = normalizeStatus(row.status)
  if (passStatuses.has(status)) return check(label, 'passed', `${label}已通过`, status, label)
  if (blockedStatuses.has(status)) return check(label, 'blocked', pendingMessage, status, label)
  return check(label, 'warning', pendingMessage, status || '未记录', label)
}

function summarizeStatus(checks: ProductionReadinessCheck[]) {
  const blockers = checks.filter((item) => item.severity === 'blocked').map((item) => item.message)
  const warnings = checks.filter((item) => item.severity === 'warning').map((item) => item.message)
  const passed = checks.filter((item) => item.severity === 'passed').length
  const status: ProductionReadinessStatus = blockers.length ? 'BLOCKED' : warnings.length ? 'WARNING' : 'READY'
  return {
    status,
    statusText: getProductionReadinessStatusText(status),
    canStart: status === 'READY',
    score: checks.length ? Math.round((passed / checks.length) * 100) : 0,
    blockers,
    warnings,
  }
}

export function getProductionReadinessStatusText(status: ProductionReadinessStatus | string) {
  if (status === 'READY') return '可投产'
  if (status === 'WARNING') return '需确认'
  if (status === 'BLOCKED') return '不可投产'
  return String(status || '-')
}

export function getProductionReadinessSeverityText(severity: ReadinessSeverity | string) {
  if (severity === 'passed') return '通过'
  if (severity === 'warning') return '待确认'
  if (severity === 'blocked') return '阻断'
  return String(severity || '-')
}

export function buildProductionReadiness(input: ProductionReadinessInput = {}): ProductionReadinessResult {
  const order = input.order || {}
  const product = input.product || null
  const machine = input.machine || null
  const mold = input.mold || null
  const today = normalizeDateOnly(input.today || new Date())
  const orderStatus = normalizeStatus(order.status)
  const checks: ProductionReadinessCheck[] = []

  if (!toNumber(order.id)) {
    checks.push(check('生产工单', 'blocked', '未找到生产工单', '', 'order'))
  } else if (CLOSED_ORDER_STATUSES.has(orderStatus)) {
    checks.push(check('生产工单', 'blocked', '工单已关闭，不允许投产', orderStatus, 'order'))
  } else {
    checks.push(check('生产工单', 'passed', '工单处于可检查状态', orderStatus || 'WAITING', 'order'))
  }

  if (!toNumber(order.productId ?? order.product_id)) {
    checks.push(check('产品档案', 'blocked', '工单未选择产品', '', 'product'))
  } else if (!product) {
    checks.push(check('产品档案', 'blocked', '未找到产品档案', '', 'product'))
  } else if (!enabledStatus(product)) {
    checks.push(check('产品档案', 'blocked', '产品档案已停用', normalizeStatus(product.status), 'product'))
  } else {
    checks.push(check('产品档案', 'passed', '产品档案可用', normalizeText(product.code || product.name), 'product'))
  }

  if (!toNumber(order.machineId ?? order.machine_id)) {
    checks.push(check('机台', 'blocked', '未指定生产机台', '', 'machine'))
  } else if (!machine) {
    checks.push(check('机台', 'blocked', '未找到机台档案', '', 'machine'))
  } else if (BAD_MACHINE_STATUSES.has(normalizeStatus(machine.status))) {
    checks.push(check('机台', 'blocked', '机台处于不可用状态', normalizeStatus(machine.status), 'machine'))
  } else {
    checks.push(check('机台', 'passed', '机台可用', normalizeText(machine.code || machine.name || machine.status), 'machine'))
  }

  if (!toNumber(order.moldId ?? order.mold_id)) {
    checks.push(check('模具', 'blocked', '未指定生产模具', '', 'mold'))
  } else if (!mold) {
    checks.push(check('模具', 'blocked', '未找到模具档案', '', 'mold'))
  } else if (BAD_MOLD_STATUSES.has(normalizeStatus(mold.status))) {
    checks.push(check('模具', 'blocked', '模具处于维修、保养或报废状态', normalizeStatus(mold.status), 'mold'))
  } else {
    const lifetime = toNumber(mold.lifetime)
    const usedShots = toNumber(mold.usedShots ?? mold.used_shots)
    const maintenanceCycle = toNumber(mold.maintenanceCycle ?? mold.maintenance_cycle)
    const shotsSinceMaintenance = toNumber(mold.shotsSinceMaintenance ?? mold.shots_since_maintenance)
    if (lifetime > 0 && usedShots >= lifetime) {
      checks.push(check('模具', 'blocked', '模具寿命已到期', `${usedShots}/${lifetime}`, 'mold'))
    } else if (maintenanceCycle > 0 && shotsSinceMaintenance >= maintenanceCycle) {
      checks.push(check('模具', 'blocked', '模具保养已超期', `${shotsSinceMaintenance}/${maintenanceCycle}`, 'mold'))
    } else if ((lifetime > 0 && usedShots >= lifetime * 0.9) || (maintenanceCycle > 0 && shotsSinceMaintenance >= maintenanceCycle * 0.8)) {
      checks.push(check('模具', 'warning', '模具接近寿命或保养阈值', `${usedShots}/${lifetime || '-'}；${shotsSinceMaintenance}/${maintenanceCycle || '-'}`, 'mold'))
    } else {
      checks.push(check('模具', 'passed', '模具可用', normalizeText(mold.code || mold.name || mold.status), 'mold'))
    }
  }

  const plannedQty = plannedMaterialQty(order, product)
  const pickedQty = pickedMaterialQty(order)
  const availableQty = availableMaterialQty(product, input.stockRows || [])
  if (plannedQty <= 0) {
    checks.push(check('原料齐套', 'warning', '未配置原料用量，需人工确认', '', 'material'))
  } else if (pickedQty >= plannedQty) {
    checks.push(check('原料齐套', 'passed', '生产领料已满足计划用量', `${pickedQty}/${plannedQty}`, 'material'))
  } else if (pickedQty + availableQty >= plannedQty) {
    checks.push(check('原料齐套', 'warning', '原料库存可补足，但尚未完成领料', `已领 ${pickedQty}，可用 ${availableQty}，计划 ${plannedQty}`, 'material'))
  } else {
    checks.push(check('原料齐套', 'blocked', '原料已领加可用库存不足', `已领 ${pickedQty}，可用 ${availableQty}，计划 ${plannedQty}`, 'material'))
  }

  checks.push(statusCheck('工艺卡', input.processCard, PASS_PROCESS_CARD_STATUSES, '未找到启用工艺卡', '工艺卡未启用'))
  checks.push(statusCheck('首件确认', input.firstArticle, PASS_FIRST_ARTICLE_STATUSES, '未找到首件确认记录', '首件未允许量产', new Set(['REJECTED', 'FAILED'])))
  checks.push(statusCheck('齐套检查单', input.startupCheck, PASS_STARTUP_STATUSES, '未执行开工齐套检查', '齐套检查未通过', new Set(['FAILED', 'REJECTED'])))
  checks.push(statusCheck('配料烘料', input.materialMix, PASS_MATERIAL_MIX_STATUSES, '未找到配料烘料记录', '配料烘料未审核', BLOCKED_MATERIAL_MIX_STATUSES))

  const planEnd = normalizeDateOnly(order.planEnd ?? order.plan_end)
  if (planEnd && today && planEnd < today && !CLOSED_ORDER_STATUSES.has(orderStatus)) {
    checks.push(check('计划时间', 'warning', '工单计划已延期', planEnd, 'planTime'))
  } else {
    checks.push(check('计划时间', 'passed', '计划时间未发现延期风险', planEnd || '未设置', 'planTime'))
  }

  return {
    orderId: toNumber(order.id),
    orderNo: normalizeText(order.orderNo ?? order.order_no, `#${toNumber(order.id) || '-'}`),
    ...summarizeStatus(checks),
    checks,
  }
}

function sameId(left: unknown, right: unknown) {
  const leftId = toNumber(left)
  const rightId = toNumber(right)
  return leftId > 0 && rightId > 0 && leftId === rightId
}

function latestByStatusAndTime(rows: Record<string, any>[]) {
  return [...rows].sort((left, right) => {
    const leftStatus = normalizeStatus(left.status)
    const rightStatus = normalizeStatus(right.status)
    const leftPass = ['ACTIVE', 'APPROVED', 'PASSED', 'APPROVED_PRODUCTION', 'CLOSED', 'FINISHED'].includes(leftStatus) ? 0 : 1
    const rightPass = ['ACTIVE', 'APPROVED', 'PASSED', 'APPROVED_PRODUCTION', 'CLOSED', 'FINISHED'].includes(rightStatus) ? 0 : 1
    return leftPass - rightPass || String(right.updatedAt || right.createdAt || right.id || '').localeCompare(String(left.updatedAt || left.createdAt || left.id || ''))
  })[0] || null
}

export function buildProductionReadinessFromLists(input: ProductionReadinessInput & {
  products?: Record<string, any>[]
  machines?: Record<string, any>[]
  molds?: Record<string, any>[]
  processCards?: Record<string, any>[]
  firstArticles?: Record<string, any>[]
  startupChecks?: Record<string, any>[]
  materialMixOrders?: Record<string, any>[]
}) {
  const order = input.order || {}
  const product = input.product || (input.products || []).find((row) => sameId(row.id, order.productId ?? order.product_id))
  const machine = input.machine || (input.machines || []).find((row) => sameId(row.id, order.machineId ?? order.machine_id))
  const mold = input.mold || (input.molds || []).find((row) => sameId(row.id, order.moldId ?? order.mold_id))
  const processCards = (input.processCards || []).filter((row) => {
    const productHit = sameId(row.productId ?? row.product_id, order.productId ?? order.product_id)
    const moldHit = !order.moldId && !order.mold_id ? true : sameId(row.moldId ?? row.mold_id, order.moldId ?? order.mold_id)
    return productHit && moldHit
  })
  const firstArticles = (input.firstArticles || []).filter((row) => sameId(row.prodOrderId ?? row.prod_order_id, order.id))
  const startupChecks = (input.startupChecks || []).filter((row) => sameId(row.prodOrderId ?? row.prod_order_id, order.id))
  const materialMixOrders = (input.materialMixOrders || []).filter((row) => sameId(row.prodOrderId ?? row.prod_order_id, order.id))

  return buildProductionReadiness({
    ...input,
    product,
    machine,
    mold,
    processCard: input.processCard || latestByStatusAndTime(processCards),
    firstArticle: input.firstArticle || latestByStatusAndTime(firstArticles),
    startupCheck: input.startupCheck || latestByStatusAndTime(startupChecks),
    materialMix: input.materialMix || latestByStatusAndTime(materialMixOrders),
  })
}
