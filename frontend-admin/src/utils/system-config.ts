export const SYSTEM_CONFIG_KEYS = [
  'factory_name',
  'system_title',
  'default_raw_warehouse',
  'default_finish_warehouse',
  'shift_day_start',
  'shift_night_start',
  'overtime_threshold_min',
  'bad_rate_warning',
  'delivery_warning_days',
  'stock_expiry_warning_days',
  'piece_price_tolerance',
  'stock_warning_enabled',
  'fifo_enabled',
  'inventory_freeze_on_count',
  'location_capacity_check',
  'auto_daily_settle',
  'auto_backup',
  'backup_time',
  'backup_keep_days',
  'external_push_enabled',
  'wecom_webhook_url',
  'dingtalk_webhook_url',
  'mold_maintenance_warning_ratio',
  'mold_lifetime_warning_ratio',
] as const

export type SystemConfigKey = (typeof SYSTEM_CONFIG_KEYS)[number]

export type SystemConfigForm = {
  factory_name: string
  system_title: string
  default_raw_warehouse: string
  default_finish_warehouse: string
  shift_day_start: string
  shift_night_start: string
  overtime_threshold_min: number
  bad_rate_warning: number
  delivery_warning_days: number
  stock_expiry_warning_days: number
  piece_price_tolerance: number
  stock_warning_enabled: boolean
  fifo_enabled: boolean
  inventory_freeze_on_count: boolean
  location_capacity_check: boolean
  auto_daily_settle: boolean
  auto_backup: boolean
  backup_time: string
  backup_keep_days: number
  external_push_enabled: boolean
  wecom_webhook_url: string
  dingtalk_webhook_url: string
  mold_maintenance_warning_ratio: number
  mold_lifetime_warning_ratio: number
}

export type SystemConfigPayload = Record<SystemConfigKey, string>

export type SystemConfigRow = {
  config_key: SystemConfigKey
  config_value: string
  updated_at: string
}

export const DEFAULT_SYSTEM_CONFIG: SystemConfigForm = {
  factory_name: 'XX注塑厂',
  system_title: '注塑厂管理系统',
  default_raw_warehouse: '1',
  default_finish_warehouse: '3',
  shift_day_start: '08:00',
  shift_night_start: '20:00',
  overtime_threshold_min: 480,
  bad_rate_warning: 5,
  delivery_warning_days: 3,
  stock_expiry_warning_days: 30,
  piece_price_tolerance: 5,
  stock_warning_enabled: true,
  fifo_enabled: true,
  inventory_freeze_on_count: true,
  location_capacity_check: false,
  auto_daily_settle: true,
  auto_backup: true,
  backup_time: '02:00',
  backup_keep_days: 30,
  external_push_enabled: false,
  wecom_webhook_url: '',
  dingtalk_webhook_url: '',
  mold_maintenance_warning_ratio: 80,
  mold_lifetime_warning_ratio: 90,
}

function trimText(value: unknown) {
  return String(value ?? '').trim()
}

function toConfigNumber(value: unknown, fallback: number) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toBoundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const num = Math.trunc(toConfigNumber(value, fallback))
  return Math.min(Math.max(num, min), max)
}

function toBoundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const num = toConfigNumber(value, fallback)
  return Number(Math.min(Math.max(num, min), max).toFixed(2))
}

export function toSystemConfigBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback
  const text = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'on', 'enabled'].includes(text)) return true
  if (['false', '0', 'no', 'off', 'disabled'].includes(text)) return false
  return fallback
}

