export type BusinessWarningLevel = 'WARNING' | 'ERROR'
export type BusinessWarningCategory = '库存' | '模具'

export type BusinessWarningItem = {
  id: string
  category: BusinessWarningCategory
  level: BusinessWarningLevel
  type: string
  title: string
  targetName: string
  value: string | number
  threshold: string | number
  message: string
  targetType: 'stock' | 'product' | 'mold'
  targetId?: number
  actionPath?: string
}

export type BusinessWarningSummary = {
  total: number
  warning: number
  error: number
  stock: number
  mold: number
}

export type BusinessWarningConfig = {
  stockWarningEnabled?: boolean | string | number | null
  stockExpiryWarningDays?: number | string | null
  moldMaintenanceWarningRatio?: number | string | null
  moldLifetimeWarningRatio?: number | string | null
  today?: string | Date | null
}

export type BusinessStockWarningRow = {
  id?: number | string | null
  productId?: number | string | null
  productCode?: string | null
  productName?: string | null
  productUnit?: string | null
  warehouseName?: string | null
  locationCode?: string | null
  batchId?: number | string | null
  batchNo?: string | null
  batchStatus?: string | null
  batchExpiryDate?: string | Date | null
  qty?: number | string | null
  lockedQty?: number | string | null
  availableQty?: number | string | null
  safeStock?: number | string | null
}

export type BusinessMoldWarningRow = {
  id?: number | string | null
  code?: string | null
  name?: string | null
  status?: string | null
  usedShots?: number | string | null
  lifetime?: number | string | null
  shotsSinceMaintenance?: number | string | null
  maintenanceCycle?: number | string | null
}

export type BuildBusinessWarningsInput = {
  stockRows?: BusinessStockWarningRow[]
  moldRows?: BusinessMoldWarningRow[]
  config?: BusinessWarningConfig | Record<string, any>
}

function toWarningNumber(value: any) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function toPositiveInt(value: any, fallback: number) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return fallback
  return Math.floor(num)
}

function toRatio(value: any, fallback: number) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return fallback
  return num > 1 ? num / 100 : num
}

function toBoolean(value: any, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback
  const text = String(value).trim().toLowerCase()
  if (['false', '0', 'no', 'off', 'disabled'].includes(text)) return false
  if (['true', '1', 'yes', 'on', 'enabled'].includes(text)) return true
  return fallback
}

function normalizeDateOnly(value?: string | Date | null) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const text = String(value || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  return Number.isNaN(new Date(`${text}T00:00:00`).getTime()) ? '' : text
}

function dateDiffDays(left: string, right: string) {
  const leftTime = new Date(`${left}T00:00:00`).getTime()
  const rightTime = new Date(`${right}T00:00:00`).getTime()
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0
  return Math.ceil((leftTime - rightTime) / 86400000)
}

function normalizeStatus(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

function displayName(...values: Array<string | number | null | undefined>) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || '-'
}

function formatQty(value: number, unit?: string | null) {
  const rounded = Number(value.toFixed(2))
  return `${rounded}${unit || ''}`
}

export function normalizeBusinessWarningConfig(config: BusinessWarningConfig | Record<string, any> = {}) {
  const raw = config as Record<string, any>
  return {
    stockWarningEnabled: toBoolean(config.stockWarningEnabled ?? raw.stock_warning_enabled, true),
    stockExpiryWarningDays: toPositiveInt(config.stockExpiryWarningDays ?? raw.stock_expiry_warning_days, 30),
    moldMaintenanceWarningRatio: toRatio(
      config.moldMaintenanceWarningRatio ?? raw.mold_maintenance_warning_ratio,
      0.8
    ),
    moldLifetimeWarningRatio: toRatio(config.moldLifetimeWarningRatio ?? raw.mold_lifetime_warning_ratio, 0.9),
    today: normalizeDateOnly(config.today as any) || normalizeDateOnly(new Date()),
  }
}

export function summarizeBusinessWarnings(warnings: BusinessWarningItem[]): BusinessWarningSummary {
  return warnings.reduce(
    (summary, item) => {
      summary.total += 1
      if (item.level === 'ERROR') summary.error += 1
      if (item.level === 'WARNING') summary.warning += 1
      if (item.category === '库存') summary.stock += 1
      if (item.category === '模具') summary.mold += 1
      return summary
    },
    { total: 0, warning: 0, error: 0, stock: 0, mold: 0 }
  )
}

function buildStockWarnings(rows: BusinessStockWarningRow[], config: ReturnType<typeof normalizeBusinessWarningConfig>) {
  if (!config.stockWarningEnabled) return []
  const warnings: BusinessWarningItem[] = []
  const productBuckets = new Map<string, { productId: number; productCode: string; productName: string; unit: string; safeStock: number; availableQty: number }>()

  for (const row of rows) {
    const rowId = Number(row.id || 0)
    const productId = Number(row.productId || 0)
    const productCode = displayName(row.productCode, productId)
    const productName = displayName(row.productName, productCode)
    const unit = String(row.productUnit || '')
    const qty = toWarningNumber(row.qty)
    const lockedQty = toWarningNumber(row.lockedQty)
    const availableQty = row.availableQty === undefined || row.availableQty === null
      ? qty - lockedQty
      : toWarningNumber(row.availableQty)
    const safeStock = toWarningNumber(row.safeStock)
    const productKey = String(productId || productCode)
    const bucket = productBuckets.get(productKey) || {
      productId,
      productCode,
      productName,
      unit,
      safeStock,
      availableQty: 0,
    }
    bucket.availableQty += availableQty
    bucket.safeStock = Math.max(bucket.safeStock, safeStock)
    productBuckets.set(productKey, bucket)

    if (lockedQty > qty) {
      warnings.push({
        id: `stock-locked-${rowId || productKey}`,
        category: '库存',
        level: 'ERROR',
        type: '锁定量异常',
        title: productCode,
        targetName: productName,
        value: formatQty(lockedQty, unit),
        threshold: `≤ ${formatQty(qty, unit)}`,
        message: `${productName} 锁定量 ${formatQty(lockedQty, unit)} 大于账面库存 ${formatQty(qty, unit)}，需复核冻结、出库或盘点记录。`,
        targetType: 'stock',
        targetId: rowId || productId,
        actionPath: '/stock/query',
      })
    }

    const expiryDate = normalizeDateOnly(row.batchExpiryDate as any)
    if (expiryDate) {
      const days = dateDiffDays(expiryDate, config.today)
      if (days < 0) {
        warnings.push({
          id: `stock-expired-${rowId || row.batchId || productKey}`,
          category: '库存',
          level: 'ERROR',
          type: '批次过期',
          title: displayName(row.batchNo, productCode),
          targetName: productName,
          value: expiryDate,
          threshold: config.today,
          message: `${productName} 批次 ${displayName(row.batchNo)} 已于 ${expiryDate} 过期，禁止继续出库并应启动隔离/报废处理。`,
          targetType: 'stock',
          targetId: rowId || productId,
          actionPath: '/stock/query',
        })
      } else if (days <= config.stockExpiryWarningDays) {
        warnings.push({
          id: `stock-expiring-${rowId || row.batchId || productKey}`,
          category: '库存',
          level: 'WARNING',
          type: '批次临期',
          title: displayName(row.batchNo, productCode),
          targetName: productName,
          value: `${days}天`,
          threshold: `${config.stockExpiryWarningDays}天`,
          message: `${productName} 批次 ${displayName(row.batchNo)} 将在 ${days} 天后到期，建议优先领用或复核呆滞风险。`,
          targetType: 'stock',
          targetId: rowId || productId,
          actionPath: '/stock/query',
        })
      }
    }

    const batchStatus = normalizeStatus(row.batchStatus)
    if (['LOCKED', 'DISABLED'].includes(batchStatus)) {
      warnings.push({
        id: `stock-batch-status-${rowId || row.batchId || productKey}`,
        category: '库存',
        level: 'WARNING',
        type: '批次状态异常',
        title: displayName(row.batchNo, productCode),
        targetName: productName,
        value: batchStatus,
        threshold: 'NORMAL',
        message: `${productName} 批次 ${displayName(row.batchNo)} 状态为 ${batchStatus}，需确认是否允许继续参与库存出入库。`,
        targetType: 'stock',
        targetId: rowId || productId,
        actionPath: '/stock/query',
      })
    }
  }

  for (const bucket of productBuckets.values()) {
    if (bucket.safeStock > 0 && bucket.availableQty < bucket.safeStock) {
      const level: BusinessWarningLevel = bucket.availableQty <= 0 ? 'ERROR' : 'WARNING'
      warnings.push({
        id: `stock-low-${bucket.productId || bucket.productCode}`,
        category: '库存',
        level,
        type: '安全库存不足',
        title: bucket.productCode,
        targetName: bucket.productName,
        value: formatQty(bucket.availableQty, bucket.unit),
        threshold: formatQty(bucket.safeStock, bucket.unit),
        message: `${bucket.productName} 可用库存 ${formatQty(bucket.availableQty, bucket.unit)} 低于安全库存 ${formatQty(bucket.safeStock, bucket.unit)}，建议补货或调整生产/销售计划。`,
        targetType: 'product',
        targetId: bucket.productId,
        actionPath: '/stock/query',
      })
    }
  }

  return warnings
}