function parseClockTime(value: unknown) {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(trimText(value))
  if (!match) return ''
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return ''
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function normalizeClockTime(value: unknown, fallback: string) {
  return parseClockTime(value) || fallback
}

function normalizeRatioPercent(value: unknown, fallback: number) {
  const raw = toConfigNumber(value, fallback)
  const percent = raw > 0 && raw <= 1 ? raw * 100 : raw
  return toBoundedNumber(percent, fallback, 1, 100)
}

function isIntegerInRange(value: unknown, min: number, max: number) {
  const num = Number(value)
  return Number.isInteger(num) && num >= min && num <= max
}

function isNumberInRange(value: unknown, min: number, max: number) {
  const num = Number(value)
  return Number.isFinite(num) && num >= min && num <= max
}

function isRatioPercentInputInRange(value: unknown, min = 1, max = 100) {
  const num = Number(value)
  if (!Number.isFinite(num)) return false
  const percent = num > 0 && num <= 1 ? num * 100 : num
  return percent >= min && percent <= max
}

function isOptionalPositiveId(value: unknown) {
  const text = trimText(value)
  if (!text) return true
  return /^[1-9]\d{0,8}$/.test(text)
}

function isWebhookUrl(value: string) {
  return /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(value)
}

export function normalizeSystemConfig(input: Record<string, unknown> = {}, fallback: SystemConfigForm = DEFAULT_SYSTEM_CONFIG): SystemConfigForm {
  return {
    factory_name: trimText(input.factory_name) || fallback.factory_name,
    system_title: trimText(input.system_title) || fallback.system_title,
    default_raw_warehouse: trimText(input.default_raw_warehouse ?? fallback.default_raw_warehouse),
    default_finish_warehouse: trimText(input.default_finish_warehouse ?? fallback.default_finish_warehouse),
    shift_day_start: normalizeClockTime(input.shift_day_start, fallback.shift_day_start),
    shift_night_start: normalizeClockTime(input.shift_night_start, fallback.shift_night_start),
    overtime_threshold_min: toBoundedInteger(input.overtime_threshold_min, fallback.overtime_threshold_min, 1, 1440),
    bad_rate_warning: toBoundedNumber(input.bad_rate_warning, fallback.bad_rate_warning, 0, 100),
    delivery_warning_days: toBoundedInteger(input.delivery_warning_days, fallback.delivery_warning_days, 1, 365),
    stock_expiry_warning_days: toBoundedInteger(input.stock_expiry_warning_days, fallback.stock_expiry_warning_days, 1, 365),
    piece_price_tolerance: toBoundedNumber(input.piece_price_tolerance, fallback.piece_price_tolerance, 0, 100),
    stock_warning_enabled: toSystemConfigBoolean(input.stock_warning_enabled, fallback.stock_warning_enabled),
    fifo_enabled: toSystemConfigBoolean(input.fifo_enabled, fallback.fifo_enabled),
    inventory_freeze_on_count: toSystemConfigBoolean(input.inventory_freeze_on_count, fallback.inventory_freeze_on_count),
    location_capacity_check: toSystemConfigBoolean(input.location_capacity_check, fallback.location_capacity_check),
    auto_daily_settle: toSystemConfigBoolean(input.auto_daily_settle, fallback.auto_daily_settle),
    auto_backup: toSystemConfigBoolean(input.auto_backup, fallback.auto_backup),
    backup_time: normalizeClockTime(input.backup_time, fallback.backup_time),
    backup_keep_days: toBoundedInteger(input.backup_keep_days, fallback.backup_keep_days, 1, 365),
    external_push_enabled: toSystemConfigBoolean(input.external_push_enabled, fallback.external_push_enabled),
    wecom_webhook_url: trimText(input.wecom_webhook_url),
    dingtalk_webhook_url: trimText(input.dingtalk_webhook_url),
    mold_maintenance_warning_ratio: normalizeRatioPercent(input.mold_maintenance_warning_ratio, fallback.mold_maintenance_warning_ratio),
    mold_lifetime_warning_ratio: normalizeRatioPercent(input.mold_lifetime_warning_ratio, fallback.mold_lifetime_warning_ratio),
  }
}

export function validateSystemConfig(input: Record<string, unknown> = {}) {
  const factoryName = trimText(input.factory_name ?? DEFAULT_SYSTEM_CONFIG.factory_name)
  const systemTitle = trimText(input.system_title ?? DEFAULT_SYSTEM_CONFIG.system_title)
  const shiftDayStart = input.shift_day_start ?? DEFAULT_SYSTEM_CONFIG.shift_day_start
  const shiftNightStart = input.shift_night_start ?? DEFAULT_SYSTEM_CONFIG.shift_night_start
  const autoBackup = toSystemConfigBoolean(input.auto_backup, DEFAULT_SYSTEM_CONFIG.auto_backup)
  const externalPushEnabled = toSystemConfigBoolean(input.external_push_enabled, DEFAULT_SYSTEM_CONFIG.external_push_enabled)
  const wecomWebhook = trimText(input.wecom_webhook_url)
  const dingtalkWebhook = trimText(input.dingtalk_webhook_url)

  if (!factoryName) return '请输入工厂名称'
  if (factoryName.length > 80) return '工厂名称不能超过 80 个字符'
  if (!systemTitle) return '请输入系统标题'
  if (systemTitle.length > 80) return '系统标题不能超过 80 个字符'
  if (!isOptionalPositiveId(input.default_raw_warehouse)) return '默认原料仓必须是有效的正整数编号'
  if (!isOptionalPositiveId(input.default_finish_warehouse)) return '默认成品仓必须是有效的正整数编号'
  if (!parseClockTime(shiftDayStart)) return '白班开始时间必须为 HH:mm'
  if (!parseClockTime(shiftNightStart)) return '夜班开始时间必须为 HH:mm'
  if (parseClockTime(shiftDayStart) === parseClockTime(shiftNightStart)) return '白班和夜班开始时间不能相同'
  if (!isIntegerInRange(input.overtime_threshold_min ?? DEFAULT_SYSTEM_CONFIG.overtime_threshold_min, 1, 1440)) return '日工时加班阈值必须在 1-1440 分钟之间'
  if (!isNumberInRange(input.bad_rate_warning ?? DEFAULT_SYSTEM_CONFIG.bad_rate_warning, 0, 100)) return '不良率预警必须在 0-100% 之间'
  if (!isIntegerInRange(input.delivery_warning_days ?? DEFAULT_SYSTEM_CONFIG.delivery_warning_days, 1, 365)) return '交期预警天数必须在 1-365 天之间'
  if (!isIntegerInRange(input.stock_expiry_warning_days ?? DEFAULT_SYSTEM_CONFIG.stock_expiry_warning_days, 1, 365)) return '批次临期预警天数必须在 1-365 天之间'
  if (!isNumberInRange(input.piece_price_tolerance ?? DEFAULT_SYSTEM_CONFIG.piece_price_tolerance, 0, 100)) return '计件容差必须在 0-100% 之间'
  if (!isRatioPercentInputInRange(input.mold_maintenance_warning_ratio ?? DEFAULT_SYSTEM_CONFIG.mold_maintenance_warning_ratio)) return '模具保养预警比例必须在 1-100% 之间'
  if (!isRatioPercentInputInRange(input.mold_lifetime_warning_ratio ?? DEFAULT_SYSTEM_CONFIG.mold_lifetime_warning_ratio)) return '模具寿命预警比例必须在 1-100% 之间'
  if (autoBackup && !parseClockTime(input.backup_time ?? DEFAULT_SYSTEM_CONFIG.backup_time)) return '备份时间必须为 HH:mm'
  if (!isIntegerInRange(input.backup_keep_days ?? DEFAULT_SYSTEM_CONFIG.backup_keep_days, 1, 365)) return '备份保留天数必须在 1-365 天之间'
  if (wecomWebhook && (!isWebhookUrl(wecomWebhook) || wecomWebhook.length > 500)) return '企业微信 Webhook 必须是 500 字符以内的 HTTPS 地址'
  if (dingtalkWebhook && (!isWebhookUrl(dingtalkWebhook) || dingtalkWebhook.length > 500)) return '钉钉 Webhook 必须是 500 字符以内的 HTTPS 地址'
  if (externalPushEnabled && !wecomWebhook && !dingtalkWebhook) return '启用外部推送时至少填写一个 Webhook'
  return ''
}

export function buildSystemConfigPayload(input: Record<string, unknown> = {}): SystemConfigPayload {
  const data = normalizeSystemConfig(input)
  return {
    factory_name: data.factory_name,
    system_title: data.system_title,
    default_raw_warehouse: data.default_raw_warehouse,
    default_finish_warehouse: data.default_finish_warehouse,
    shift_day_start: data.shift_day_start,
    shift_night_start: data.shift_night_start,
    overtime_threshold_min: String(data.overtime_threshold_min),
    bad_rate_warning: String(data.bad_rate_warning),
    delivery_warning_days: String(data.delivery_warning_days),
    stock_expiry_warning_days: String(data.stock_expiry_warning_days),
    piece_price_tolerance: String(data.piece_price_tolerance),
    stock_warning_enabled: String(data.stock_warning_enabled),
    fifo_enabled: String(data.fifo_enabled),
    inventory_freeze_on_count: String(data.inventory_freeze_on_count),
    location_capacity_check: String(data.location_capacity_check),
    auto_daily_settle: String(data.auto_daily_settle),
    auto_backup: String(data.auto_backup),
    backup_time: data.backup_time,
    backup_keep_days: String(data.backup_keep_days),
    external_push_enabled: String(data.external_push_enabled),
    wecom_webhook_url: data.wecom_webhook_url,
    dingtalk_webhook_url: data.dingtalk_webhook_url,
    mold_maintenance_warning_ratio: String(data.mold_maintenance_warning_ratio),
    mold_lifetime_warning_ratio: String(data.mold_lifetime_warning_ratio),
  }
}

export function buildSystemConfigRows(input: Record<string, unknown> = {}, updatedAt = new Date().toISOString()): SystemConfigRow[] {
  const payload = buildSystemConfigPayload(input)
  return SYSTEM_CONFIG_KEYS.map((key) => ({
    config_key: key,
    config_value: payload[key],
    updated_at: updatedAt,
  }))
}