function buildMoldWarnings(rows: BusinessMoldWarningRow[], config: ReturnType<typeof normalizeBusinessWarningConfig>) {
  const warnings: BusinessWarningItem[] = []

  for (const row of rows) {
    const moldId = Number(row.id || 0)
    const moldCode = displayName(row.code, moldId)
    const moldName = displayName(row.name, moldCode)
    const status = normalizeStatus(row.status)
    const usedShots = toWarningNumber(row.usedShots)
    const lifetime = toWarningNumber(row.lifetime)
    const shotsSinceMaintenance = toWarningNumber(row.shotsSinceMaintenance)
    const maintenanceCycle = toWarningNumber(row.maintenanceCycle)

    if (status === 'SCRAP') {
      warnings.push({
        id: `mold-scrap-${moldId || moldCode}`,
        category: '模具',
        level: 'ERROR',
        type: '模具报废',
        title: moldCode,
        targetName: moldName,
        value: status,
        threshold: 'NORMAL',
        message: `${moldName} 已标记报废，需从可派工模具中移除并复核相关生产工单。`,
        targetType: 'mold',
        targetId: moldId,
        actionPath: '/base/molds',
      })
    } else if (['REPAIR', 'MAINTENANCE'].includes(status)) {
      warnings.push({
        id: `mold-status-${moldId || moldCode}`,
        category: '模具',
        level: 'WARNING',
        type: '模具维护中',
        title: moldCode,
        targetName: moldName,
        value: status,
        threshold: 'NORMAL',
        message: `${moldName} 当前状态为 ${status}，派工前应确认维护或维修进度。`,
        targetType: 'mold',
        targetId: moldId,
        actionPath: '/base/molds',
      })
    }

    if (maintenanceCycle > 0) {
      const ratio = shotsSinceMaintenance / maintenanceCycle
      if (ratio >= 1) {
        warnings.push({
          id: `mold-maintenance-due-${moldId || moldCode}`,
          category: '模具',
          level: 'ERROR',
          type: '保养超期',
          title: moldCode,
          targetName: moldName,
          value: Math.round(shotsSinceMaintenance),
          threshold: Math.round(maintenanceCycle),
          message: `${moldName} 距上次保养模次 ${Math.round(shotsSinceMaintenance)} 已达到保养周期 ${Math.round(maintenanceCycle)}，应立即安排保养。`,
          targetType: 'mold',
          targetId: moldId,
          actionPath: '/prod/mold-maintenance-records',
        })
      } else if (ratio >= config.moldMaintenanceWarningRatio) {
        warnings.push({
          id: `mold-maintenance-warning-${moldId || moldCode}`,
          category: '模具',
          level: 'WARNING',
          type: '保养临近',
          title: moldCode,
          targetName: moldName,
          value: `${Math.round(ratio * 100)}%`,
          threshold: `${Math.round(config.moldMaintenanceWarningRatio * 100)}%`,
          message: `${moldName} 保养周期已使用 ${Math.round(ratio * 100)}%，建议提前排保养计划。`,
          targetType: 'mold',
          targetId: moldId,
          actionPath: '/prod/mold-maintenance-records',
        })
      }
    }

    if (lifetime > 0) {
      const ratio = usedShots / lifetime
      if (ratio >= 1) {
        warnings.push({
          id: `mold-life-expired-${moldId || moldCode}`,
          category: '模具',
          level: 'ERROR',
          type: '寿命到期',
          title: moldCode,
          targetName: moldName,
          value: Math.round(usedShots),
          threshold: Math.round(lifetime),
          message: `${moldName} 累计模次 ${Math.round(usedShots)} 已达到寿命 ${Math.round(lifetime)}，需评估停用、翻新或报废。`,
          targetType: 'mold',
          targetId: moldId,
          actionPath: '/base/molds',
        })
      } else if (ratio >= config.moldLifetimeWarningRatio) {
        warnings.push({
          id: `mold-life-warning-${moldId || moldCode}`,
          category: '模具',
          level: 'WARNING',
          type: '寿命临近',
          title: moldCode,
          targetName: moldName,
          value: `${Math.round(ratio * 100)}%`,
          threshold: `${Math.round(config.moldLifetimeWarningRatio * 100)}%`,
          message: `${moldName} 模具寿命已使用 ${Math.round(ratio * 100)}%，建议评估备模或维修计划。`,
          targetType: 'mold',
          targetId: moldId,
          actionPath: '/base/molds',
        })
      }
    }
  }

  return warnings
}

export function buildBusinessWarnings(input: BuildBusinessWarningsInput = {}) {
  const config = normalizeBusinessWarningConfig(input.config)
  return [
    ...buildStockWarnings(input.stockRows || [], config),
    ...buildMoldWarnings(input.moldRows || [], config),
  ].sort((left, right) => {
    const levelRank = (value: BusinessWarningLevel) => (value === 'ERROR' ? 0 : 1)
    return levelRank(left.level) - levelRank(right.level) || left.category.localeCompare(right.category) || left.id.localeCompare(right.id)
  })
}
