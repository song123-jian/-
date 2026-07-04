import { getSupabaseClient, supabaseAuthEmailDomain, supabaseStorageBucket } from './supabaseClient'
import { getStoredToken } from '../utils/auth-storage'
import {
  buildSalePaymentPayload,
  getPaymentStatus,
  getSaleOrderPaymentBaseAmount,
  getSaleOrderReceivableAmount,
  getSaleOrderReceivedAmountAsOf,
  getSaleOrderReceivedAmountFromSummary,
  getSaleOrderTotalAmount,
  isSaleOrderCollectableForPayment,
  roundPaymentMoney,
} from '../utils/sale-payment'
import { buildSaleOrderPayload } from '../utils/sale-order'
import { getSaleDeliveryStatusText, isSaleDeliveryStatus, sumSaleDeliveryQty } from '../utils/sale-delivery'
import {
  getFinanceExpenseTypeText,
  isFinanceExpenseType,
  normalizeExpenseDate,
  normalizeExpenseKeyword,
  normalizeExpensePayee,
  normalizeExpenseType,
  roundExpenseAmount,
  validateExpenseAmount,
  validateExpenseDate,
  validateExpensePayee,
} from '../utils/finance-expense'
import { createFinanceStatementScope, getFinanceStatementMonthKey } from '../utils/finance-statement'
import {
  buildFinanceReceivableRow,
  summarizeFinanceReceivables,
} from '../utils/finance-receivable'
import {
  buildMonthlySalarySummary,
  buildSalaryDailyReportLine,
  createSalaryMonthScope,
  getSalaryAdjustEffect,
  getSalaryReportWorkDate,
  isSalaryDailySettled,
  normalizeSalaryDate,
  normalizeSalaryAdjustInput,
  normalizeSalaryAdjustStatus,
  normalizeSalaryAdjustType,
  roundSalaryAmount,
  validateSalaryAdjustInput,
} from '../utils/salary-monthly'
import {
  buildSalaryPriceRow,
  chooseSalaryPiecePrice,
  findOverlappedSalaryPrice,
  getSalaryPriceStatus,
  normalizeSalaryPriceInput,
  normalizeSalaryProcessName,
  validateSalaryPriceInput,
} from '../utils/salary-price'
import { buildBusinessWarnings, summarizeBusinessWarnings } from '../utils/business-warning'
import {
  buildProductionBoardSummary,
  isActiveProductionOrderStatus,
  isDoneProductionOrderStatus,
  productionRatioPercent,
} from '../utils/production-board'
import { buildQualityBoardSummaryFromRecords } from '../utils/quality-board'
import {
  buildIntegrationResult,
  convertIntegrationScale,
  normalizeIntegrationLabel,
  normalizeIntegrationPush,
  normalizeIntegrationScan,
  normalizeIntegrationTelemetry,
  validateIntegrationLabel,
  validateIntegrationPush,
  validateIntegrationScale,
  validateIntegrationScan,
  validateIntegrationTelemetry,
} from '../utils/integration-center'
import {
  buildSystemConfigRows,
  normalizeSystemConfig,
  validateSystemConfig,
} from '../utils/system-config'
import {
  buildProductPayload,
  validateProductMaster,
} from '../utils/product-master'
import {
  buildCustomerPayload,
  validateCustomerMaster,
} from '../utils/customer-master'
import {
  buildSupplierPayload,
  validateSupplierMaster,
} from '../utils/supplier-master'
import {
  buildInventoryApprovalSummary,
  getInventoryBookQty,
  getInventoryDiffQty,
  getInventoryItemId,
  validateInventoryApproval,
  validateInventoryCountItems,
  validateInventoryReviewSubmit,
  validateInventoryStatus,
} from '../utils/stock-inventory'
import { summarizeStockLedgerRows } from '../utils/stock-ledger'
import { buildPurchaseInboundPayload } from '../utils/purchase-inbound'
import { buildStockTransferPayload } from '../utils/stock-transfer'
import bcrypt from 'bcryptjs'
import QRCode from 'qrcode'

type RequestConfig = {
  params?: Record<string, any>
  headers?: Record<string, string>
  responseType?: string
}

export type ApiResponse<T = any> = {
  code: number
  message: string
  data: T
}

type RequestHooks = {
  onError?: (message: string) => void
  onUnauthorized?: () => void
}

type RouteConfig = {
  resource: string
  table: string
  searchColumns?: string[]
  defaultOrder?: string
}

const routeConfigs: RouteConfig[] = [
  { resource: 'warehouse-locations', table: 'warehouse_location', searchColumns: ['code', 'name', 'area'] },
  { resource: 'stock-inventories', table: 'stock_inventory', searchColumns: ['inventory_no', 'remark'] },
  { resource: 'stock-transfers', table: 'stock_transfer', searchColumns: ['transfer_no', 'remark'] },
  { resource: 'machine-inspection-records', table: 'machine_inspection_record' },
  { resource: 'mold-maintenance-records', table: 'mold_maintenance_record' },
  { resource: 'mold-mount-records', table: 'mold_mount_record' },
  { resource: 'downtime-records', table: 'downtime_record', searchColumns: ['reason', 'remark'] },
  { resource: 'sale-orders', table: 'sale_order', searchColumns: ['order_no', 'remark'] },
  { resource: 'sale-order-items', table: 'sale_order_item', searchColumns: ['remark'] },
  { resource: 'prod-orders', table: 'prod_order', searchColumns: ['order_no', 'remark'] },
  { resource: 'prod-reports', table: 'prod_report' },
  { resource: 'qc-records', table: 'qc_record', searchColumns: ['defect_type', 'defect_desc', 'remark'] },
  { resource: 'salary/prices', table: 'piece_price', searchColumns: ['process_name'] },
  { resource: 'salary/daily', table: 'salary_daily' },
  { resource: 'salary/monthly', table: 'salary_daily' },
  { resource: 'salary/adjusts', table: 'salary_adjust', searchColumns: ['reason'] },
  { resource: 'salary/adjust', table: 'salary_adjust', searchColumns: ['reason'] },
  { resource: 'system/logs', table: 'sys_operation_log', searchColumns: ['username', 'module', 'action'] },
  { resource: 'system/config', table: 'sys_config', searchColumns: ['config_key', 'config_desc'] },
  { resource: 'payments', table: 'payment_record', searchColumns: ['payment_no', 'invoice_no', 'remark'] },
  { resource: 'receivables', table: 'payment_record', searchColumns: ['payment_no', 'invoice_no', 'remark'] },
  { resource: 'deliveries', table: 'delivery_order', searchColumns: ['delivery_no', 'tracking_no', 'remark'] },
  { resource: 'expenses', table: 'expense_record', searchColumns: ['expense_no', 'payee', 'remark'] },
  { resource: 'notifications', table: 'notification', searchColumns: ['title', 'content'] },
  { resource: 'warehouses', table: 'warehouse', searchColumns: ['code', 'name', 'address'] },
  { resource: 'suppliers', table: 'supplier', searchColumns: ['code', 'name', 'contact', 'phone', 'main_material'] },
  { resource: 'customers', table: 'customer', searchColumns: ['code', 'name', 'short_name', 'contact', 'phone'] },
  { resource: 'machines', table: 'machine', searchColumns: ['code', 'name', 'model', 'location'] },
  { resource: 'products', table: 'product', searchColumns: ['code', 'name', 'spec', 'type'] },
  { resource: 'molds', table: 'mold', searchColumns: ['code', 'name', 'remark'] },
  { resource: 'users', table: 'sys_user', searchColumns: ['username', 'real_name', 'phone'] },
  { resource: 'stock', table: 'stock' },
]

const tableColumns: Record<string, string[]> = {
  customer: ['id', 'code', 'name', 'short_name', 'contact', 'phone', 'address', 'tax_no', 'invoice_title', 'credit_level', 'payment_days', 'sales_user_id', 'status', 'created_at'],
  delivery_order: ['id', 'delivery_no', 'sale_order_id', 'customer_id', 'delivery_date', 'total_qty', 'logistics_company', 'tracking_no', 'status', 'operator_id', 'remark', 'created_at'],
  delivery_order_item: ['id', 'delivery_order_id', 'sale_order_item_id', 'product_id', 'qty', 'stock_move_id'],
  downtime_record: ['id', 'prod_order_id', 'machine_id', 'reason', 'start_time', 'end_time', 'duration_minutes', 'operator_id', 'remark', 'created_at'],
  expense_record: ['id', 'expense_no', 'expense_type', 'amount', 'expense_date', 'payee', 'remark', 'created_by', 'created_at'],
  machine: ['id', 'code', 'name', 'model', 'tonnage', 'status', 'qr_code', 'location', 'factory_code', 'workshop', 'purchase_date', 'remark', 'created_at'],
  machine_inspection_record: ['id', 'machine_id', 'inspector_id', 'inspect_time', 'result', 'items_checked', 'issues', 'remark'],
  mold: ['id', 'code', 'name', 'product_id', 'cavities', 'lifetime', 'used_shots', 'shots_since_maintenance', 'maintenance_cycle', 'maintenance_count', 'last_maintenance_at', 'status', 'remark', 'created_at'],
  mold_maintenance_record: ['id', 'mold_id', 'operator_id', 'used_shots_before', 'shots_since_maintenance_before', 'maintenance_count_before', 'operate_time', 'remark'],
  mold_mount_record: ['id', 'mold_id', 'machine_id', 'prod_order_id', 'mount_type', 'operator_id', 'operate_time', 'remark'],
  notification: ['id', 'user_id', 'title', 'content', 'type', 'is_read', 'created_at'],
  payment_record: ['id', 'payment_no', 'customer_id', 'sale_order_id', 'pay_amount', 'pay_date', 'pay_method', 'invoice_no', 'remark', 'created_by', 'created_at'],
  piece_price: ['id', 'product_id', 'process_name', 'price', 'effective_date', 'expire_date', 'created_by', 'created_at'],
  prod_order: ['id', 'order_no', 'sale_order_id', 'sale_order_item_id', 'product_id', 'machine_id', 'mold_id', 'plan_qty', 'completed_qty', 'qualified_qty', 'bad_qty', 'raw_material_qty', 'picked_material_qty', 'picked_material_amount', 'inbounded_qty', 'inbounded_amount', 'plan_start', 'plan_end', 'actual_start', 'actual_end', 'status', 'priority', 'remark', 'created_by', 'created_at', 'updated_at'],
  prod_report: ['id', 'prod_order_id', 'user_id', 'machine_id', 'mold_id', 'report_type', 'process_name', 'shift', 'qty', 'bad_qty', 'shots', 'start_time', 'end_time', 'work_minutes', 'sync_status', 'created_at'],
  product: ['id', 'code', 'name', 'spec', 'type', 'unit', 'piece_price', 'cavity_yield', 'cycle_time_sec', 'safe_stock', 'weight_g', 'raw_material_id', 'raw_material_usage', 'color', 'customer_id', 'image_url', 'status', 'created_at'],
  qc_record: ['id', 'prod_order_id', 'product_id', 'check_type', 'check_result', 'defect_type', 'defect_desc', 'defect_qty', 'sample_qty', 'checker_id', 'check_time', 'image_urls', 'remark', 'created_at'],
  salary_adjust: ['id', 'user_id', 'adjust_type', 'amount', 'adjust_date', 'reason', 'status', 'confirmed_by', 'confirmed_at', 'created_by', 'created_at'],
  salary_daily: ['id', 'user_id', 'work_date', 'total_qualified_qty', 'total_piece_amount', 'subsidy', 'deduction', 'total_amount', 'status', 'confirmed_by', 'confirmed_at', 'created_at'],
  sale_order: ['id', 'order_no', 'customer_id', 'order_date', 'delivery_date', 'total_amount', 'received_amount', 'received_opening_amount', 'status', 'sales_user_id', 'remark', 'created_by', 'created_at', 'updated_at'],
  sale_order_item: ['id', 'sale_order_id', 'product_id', 'qty', 'unit_price', 'amount', 'delivered_qty', 'produced_qty', 'remark'],
  stock: ['id', 'product_id', 'warehouse_id', 'location_id', 'batch_id', 'qty', 'locked_qty', 'updated_at'],
  stock_inventory: ['id', 'inventory_no', 'warehouse_id', 'inventory_type', 'status', 'freeze_stock', 'operator_id', 'approver_id', 'remark', 'created_at'],
  stock_inventory_item: ['id', 'inventory_id', 'product_id', 'location_id', 'batch_id', 'book_qty', 'actual_qty', 'diff_qty', 'diff_amount', 'reason'],
  stock_move: ['id', 'move_no', 'product_id', 'warehouse_id', 'location_id', 'batch_id', 'to_warehouse_id', 'to_location_id', 'to_batch_id', 'move_type', 'move_reason', 'qty', 'unit_cost', 'amount', 'sale_order_item_id', 'delivery_order_id', 'delivery_order_item_id', 'related_order_id', 'related_order_type', 'operator_id', 'operate_time', 'remark', 'created_at'],
  stock_transfer: ['id', 'transfer_no', 'from_warehouse_id', 'to_warehouse_id', 'status', 'operator_id', 'receive_time', 'remark', 'created_at'],
  supplier: ['id', 'code', 'name', 'contact', 'phone', 'address', 'main_material', 'status', 'created_at'],
  sys_config: ['id', 'config_key', 'config_value', 'config_desc', 'updated_at'],
  sys_operation_log: ['id', 'user_id', 'username', 'module', 'action', 'target_type', 'target_id', 'old_value', 'new_value', 'ip', 'created_at'],
  sys_user: ['id', 'username', 'real_name', 'phone', 'password_hash', 'role', 'status', 'login_fail_count', 'lock_until', 'last_login_at', 'created_at', 'updated_at'],
  warehouse: ['id', 'code', 'name', 'type', 'address', 'factory_code', 'workshop', 'manager_id', 'is_enabled', 'created_at'],
  warehouse_location: ['id', 'warehouse_id', 'code', 'name', 'area', 'shelf', 'layer', 'position', 'is_enabled'],
}

const filterOnlyKeys = new Set([
  'page',
  'pageSize',
  'size',
  'current',
  'keyword',
  'startDate',
  'endDate',
  'date',
  'type',
])

function ok<T = any>(data: T, message = 'success'): ApiResponse<T> {
  return { code: 200, message, data }
}

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function toCamelCase(value: string) {
  return value.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())
}

function toCamelDeep(value: any): any {
  if (Array.isArray(value)) return value.map(toCamelDeep)
  if (!value || typeof value !== 'object' || value instanceof Blob || value instanceof File) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [toCamelCase(key), toCamelDeep(item)]))
}

function toSnakePayload(value: any): any {
  if (Array.isArray(value)) return value.map(toSnakePayload)
  if (!value || typeof value !== 'object' || value instanceof Blob || value instanceof File || value instanceof FormData) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [toSnakeCase(key), toSnakePayload(item)])
  )
}

function normalizePath(url: string) {
  return url.split('?')[0].replace(/^\/+|\/+$/g, '')
}

type StoredUserContext = {
  userId?: number
  userName?: string
  realName?: string
  phone?: string
  role?: string
  roles?: string[]
}

function getStoredUserContext(): StoredUserContext {
  if (typeof window === 'undefined') return {}
  const userId = Number(window.localStorage.getItem('userId') || 0)
  const rolesRaw = window.localStorage.getItem('roles') || '[]'
  let roles: string[] = []
  try {
    roles = JSON.parse(rolesRaw)
  } catch {
    roles = []
  }
  return {
    userId: Number.isFinite(userId) && userId > 0 ? userId : undefined,
    userName: window.localStorage.getItem('userName') || '',
    realName: window.localStorage.getItem('realName') || '',
    phone: window.localStorage.getItem('phone') || '',
    role: window.localStorage.getItem('role') || '',
    roles,
  }
}

function getCurrentUserId() {
  return getStoredUserContext().userId
}

function toNumber(value: any) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function toFiniteNumber(value: any) {
  const num = Number(value)
  return Number.isFinite(num) ? num : undefined
}

function normalizeBusinessStatus(value?: string | null) {
  return String(value || '').toUpperCase()
}

function normalizeDateOnly(value?: any) {
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '' : text
}

function compareDateOnly(left?: any, right?: any) {
  const a = normalizeDateOnly(left)
  const b = normalizeDateOnly(right)
  if (!a || !b) return 0
  return a.localeCompare(b)
}

function todayDateOnly() {
  return formatLocalDate(new Date())
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthBounds(year: number, month: number) {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
  }
}

function dayBounds(input?: string) {
  const base = input ? new Date(input) : new Date()
  const safe = Number.isNaN(base.getTime()) ? new Date() : base
  const start = new Date(safe)
  start.setHours(0, 0, 0, 0)
  const end = new Date(safe)
  end.setHours(23, 59, 59, 999)
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    day: formatLocalDate(safe),
  }
}

async function loadRowsByIds(table: string, ids: Array<string | number>, columns = '*', key = 'id') {
  const uniqueIds = Array.from(
    new Set(
      ids
        .map((value) => (typeof value === 'number' ? value : Number(value)))
        .filter((value) => Number.isFinite(value) && value !== 0)
    )
  )
  if (!uniqueIds.length) return new Map<number, any>()
  const { data, error } = await getSupabaseClient().from(table).select(columns).in(key, uniqueIds)
  if (error) throw error
  return new Map((data || []).map((row: any) => [Number(row[key]), toCamelDeep(row)]))
}

async function loadRowsByColumn(table: string, column: string, values: Array<string | number>, columns = '*') {
  const uniqueValues = Array.from(new Set(values.filter((value) => value !== undefined && value !== null && value !== '')))
  if (!uniqueValues.length) return []
  const { data, error } = await getSupabaseClient().from(table).select(columns).in(column, uniqueValues as any)
  if (error) throw error
  return toCamelDeep(data || [])
}

function choosePiecePrice(rows: any[], productId?: number, processName?: string, date?: string) {
  return chooseSalaryPiecePrice(rows, productId, processName || '注塑', date)
}

function formatCurrentUserPayload(context: StoredUserContext, fallbackToken = '') {
  const role = context.role || context.roles?.[0] || 'USER'
  const realName = context.realName || context.userName || context.phone || ''
  return {
    token: fallbackToken || '',
    userId: context.userId || 0,
    userName: context.userName || context.phone || '',
    username: context.userName || context.phone || '',
    realName,
    phone: context.phone || '',
    role,
    roles: context.roles?.length ? context.roles : [role],
  }
}

async function saveUserRecord(id: number | undefined, payload: any) {
  const supabase = getSupabaseClient()
  const data = { ...toSnakePayload(payload) }
  const rawPassword = String(payload?.password || payload?.newPassword || '').trim()
  delete data.password
  delete data.newPassword

  if (rawPassword) {
    data.password_hash = bcrypt.hashSync(rawPassword, 10)
  }

  if (id) {
    if (!rawPassword) {
      const { data: existing, error: fetchError } = await supabase
        .from('sys_user')
        .select('password_hash')
        .eq('id', id)
        .maybeSingle()
      if (fetchError) throw fetchError
      if (existing?.password_hash) {
        data.password_hash = existing.password_hash
      }
    }

    const { data: updated, error } = await supabase
      .from('sys_user')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return ok(toCamelDeep(updated), 'updated')
  }

  if (!data.password_hash) {
    throw new Error('请输入密码')
  }

  const { data: created, error } = await supabase
    .from('sys_user')
    .insert({
      ...data,
      login_fail_count: 0,
      status: data.status ?? 1,
    })
    .select()
    .single()
  if (error) throw error
  return ok(toCamelDeep(created), 'created')
}

async function resetUserPassword(id: number, newPassword: string) {
  return saveUserRecord(id, { password: newPassword })
}

async function getMachineQrCodeData(id: number) {
  const route = resolveResourceRoute('/machines')!
  const result = await getTableDetail(route, id)
  const machine = result.data || {}
  const payload = JSON.stringify({
    id: machine.id,
    code: machine.code,
    name: machine.name,
    model: machine.model,
    location: machine.location,
  })
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 280,
    color: {
      dark: '#111827',
      light: '#ffffff',
    },
  })
  return ok(dataUrl)
}

async function getMoldShotsStatsData(id: number) {
  const route = resolveResourceRoute('/molds')!
  const result = await getTableDetail(route, id)
  const mold = result.data || {}
  const usedShots = toNumber(mold.usedShots)
  const shotsSinceMaintenance = toNumber(mold.shotsSinceMaintenance)
  const lifetime = toNumber(mold.lifetime)
  const maintenanceCycle = toNumber(mold.maintenanceCycle)
  const remainingShots = lifetime > 0 ? Math.max(lifetime - usedShots, 0) : 0
  const remainingToMaintenance = maintenanceCycle > 0 ? Math.max(maintenanceCycle - shotsSinceMaintenance, 0) : 0
  const usageRate = lifetime > 0 ? Number(((usedShots / lifetime) * 100).toFixed(1)) : 0
  return ok({
    moldId: mold.id,
    moldCode: mold.code,
    moldName: mold.name,
    usedShots,
    shotsSinceMaintenance,
    lifetime,
    maintenanceCycle,
    remainingShots,
    remainingToMaintenance,
    maintenanceCount: toNumber(mold.maintenanceCount),
    usageRate,
  })
}

async function maintainMoldData(id: number) {
  const supabase = getSupabaseClient()
  const route = resolveResourceRoute('/molds')!
  const moldResult = await getTableDetail(route, id)
  const mold = moldResult.data || {}
  const now = new Date().toISOString()
  const operatorId = getCurrentUserId() || null
  const maintenanceRecord = {
    mold_id: id,
    operator_id: operatorId,
    used_shots_before: toNumber(mold.usedShots),
    shots_since_maintenance_before: toNumber(mold.shotsSinceMaintenance),
    maintenance_count_before: toNumber(mold.maintenanceCount),
    operate_time: now,
    remark: 'Supabase 云端模具保养',
  }
  const { error: recordError } = await supabase.from('mold_maintenance_record').insert(maintenanceRecord)
  if (recordError) throw recordError
  const { data, error } = await supabase
    .from('mold')
    .update({
      shots_since_maintenance: 0,
      maintenance_count: toNumber(mold.maintenanceCount) + 1,
      last_maintenance_at: now,
      status: mold.status === 'SCRAP' ? 'SCRAP' : 'NORMAL',
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return ok(toCamelDeep(data), 'updated')
}

async function settleMonthlySalary(data: any) {
  const supabase = getSupabaseClient()
  const currentUserId = getCurrentUserId()
  const scope = createSalaryMonthScope(data)
  const targetUserId = Number(data?.userId || data?.workerId || 0)
  let dailyQuery = supabase
    .from('salary_daily')
    .select('*')
    .gte('work_date', scope.startDate)
    .lte('work_date', scope.endDate)
  let adjustQuery = supabase
    .from('salary_adjust')
    .select('*')
    .gte('adjust_date', scope.startDate)
    .lte('adjust_date', scope.endDate)
  if (targetUserId) {
    dailyQuery = dailyQuery.eq('user_id', targetUserId)
    adjustQuery = adjustQuery.eq('user_id', targetUserId)
  }

  const [dailyResult, adjustResult] = await Promise.all([dailyQuery, adjustQuery])
  if (dailyResult.error) throw dailyResult.error
  if (adjustResult.error) throw adjustResult.error

  const dailyRows = dailyResult.data || []
  const adjustRows = adjustResult.data || []
  if (!dailyRows.length && !adjustRows.length) {
    throw new Error('该月暂无工资明细，不能结算')
  }

  const now = new Date().toISOString()
  const pendingDailyIds = dailyRows
    .filter((row: any) => String(row.status || '').toUpperCase() !== 'SETTLED')
    .map((row: any) => Number(row.id))
    .filter(Boolean)
  const pendingAdjustIds = adjustRows
    .filter((row: any) => String(row.status || '').toUpperCase() !== 'SETTLED')
    .map((row: any) => Number(row.id))
    .filter(Boolean)

  if (pendingDailyIds.length) {
    const { error } = await supabase
      .from('salary_daily')
      .update({
        status: 'SETTLED',
        confirmed_by: currentUserId || null,
        confirmed_at: now,
      })
      .in('id', pendingDailyIds)
    if (error) throw error
  }

  if (pendingAdjustIds.length) {
    const { error } = await supabase
      .from('salary_adjust')
      .update({
        status: 'SETTLED',
        confirmed_by: currentUserId || null,
        confirmed_at: now,
      })
      .in('id', pendingAdjustIds)
    if (error) throw error
  }

  const userMap = await loadRowsByIds('sys_user', [
    ...dailyRows.map((item: any) => item.user_id),
    ...adjustRows.map((item: any) => item.user_id),
  ])
  const summaryRows = buildMonthlySalarySummary(
    dailyRows.map((row: any) => ({ ...row, status: 'SETTLED' })),
    adjustRows.map((row: any) => ({ ...row, status: 'SETTLED' })),
    userMap,
    scope.month,
  )
  const totalAmount = roundSalaryAmount(summaryRows.reduce((sum, row) => sum + row.payableAmount, 0))

  return ok(
    {
      month: scope.month,
      startDate: scope.startDate,
      endDate: scope.endDate,
      workerCount: summaryRows.length,
      totalAmount,
      settledDailyCount: pendingDailyIds.length,
      settledAdjustCount: pendingAdjustIds.length,
      settledCount: pendingDailyIds.length + pendingAdjustIds.length,
      alreadySettledDailyCount: dailyRows.length - pendingDailyIds.length,
      alreadySettledAdjustCount: adjustRows.length - pendingAdjustIds.length,
    },
    'updated',
  )
}

function dailySalaryDateBounds(workDate: string) {
  return {
    startTime: `${workDate} 00:00:00`,
    endTime: `${workDate} 23:59:59`,
  }
}

async function loadDailySalarySummary(userId: number, workDate: string) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('salary_daily')
    .select('*')
    .eq('user_id', userId)
    .eq('work_date', workDate)
    .maybeSingle()
  if (error) throw error
  return data || undefined
}

async function assertDailySalaryEditable(userId: number, workDate: string) {
  if (!userId || !workDate) throw new Error('报工人员或归属日期无效')
  const existing = await loadDailySalarySummary(userId, workDate)
  if (existing?.id && isSalaryDailySettled(existing.status)) {
    throw new Error(`${workDate} 日工资已结算，不能新增、编辑或删除该日期报工`)
  }
  return existing
}

function buildDailySalarySummaryPayload(
  existing: any,
  userId: number,
  workDate: string,
  qualifiedQty: number,
  pieceAmount: number,
) {
  const subsidy = roundSalaryAmount(existing?.subsidy)
  const deduction = roundSalaryAmount(existing?.deduction)
  const totalPieceAmount = roundSalaryAmount(pieceAmount)
  const payload = {
    user_id: userId,
    work_date: workDate,
    total_qualified_qty: Math.max(0, Math.round(qualifiedQty)),
    total_piece_amount: totalPieceAmount,
    subsidy,
    deduction,
    total_amount: roundSalaryAmount(totalPieceAmount + subsidy - deduction),
    status: existing?.status || 'DRAFT',
    confirmed_by: existing?.confirmed_by || null,
    confirmed_at: existing?.confirmed_at || null,
  }
  return payload
}

async function upsertDailySalarySummary(userId: number, workDate: string, goodQty: number, pieceAmount: number) {
  const supabase = getSupabaseClient()
  const existing = await assertDailySalaryEditable(userId, workDate)
  const nextTotalPieceAmount = roundSalaryAmount(toNumber(existing?.total_piece_amount) + pieceAmount)
  const nextQualifiedQty = toNumber(existing?.total_qualified_qty) + goodQty
  const payload = buildDailySalarySummaryPayload(existing, userId, workDate, nextQualifiedQty, nextTotalPieceAmount)
  if (existing?.id) {
    const { error } = await supabase.from('salary_daily').update(payload).eq('id', existing.id)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('salary_daily').insert(payload)
  if (error) throw error
}

async function rebuildDailySalarySummary(userId: number, workDate: string) {
  const supabase = getSupabaseClient()
  const existing = await assertDailySalaryEditable(userId, workDate)
  const bounds = dailySalaryDateBounds(workDate)
  const { data, error } = await supabase
    .from('prod_report')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', bounds.startTime)
    .lte('start_time', bounds.endTime)
  if (error) throw error

  const reports = toCamelDeep(data || [])
  const orderMap = await loadRowsByIds('prod_order', reports.map((item: any) => item.prodOrderId))
  const piecePriceRows = await loadRowsByColumn(
    'piece_price',
    'product_id',
    Array.from(orderMap.values()).map((item: any) => item.productId),
  )
  const summary = reports.reduce(
    (total: { qualifiedQty: number; pieceAmount: number }, report: any) => {
      const order = orderMap.get(report.prodOrderId)
      const processName = normalizeSalaryProcessName(report.processName)
      const workDate = getSalaryReportWorkDate(report)
      const price = choosePiecePrice(piecePriceRows, order?.productId, processName, report.startTime || report.createdAt)
      const unitPrice = toNumber(price?.price)
      const goodQty = Math.max(toNumber(report.qty) - toNumber(report.badQty), 0)
      assertReportPiecePrice(price, goodQty, order?.productName || order?.orderNo || '', processName, workDate)
      total.qualifiedQty += goodQty
      total.pieceAmount = roundSalaryAmount(total.pieceAmount + goodQty * unitPrice)
      return total
    },
    { qualifiedQty: 0, pieceAmount: 0 },
  )

  if (!reports.length && existing?.id && !toNumber(existing.subsidy) && !toNumber(existing.deduction)) {
    const { error: deleteError } = await supabase.from('salary_daily').delete().eq('id', existing.id)
    if (deleteError) throw deleteError
    return
  }

  if (!reports.length && !existing?.id) return

  const payload = buildDailySalarySummaryPayload(existing, userId, workDate, summary.qualifiedQty, summary.pieceAmount)
  if (existing?.id) {
    const { error: updateError } = await supabase.from('salary_daily').update(payload).eq('id', existing.id)
    if (updateError) throw updateError
    return
  }
  const { error: insertError } = await supabase.from('salary_daily').insert(payload)
  if (insertError) throw insertError
}

async function rebuildDailySalarySummaryIfEditable(userId: number, workDate: string) {
  const existing = await loadDailySalarySummary(userId, workDate)
  if (existing?.id && isSalaryDailySettled(existing.status)) return false
  await rebuildDailySalarySummary(userId, workDate)
  return true
}

function assertReportPiecePrice(price: any, goodQty: number, productName: string, processName: string, workDate: string) {
  if (goodQty <= 0 || price?.id || price?.price !== undefined) return
  throw new Error(`${productName || '产品'} / ${processName || '注塑'} 在 ${workDate} 无有效计件单价，不能报工入账`)
}

async function submitProdReport(data: any) {
  const supabase = getSupabaseClient()
  const currentUserId = Number(data?.userId || getCurrentUserId() || 0)
  if (!currentUserId) {
    throw new Error('请先登录')
  }
  const prodOrderId = Number(data?.prodOrderId || data?.workOrderId || 0)
  if (!prodOrderId) {
    throw new Error('请选择有效的工单')
  }
  const { data: orderRow, error: orderError } = await supabase.from('prod_order').select('*').eq('id', prodOrderId).maybeSingle()
  if (orderError) throw orderError
  const order = toCamelDeep(orderRow || {})
  const quantity = toNumber(data?.qty || data?.quantity)
  const badQty = toNumber(data?.badQty || data?.defectCount)
  const shots = toNumber(data?.shots || data?.moldCount)
  if (!order?.id) throw new Error('未找到生产工单')
  if (!['SCHEDULED', 'RUNNING', 'PAUSED'].includes(normalizeBusinessStatus(order.status))) {
    throw new Error('仅已派工、生产中或暂停工单允许报工')
  }
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error('产量必须是非负整数')
  if (!Number.isInteger(badQty) || badQty < 0) throw new Error('不良数量必须是非负整数')
  if (badQty > quantity) throw new Error('不良数量不能超过产量')
  if (!Number.isInteger(shots) || shots < 0) throw new Error('模次必须是非负整数')
  if (!Number(data?.machineId || order.machineId || 0)) throw new Error('请选择机台')
  const reportTime = data?.startTime || new Date().toISOString()
  const workDate = getSalaryReportWorkDate({ startTime: reportTime }) || formatLocalDate(new Date(reportTime))
  await assertDailySalaryEditable(currentUserId, workDate)
  const productId = Number(order.productId || data?.productId || 0)
  const processName = normalizeSalaryProcessName(data?.processName)
  const piecePrices = await loadRowsByColumn('piece_price', 'product_id', [productId])
  const goodQty = Math.max(quantity - badQty, 0)
  const price = choosePiecePrice(piecePrices, productId, processName, reportTime)
  assertReportPiecePrice(price, goodQty, order.productName || order.orderNo || '', processName, workDate)
  const unitPrice = toNumber(price?.price)
  const totalAmount = Number((goodQty * unitPrice).toFixed(2))
  const insertPayload = {
    user_id: currentUserId,
    prod_order_id: prodOrderId,
    machine_id: Number(data?.machineId || order.machineId || 0),
    mold_id: Number(data?.moldId || order.moldId || 0) || null,
    report_type: data?.reportType || 'OUTPUT',
    process_name: processName,
    shift: data?.shift || 'DAY',
    qty: quantity,
    bad_qty: badQty,
    shots,
    start_time: data?.startTime || reportTime,
    end_time: data?.endTime || reportTime,
    work_minutes: data?.workMinutes ? Number(data.workMinutes) : 0,
    sync_status: 1,
  }
  const { data: created, error } = await supabase.from('prod_report').insert(insertPayload).select().single()
  if (error) throw error

  const nextCompletedQty = toNumber(order.completedQty) + quantity
  const nextQualifiedQty = toNumber(order.qualifiedQty) + goodQty
  const nextBadQty = toNumber(order.badQty) + badQty
  const currentStatus = normalizeBusinessStatus(order.status)
  const nextStatus = currentStatus === 'PAUSED' ? 'PAUSED' : 'RUNNING'
  const { error: orderUpdateError } = await supabase
    .from('prod_order')
    .update({
      completed_qty: nextCompletedQty,
      qualified_qty: nextQualifiedQty,
      bad_qty: nextBadQty,
      status: nextStatus,
      actual_start: order.actualStart || reportTime,
      actual_end: order.actualEnd || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', prodOrderId)
  if (orderUpdateError) throw orderUpdateError

  await upsertDailySalarySummary(currentUserId, workDate, goodQty, totalAmount)
  return ok(toCamelDeep(created), 'created')
}

function readPayloadValue(payload: any, keys: string[], fallback?: any) {
  for (const key of keys) {
    if (payload?.[key] !== undefined && payload?.[key] !== null && payload?.[key] !== '') return payload[key]
  }
  return fallback
}

function validateProdReportNumbers(quantity: number, badQty: number, shots: number) {
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error('产量必须是非负整数')
  if (!Number.isInteger(badQty) || badQty < 0) throw new Error('不良数量必须是非负整数')
  if (badQty > quantity) throw new Error('不良数量不能超过产量')
  if (!Number.isInteger(shots) || shots < 0) throw new Error('模次必须是非负整数')
}

function buildProdReportMutation(data: any, existing: any, order: any) {
  const userId = Number(readPayloadValue(data, ['userId', 'user_id'], existing.userId))
  const prodOrderId = Number(readPayloadValue(data, ['prodOrderId', 'workOrderId', 'prod_order_id'], existing.prodOrderId))
  const machineId = Number(readPayloadValue(data, ['machineId', 'machine_id'], existing.machineId || order.machineId || 0))
  const moldId = Number(readPayloadValue(data, ['moldId', 'mold_id'], existing.moldId || order.moldId || 0)) || null
  const quantity = toNumber(readPayloadValue(data, ['qty', 'quantity'], existing.qty))
  const badQty = toNumber(readPayloadValue(data, ['badQty', 'bad_qty', 'defectCount'], existing.badQty))
  const shots = toNumber(readPayloadValue(data, ['shots', 'moldCount'], existing.shots))
  const reportTime = readPayloadValue(data, ['startTime', 'start_time'], existing.startTime || new Date().toISOString())
  const endTime = readPayloadValue(data, ['endTime', 'end_time'], existing.endTime || reportTime)
  const processName = normalizeSalaryProcessName(readPayloadValue(data, ['processName', 'process_name'], existing.processName || existing.process_name))
  if (!userId) throw new Error('请先登录')
  if (!prodOrderId) throw new Error('请选择有效的工单')
  if (!machineId) throw new Error('请选择机台')
  validateProdReportNumbers(quantity, badQty, shots)
  const workDate = getSalaryReportWorkDate({ startTime: reportTime }) || normalizeSalaryDate(reportTime)
  if (!workDate) throw new Error('请选择有效的开始时间')
  return {
    payload: {
      user_id: userId,
      prod_order_id: prodOrderId,
      machine_id: machineId,
      mold_id: moldId,
      report_type: readPayloadValue(data, ['reportType', 'report_type'], existing.reportType || 'OUTPUT'),
      process_name: processName,
      shift: readPayloadValue(data, ['shift'], existing.shift || 'DAY'),
      qty: quantity,
      bad_qty: badQty,
      shots,
      start_time: reportTime,
      end_time: endTime,
      work_minutes: data?.workMinutes ? Number(data.workMinutes) : toNumber(existing.workMinutes),
      sync_status: 1,
    },
    userId,
    prodOrderId,
    processName,
    workDate,
    quantity,
    badQty,
    goodQty: Math.max(quantity - badQty, 0),
  }
}

function reportQtyDelta(next: { quantity: number; badQty: number; goodQty: number }, previous?: any) {
  return {
    quantity: next.quantity - toNumber(previous?.qty),
    badQty: next.badQty - toNumber(previous?.badQty),
    goodQty: next.goodQty - Math.max(toNumber(previous?.qty) - toNumber(previous?.badQty), 0),
  }
}

async function applyProdOrderReportDelta(orderId: number, delta: { quantity: number; badQty: number; goodQty: number }) {
  if (!orderId || (!delta.quantity && !delta.badQty && !delta.goodQty)) return
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('prod_order').select('*').eq('id', orderId).maybeSingle()
  if (error) throw error
  const order = toCamelDeep(data || {})
  if (!order?.id) throw new Error('未找到生产工单')
  const { error: updateError } = await supabase
    .from('prod_order')
    .update({
      completed_qty: Math.max(0, toNumber(order.completedQty) + delta.quantity),
      qualified_qty: Math.max(0, toNumber(order.qualifiedQty) + delta.goodQty),
      bad_qty: Math.max(0, toNumber(order.badQty) + delta.badQty),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
  if (updateError) throw updateError
}

async function updateProdReportRecord(id: number, data: any) {
  const supabase = getSupabaseClient()
  const { data: oldRow, error: oldError } = await supabase.from('prod_report').select('*').eq('id', id).maybeSingle()
  if (oldError) throw oldError
  const existing = toCamelDeep(oldRow || {})
  if (!existing?.id) throw new Error('未找到报工记录')

  const oldWorkDate = getSalaryReportWorkDate(existing)
  if (!oldWorkDate) throw new Error('原报工归属日期无效')
  await assertDailySalaryEditable(existing.userId, oldWorkDate)
  const newProdOrderId = Number(readPayloadValue(data, ['prodOrderId', 'workOrderId', 'prod_order_id'], existing.prodOrderId))
  const { data: orderRow, error: orderError } = await supabase.from('prod_order').select('*').eq('id', newProdOrderId).maybeSingle()
  if (orderError) throw orderError
  const order = toCamelDeep(orderRow || {})
  if (!order?.id) throw new Error('未找到生产工单')
  if (!['SCHEDULED', 'RUNNING', 'PAUSED'].includes(normalizeBusinessStatus(order.status))) {
    throw new Error('仅已派工、生产中或暂停工单允许报工')
  }

  const next = buildProdReportMutation(data, existing, order)
  await assertDailySalaryEditable(next.userId, next.workDate)
  const piecePrices = await loadRowsByColumn('piece_price', 'product_id', [order.productId])
  const price = choosePiecePrice(piecePrices, order.productId, next.processName, next.payload.start_time)
  assertReportPiecePrice(price, next.goodQty, order.productName || order.orderNo || '', next.processName, next.workDate)
  const { data: updated, error } = await supabase.from('prod_report').update(next.payload).eq('id', id).select().single()
  if (error) throw error

  if (existing.prodOrderId === next.prodOrderId) {
    await applyProdOrderReportDelta(next.prodOrderId, reportQtyDelta(next, existing))
  } else {
    await applyProdOrderReportDelta(existing.prodOrderId, {
      quantity: -toNumber(existing.qty),
      badQty: -toNumber(existing.badQty),
      goodQty: -Math.max(toNumber(existing.qty) - toNumber(existing.badQty), 0),
    })
    await applyProdOrderReportDelta(next.prodOrderId, { quantity: next.quantity, badQty: next.badQty, goodQty: next.goodQty })
  }

  await rebuildDailySalarySummary(existing.userId, oldWorkDate)
  if (existing.userId !== next.userId || oldWorkDate !== next.workDate) {
    await rebuildDailySalarySummary(next.userId, next.workDate)
  }
  return ok(toCamelDeep(updated), 'updated')
}

async function deleteProdReportRecord(id: number) {
  const supabase = getSupabaseClient()
  const { data: oldRow, error: oldError } = await supabase.from('prod_report').select('*').eq('id', id).maybeSingle()
  if (oldError) throw oldError
  const existing = toCamelDeep(oldRow || {})
  if (!existing?.id) throw new Error('未找到报工记录')
  const workDate = getSalaryReportWorkDate(existing)
  if (!workDate) throw new Error('报工归属日期无效')
  await assertDailySalaryEditable(existing.userId, workDate)
  const { error } = await supabase.from('prod_report').delete().eq('id', id)
  if (error) throw error
  await applyProdOrderReportDelta(existing.prodOrderId, {
    quantity: -toNumber(existing.qty),
    badQty: -toNumber(existing.badQty),
    goodQty: -Math.max(toNumber(existing.qty) - toNumber(existing.badQty), 0),
  })
  await rebuildDailySalarySummary(existing.userId, workDate)
  return ok(true, 'deleted')
}

function relatedDisplayName(row: any, fallback = '-') {
  if (!row) return fallback
  return [row.code, row.name || row.realName || row.username].filter(Boolean).join(' - ') || row.name || row.realName || row.username || fallback
}

async function buildProdReportRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  const keyword = String(params?.keyword || '').trim().toLowerCase()
  let query = supabase.from('prod_report').select('*', { count: 'exact' })
  if (params?.startDate) {
    query = query.gte('start_time', dailySalaryDateBounds(params.startDate).startTime)
  }
  if (params?.endDate) {
    query = query.lte('start_time', dailySalaryDateBounds(params.endDate).endTime)
  }
  if (params?.reportType) {
    query = query.eq('report_type', params.reportType)
  }
  if (params?.shift) {
    query = query.eq('shift', params.shift)
  }
  if (params?.processName) {
    query = query.ilike('process_name', `%${String(params.processName).trim()}%`)
  }
  query = query.order('start_time', { ascending: false })
  query = keyword ? query.range(0, 499) : query.range(from, to)

  const { data, error, count } = await query
  if (error) throw error
  const reports = toCamelDeep(data || [])
  const orderMap = await loadRowsByIds('prod_order', reports.map((item: any) => item.prodOrderId), 'id, order_no, product_id')
  const productMap = await loadRowsByIds(
    'product',
    Array.from(orderMap.values()).map((item: any) => item.productId),
    'id, code, name'
  )
  const machineMap = await loadRowsByIds('machine', reports.map((item: any) => item.machineId), 'id, code, name')
  const moldMap = await loadRowsByIds('mold', reports.map((item: any) => item.moldId), 'id, code, name')
  const userMap = await loadRowsByIds('sys_user', reports.map((item: any) => item.userId), 'id, username, real_name')
  const records = reports.map((item: any) => {
    const order = orderMap.get(item.prodOrderId)
    const product = order ? productMap.get(order.productId) : undefined
    const machine = machineMap.get(item.machineId)
    const mold = moldMap.get(item.moldId)
    const user = userMap.get(item.userId)
    return {
      ...item,
      orderNo: order?.orderNo || `#${item.prodOrderId}`,
      productId: order?.productId,
      productName: product?.name || '',
      machineName: relatedDisplayName(machine),
      moldName: relatedDisplayName(mold),
      reporterName: relatedDisplayName(user),
      processName: normalizeSalaryProcessName(item.processName),
    }
  })
  const filtered = keyword
    ? records.filter((item: any) =>
        [
          item.orderNo,
          item.productName,
          item.machineName,
          item.moldName,
          item.reporterName,
          item.reportType,
          item.processName,
          item.shift,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      )
    : records
  const sliced = keyword ? filtered.slice(from, to + 1) : filtered
  return ok({ records: sliced, list: sliced, total: keyword ? filtered.length : count || sliced.length })
}

async function rebuildUnsettledDailySalaryForPrice(priceRow: any) {
  const row = toCamelDeep(priceRow || {})
  const productId = Number(row.productId || row.product_id || 0)
  const processName = normalizeSalaryProcessName(row.processName || row.process_name)
  const startDate = normalizeSalaryDate(row.effectiveDate || row.effective_date)
  const endDate = normalizeSalaryDate(row.expireDate || row.expire_date) || formatLocalDate(new Date())
  if (!productId || !processName || !startDate || endDate < startDate) return 0

  const supabase = getSupabaseClient()
  const { data: orderRows, error: orderError } = await supabase
    .from('prod_order')
    .select('id')
    .eq('product_id', productId)
  if (orderError) throw orderError
  const orderIds = (orderRows || []).map((item: any) => Number(item.id)).filter(Boolean)
  if (!orderIds.length) return 0

  const startBounds = dailySalaryDateBounds(startDate)
  const endBounds = dailySalaryDateBounds(endDate)
  const { data: reports, error: reportError } = await supabase
    .from('prod_report')
    .select('user_id, start_time, process_name')
    .in('prod_order_id', orderIds)
    .eq('process_name', processName)
    .gte('start_time', startBounds.startTime)
    .lte('start_time', endBounds.endTime)
  if (reportError) throw reportError

  const keys: string[] = Array.from(
    new Set<string>(
      toCamelDeep(reports || [])
        .map((report: any) => {
          const workDate = getSalaryReportWorkDate(report)
          return report.userId && workDate ? `${report.userId}:${workDate}` : ''
        })
        .filter(Boolean),
    ),
  )

  let rebuiltCount = 0
  for (const key of keys) {
    const [userIdText, workDate] = key.split(':')
    const rebuilt = await rebuildDailySalarySummaryIfEditable(Number(userIdText), workDate)
    if (rebuilt) rebuiltCount += 1
  }
  return rebuiltCount
}

async function syncProductPiecePrice(productId: number) {
  if (!productId) return
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('piece_price').select('*').eq('product_id', productId)
  if (error) throw error
  const activePrice = chooseSalaryPiecePrice(data || [], productId, '注塑', new Date())
  const { error: updateError } = await supabase
    .from('product')
    .update({ piece_price: activePrice ? Number(activePrice.price || 0) : null })
    .eq('id', productId)
  if (updateError) throw updateError
}

async function listSalaryPriceRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  let query = supabase.from('piece_price').select('*').order('effective_date', { ascending: false })
  if (params?.productId) query = query.eq('product_id', Number(params.productId))
  if (params?.processName) query = query.ilike('process_name', `%${String(params.processName).trim()}%`)
  if (params?.priceDate) {
    const priceDate = normalizeSalaryDate(params.priceDate)
    if (priceDate) {
      query = query.lte('effective_date', priceDate).or(`expire_date.is.null,expire_date.gte.${priceDate}`)
    }
  }

  const { data, error } = await query
  if (error) throw error
  const rows = toCamelDeep(data || [])
  const productMap = await loadRowsByIds('product', rows.map((item: any) => item.productId), 'id, code, name')
  const keyword = String(params?.keyword || '').trim().toLowerCase()
  const status = String(params?.status || '').trim().toUpperCase()
  const records = rows
    .map((row: any) => buildSalaryPriceRow(row, productMap.get(row.productId)))
    .filter((row: any) => !status || row.status === status)
    .filter((row: any) => {
      if (!keyword) return true
      return [row.productName, row.productCode, row.processName]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(keyword))
    })

  const sliced = records.slice(from, to + 1)
  return ok({ records: sliced, list: sliced, total: records.length })
}

async function saveSalaryPriceRecord(id: number | undefined, data: any) {
  const supabase = getSupabaseClient()
  const validationMessage = validateSalaryPriceInput(data || {})
  if (validationMessage) throw new Error(validationMessage)
  const normalized = normalizeSalaryPriceInput(data || {})
  let previousRow: any
  if (id) {
    const { data: oldRow, error: oldError } = await supabase.from('piece_price').select('*').eq('id', id).maybeSingle()
    if (oldError) throw oldError
    if (!oldRow?.id) throw new Error('未找到计件单价')
    previousRow = oldRow
  }
  const { data: product, error: productError } = await supabase
    .from('product')
    .select('id, name')
    .eq('id', normalized.productId)
    .maybeSingle()
  if (productError) throw productError
  if (!product?.id) throw new Error('未找到产品档案')

  const { data: sameProcessRows, error: priceError } = await supabase
    .from('piece_price')
    .select('*')
    .eq('product_id', normalized.productId)
    .eq('process_name', normalized.processName)
  if (priceError) throw priceError
  const overlapped = findOverlappedSalaryPrice(toCamelDeep(sameProcessRows || []), normalized, id)
  if (overlapped) {
    throw new Error('同一产品和工序的计件单价生效区间不能重叠')
  }

  const payload = {
    product_id: normalized.productId,
    process_name: normalized.processName,
    price: normalized.price,
    effective_date: normalized.effectiveDate,
    expire_date: normalized.expireDate || null,
    created_by: getCurrentUserId() || null,
  }

  let result
  if (id) {
    const { data: updated, error } = await supabase.from('piece_price').update(payload).eq('id', id).select().single()
    if (error) throw error
    result = updated
  } else {
    const { data: created, error } = await supabase.from('piece_price').insert(payload).select().single()
    if (error) throw error
    result = created
  }

  if (previousRow && Number(previousRow.product_id || 0) !== normalized.productId) {
    await syncProductPiecePrice(Number(previousRow.product_id || 0))
  }
  await syncProductPiecePrice(normalized.productId)
  if (previousRow) await rebuildUnsettledDailySalaryForPrice(previousRow)
  await rebuildUnsettledDailySalaryForPrice(result)
  return ok(buildSalaryPriceRow(toCamelDeep(result), { id: product.id, name: product.name }), id ? 'updated' : 'created')
}

async function deleteSalaryPriceRecord(id: number) {
  const supabase = getSupabaseClient()
  const { data, error: fetchError } = await supabase.from('piece_price').select('*').eq('id', id).maybeSingle()
  if (fetchError) throw fetchError
  if (!data?.id) throw new Error('未找到计件单价')
  const status = getSalaryPriceStatus(toCamelDeep(data))
  if (status === 'ACTIVE') throw new Error('生效中的计件单价不能删除，请先设置失效日期')
  const productId = Number(data.product_id || 0)
  const { error } = await supabase.from('piece_price').delete().eq('id', id)
  if (error) throw error
  await syncProductPiecePrice(productId)
  await rebuildUnsettledDailySalaryForPrice(data)
  return ok(true, 'deleted')
}

async function submitQcRecord(data: any) {
  const supabase = getSupabaseClient()
  const checkerId = Number(data?.checkerId || getCurrentUserId() || 0)
  if (!checkerId) {
    throw new Error('请先登录')
  }
  const prodOrderId = Number(data?.prodOrderId || data?.workOrderId || 0) || null
  let productId = Number(data?.productId || 0) || null
  if (!productId && prodOrderId) {
    const { data: orderRow, error: orderError } = await supabase.from('prod_order').select('product_id').eq('id', prodOrderId).maybeSingle()
    if (orderError) throw orderError
    productId = Number(orderRow?.product_id || 0) || null
  }
  if (!productId) {
    throw new Error('请选择有效的产品')
  }
  const payload = {
    prod_order_id: prodOrderId,
    product_id: productId,
    check_type: data?.checkType || data?.inspectionType || 'IPQC',
    check_result: data?.checkResult || (data?.result === '合格' ? 'PASS' : data?.result === '不合格' ? 'FAIL' : data?.result) || 'PASS',
    defect_type: data?.defectType || '',
    defect_desc: data?.defectDesc || '',
    defect_qty: toNumber(data?.defectQty || 0),
    sample_qty: toNumber(data?.sampleQty || data?.sampleCount || 0),
    checker_id: checkerId,
    check_time: data?.checkTime || new Date().toISOString(),
    image_urls: Array.isArray(data?.imageUrls) ? data.imageUrls.join(',') : String(data?.imageUrls || data?.images || ''),
    remark: data?.remark || '',
  }
  const { data: created, error } = await supabase.from('qc_record').insert(payload).select().single()
  if (error) throw error
  return ok(toCamelDeep(created), 'created')
}

async function buildDailySalaryRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  const statusFilter = String(params?.status || '').trim().toUpperCase()
  let query = supabase.from('prod_report').select('*', { count: 'exact' })
  if (params?.date) {
    const day = normalizeSalaryDate(params.date)
    const bounds = day ? dailySalaryDateBounds(day) : dayBounds(params.date)
    query = query.gte('start_time', bounds.startTime).lte('start_time', bounds.endTime)
  }
  if (params?.startDate) {
    query = query.gte('start_time', dailySalaryDateBounds(params.startDate).startTime)
  }
  if (params?.endDate) {
    query = query.lte('start_time', dailySalaryDateBounds(params.endDate).endTime)
  }
  if (params?.processName) {
    query = query.ilike('process_name', `%${String(params.processName).trim()}%`)
  }
  if (params?.userId || params?.workerId) {
    query = query.eq('user_id', Number(params.userId || params.workerId))
  }
  query = query.order('start_time', { ascending: false })
  if (!statusFilter) {
    query = query.range(from, to)
  }
  const { data, error, count } = await query
  if (error) throw error
  const reports = toCamelDeep(data || [])
  const orderMap = await loadRowsByIds('prod_order', reports.map((item: any) => item.prodOrderId))
  const productMap = await loadRowsByIds(
    'product',
    Array.from(orderMap.values()).map((item: any) => item.productId)
  )
  const userMap = await loadRowsByIds('sys_user', reports.map((item: any) => item.userId))
  const piecePriceRows = await loadRowsByColumn(
    'piece_price',
    'product_id',
    Array.from(orderMap.values()).map((item: any) => item.productId)
  )
  const reportDates = reports.map((item: any) => getSalaryReportWorkDate(item)).filter(Boolean)
  const salaryDailyMap = new Map<string, any>()
  if (reports.length && reportDates.length) {
    const userIds = Array.from(new Set(reports.map((item: any) => Number(item.userId)).filter(Boolean)))
    const sortedDates = Array.from(new Set(reportDates)).sort()
    if (userIds.length) {
      const { data: salaryRows, error: salaryError } = await supabase
        .from('salary_daily')
        .select('*')
        .in('user_id', userIds)
        .gte('work_date', sortedDates[0])
        .lte('work_date', sortedDates[sortedDates.length - 1])
      if (salaryError) throw salaryError
      for (const row of toCamelDeep(salaryRows || [])) {
        salaryDailyMap.set(`${row.userId}:${row.workDate}`, row)
      }
    }
  }
  const records = reports.map((item: any) => {
    const order = orderMap.get(item.prodOrderId)
    const product = order ? productMap.get(order.productId) : undefined
    const user = userMap.get(item.userId)
    const processName = normalizeSalaryProcessName(item.processName)
    const price = choosePiecePrice(piecePriceRows, order?.productId, processName, item.startTime || item.createdAt)
    const unitPrice = toNumber(price?.price)
    const workDate = getSalaryReportWorkDate(item)
    const salaryDaily = salaryDailyMap.get(`${item.userId}:${workDate}`)
    const goodQty = Math.max(toNumber(item.qty) - toNumber(item.badQty), 0)
    const priceMissing = goodQty > 0 && !(price?.id || price?.price !== undefined)
    return buildSalaryDailyReportLine(item, {
      userId: item.userId,
      workerName: user?.realName || user?.username || '-',
      productName: product?.name || '-',
      processName,
      unitPrice,
      priceMissing,
      priceMessage: priceMissing ? `${product?.name || '产品'} / ${processName} 在 ${workDate} 无有效计件单价` : '',
      salaryDailyId: salaryDaily?.id,
      status: salaryDaily?.status || 'DRAFT',
      confirmedAt: salaryDaily?.confirmedAt || '',
    })
  })
  const filtered = statusFilter ? records.filter((item: any) => item.status === statusFilter) : records
  const sliced = statusFilter ? filtered.slice(from, to + 1) : filtered
  return ok({ records: sliced, list: sliced, total: statusFilter ? filtered.length : count || sliced.length })
}

async function buildMonthlySalaryRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  const scope = createSalaryMonthScope(params)
  let dailyQuery = supabase
    .from('salary_daily')
    .select('*')
    .gte('work_date', scope.startDate)
    .lte('work_date', scope.endDate)
    .order('work_date', { ascending: false })
  let adjustQuery = supabase
    .from('salary_adjust')
    .select('*')
    .gte('adjust_date', scope.startDate)
    .lte('adjust_date', scope.endDate)
    .order('adjust_date', { ascending: false })
  if (params?.userId || params?.workerId) {
    const targetUserId = Number(params.userId || params.workerId)
    dailyQuery = dailyQuery.eq('user_id', targetUserId)
    adjustQuery = adjustQuery.eq('user_id', targetUserId)
  }
  const [dailyResult, adjustResult] = await Promise.all([dailyQuery, adjustQuery])
  if (dailyResult.error) throw dailyResult.error
  if (adjustResult.error) throw adjustResult.error
  const rows = toCamelDeep(dailyResult.data || [])
  const adjusts = toCamelDeep(adjustResult.data || [])
  const userMap = await loadRowsByIds('sys_user', [
    ...rows.map((item: any) => item.userId),
    ...adjusts.map((item: any) => item.userId),
  ])
  const records = buildMonthlySalarySummary(rows, adjusts, userMap, scope.month)
  const sliced = records.slice(from, to + 1)
  return ok({
    records: sliced,
    list: sliced,
    total: records.length,
    month: scope.month,
    startDate: scope.startDate,
    endDate: scope.endDate,
  })
}

async function listSalaryAdjustRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  let query: any = supabase.from('salary_adjust').select('*', { count: 'exact' })
  const keyword = String(params?.keyword || '').trim()
  if (keyword) {
    query = query.ilike('reason', `%${keyword}%`)
  }
  if (params?.type || params?.adjustType) {
    query = query.eq('adjust_type', normalizeSalaryAdjustType(params.type || params.adjustType))
  }
  if (params?.status) {
    query = query.eq('status', normalizeSalaryAdjustStatus(params.status))
  }
  if (params?.userId || params?.workerId) {
    query = query.eq('user_id', Number(params.userId || params.workerId))
  }
  if (params?.startDate) {
    query = query.gte('adjust_date', params.startDate)
  }
  if (params?.endDate) {
    query = query.lte('adjust_date', params.endDate)
  }
  query = query.order('adjust_date', { ascending: false }).range(from, to)
  const { data, error, count } = await query
  if (error) throw error
  const rows = toCamelDeep(data || [])
  const userMap = await loadRowsByIds('sys_user', rows.map((item: any) => item.userId))
  const records = rows.map((item: any) => {
    const adjustType = normalizeSalaryAdjustType(item.adjustType || item.type)
    const type = adjustType === 'PENALTY' ? 'penalty' : 'bonus'
    const user = userMap.get(Number(item.userId))
    return {
      ...item,
      workerId: item.userId,
      workerName: user?.realName || user?.username || '-',
      adjustType,
      type,
      amount: roundSalaryAmount(item.amount),
      date: item.adjustDate,
      status: normalizeSalaryAdjustStatus(item.status),
    }
  })
  return ok({ records, list: records, total: count || records.length })
}

async function saveSalaryAdjustRecord(id: number | undefined, payload: any) {
  const errorMessage = validateSalaryAdjustInput(payload)
  if (errorMessage) throw new Error(errorMessage)
  const normalized = normalizeSalaryAdjustInput(payload)
  const dbPayload: Record<string, any> = {
    user_id: normalized.userId,
    adjust_type: normalized.adjustType,
    amount: normalized.amount,
    adjust_date: normalized.adjustDate,
    reason: normalized.reason,
    status: ['DRAFT', 'SETTLED'].includes(normalized.status) ? normalized.status : 'DRAFT',
  }
  if (id) {
    const { data: current, error: currentError } = await getSupabaseClient()
      .from('salary_adjust')
      .select('id, status')
      .eq('id', id)
      .maybeSingle()
    if (currentError) throw currentError
    if (String(current?.status || '').toUpperCase() === 'SETTLED') {
      throw new Error('已结算奖惩不可编辑')
    }
    const { data, error } = await getSupabaseClient()
      .from('salary_adjust')
      .update(dbPayload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return ok(toCamelDeep(data), 'updated')
  }
  dbPayload.created_by = getCurrentUserId() || null
  const { data, error } = await getSupabaseClient()
    .from('salary_adjust')
    .insert(dbPayload)
    .select()
    .single()
  if (error) throw error
  return ok(toCamelDeep(data), 'created')
}

async function deleteSalaryAdjustRecord(id: number) {
  const { data: current, error: currentError } = await getSupabaseClient()
    .from('salary_adjust')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()
  if (currentError) throw currentError
  if (String(current?.status || '').toUpperCase() === 'SETTLED') {
    throw new Error('已结算奖惩不可删除')
  }
  return deleteTable(resolveResourceRoute('/salary/adjust')!, id)
}

async function buildStockRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  const { data, error } = await supabase.from('stock').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  const rows = toCamelDeep(data || [])
  const productMap = await loadRowsByIds('product', rows.map((item: any) => item.productId))
  const warehouseMap = await loadRowsByIds('warehouse', rows.map((item: any) => item.warehouseId))
  const locationMap = await loadRowsByIds('warehouse_location', rows.map((item: any) => item.locationId))
  const batchMap = await loadRowsByIds('material_batch', rows.map((item: any) => item.batchId))
  const stockCostMap = await loadInboundStockCostMap(rows)
  const supplierMap = await loadRowsByIds(
    'supplier',
    Array.from(batchMap.values()).map((item: any) => item.supplierId),
    'id, code, name'
  )
  const keyword = String(params?.keyword || '').trim().toLowerCase()
  const filtered = rows
    .map((item: any) => {
      const product = productMap.get(item.productId)
      const warehouse = warehouseMap.get(item.warehouseId)
      const location = locationMap.get(item.locationId)
      const batch = batchMap.get(item.batchId)
      const supplier = supplierMap.get(batch?.supplierId)
      const qty = toNumber(item.qty)
      const unitCost = resolveStockUnitCostFromMap(stockCostMap, item, product)
      const batchRemainingQty = qty
      return {
        id: item.id,
        productId: item.productId,
        productCode: product?.code || '-',
        productName: product?.name || '-',
        productUnit: product?.unit || '',
        warehouseId: item.warehouseId,
        warehouseName: warehouse?.name || '-',
        locationId: item.locationId,
        locationCode: location?.code || '-',
        batchId: item.batchId,
        batchNo: batch?.batchNo || '-',
        batchStatus: resolveBatchStatus(batch ? { ...batch, remainingQty: batchRemainingQty } : null),
        batchProductionDate: normalizeDateOnly(batch?.productionDate),
        batchExpiryDate: normalizeDateOnly(batch?.expiryDate),
        batchInitialQty: toNumber(batch?.initialQty),
        batchRemainingQty,
        supplierId: batch?.supplierId,
        supplierName: supplier?.name || '-',
        qty,
        lockedQty: toNumber(item.lockedQty),
        availableQty: Math.max(toNumber(item.qty) - toNumber(item.lockedQty), 0),
        unitCost,
        inventoryAmount: roundMoney(qty * unitCost),
        updateTime: item.updatedAt || item.updated_at || '',
      }
    })
    .filter((item: any) => {
      if (!keyword) return true
      return [
        item.productCode,
        item.productName,
        item.warehouseName,
        item.supplierName,
        item.locationCode,
        item.batchNo,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  const scoped = filtered.filter((item: any) => {
    if (params?.warehouseId && Number(item.warehouseId) !== Number(params.warehouseId)) return false
    if (params?.locationId && Number(item.locationId) !== Number(params.locationId)) return false
    if (params?.productId && Number(item.productId) !== Number(params.productId)) return false
    if (params?.supplierId && Number(item.supplierId) !== Number(params.supplierId)) return false
    return true
  })
  const records = scoped.slice(from, to + 1)
  return ok({ records, list: records, total: scoped.length })
}

async function buildStockLedgerRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  let query = supabase.from('stock_move').select('*')
  if (params?.startDate) {
    query = query.gte('operate_time', `${params.startDate} 00:00:00`)
  }
  if (params?.endDate) {
    query = query.lte('operate_time', `${params.endDate} 23:59:59`)
  }
  if (params?.moveType) {
    query = query.eq('move_type', params.moveType)
  }
  if (params?.moveReason) {
    query = query.eq('move_reason', params.moveReason)
  }
  if (params?.relatedOrderType) {
    query = query.eq('related_order_type', params.relatedOrderType)
  }
  if (params?.productId) {
    query = query.eq('product_id', Number(params.productId))
  }
  if (params?.warehouseId) {
    query = query.eq('warehouse_id', Number(params.warehouseId))
  }
  if (params?.toWarehouseId) {
    query = query.eq('to_warehouse_id', Number(params.toWarehouseId))
  }
  const { data, error } = await query.order('operate_time', { ascending: false })
  if (error) throw error
  const rows = toCamelDeep(data || [])
  const productMap = await loadRowsByIds('product', rows.map((item: any) => item.productId))
  const warehouseMap = await loadRowsByIds(
    'warehouse',
    rows.flatMap((item: any) => [item.warehouseId, item.toWarehouseId].filter(Boolean))
  )
  const locationMap = await loadRowsByIds('warehouse_location', rows.map((item: any) => item.locationId))
  const batchMap = await loadRowsByIds('material_batch', rows.map((item: any) => item.batchId))
  const batchStockRows = await loadRowsByColumn('stock', 'batch_id', rows.map((item: any) => item.batchId), 'batch_id, qty')
  const batchStockQtyMap = batchStockRows.reduce((map: Map<number, number>, item: any) => {
    const batchId = Number(item.batchId || 0)
    if (batchId) {
      map.set(batchId, (map.get(batchId) || 0) + toNumber(item.qty))
    }
    return map
  }, new Map<number, number>())
  const supplierMap = await loadRowsByIds(
    'supplier',
    Array.from(batchMap.values()).map((item: any) => item.supplierId),
    'id, code, name'
  )
  const orderMap = await loadRowsByIds(
    'prod_order',
    rows.filter((item: any) => item.relatedOrderType === 'PROD_ORDER').map((item: any) => item.relatedOrderId),
    'id, order_no'
  )
  const saleOrderMap = await loadRowsByIds(
    'sale_order',
    rows.filter((item: any) => item.relatedOrderType === 'SALE_ORDER').map((item: any) => item.relatedOrderId),
    'id, order_no, customer_id'
  )
  const saleOrderItemMap = await loadSaleOrderItemMap(
    rows.filter((item: any) => item.relatedOrderType === 'SALE_ORDER').map((item: any) => Number(item.relatedOrderId || 0))
  )
  const rawProductMap = await loadRowsByIds(
    'product',
    Array.from(productMap.values()).map((item: any) => item.rawMaterialId),
    'id, code, name, piece_price'
  )
  const inventoryMap = await loadRowsByIds(
    'stock_inventory',
    rows.filter((item: any) => item.relatedOrderType === 'STOCK_INVENTORY').map((item: any) => item.relatedOrderId),
    'id, inventory_no'
  )
  const transferMap = await loadRowsByIds(
    'stock_transfer',
    rows.filter((item: any) => item.relatedOrderType === 'STOCK_TRANSFER').map((item: any) => item.relatedOrderId),
    'id, transfer_no'
  )
  const customerMap = await loadRowsByIds(
    'customer',
    Array.from(saleOrderMap.values()).map((item: any) => item.customerId),
    'id, name, short_name'
  )
  const userMap = await loadRowsByIds('sys_user', rows.map((item: any) => item.operatorId), 'id, username, real_name')
  const keyword = String(params?.keyword || '').trim().toLowerCase()
  const filtered = rows
    .map((item: any) => {
      const product = productMap.get(item.productId)
      const warehouse = warehouseMap.get(item.warehouseId)
      const location = locationMap.get(item.locationId)
      const batch = batchMap.get(item.batchId)
      const supplier = supplierMap.get(batch?.supplierId)
      const batchRemainingQty = batchStockQtyMap.get(Number(item.batchId || 0)) ?? toNumber(batch?.remainingQty)
      const order = orderMap.get(item.relatedOrderId)
      const saleOrder = saleOrderMap.get(item.relatedOrderId)
      const saleOrderItems = saleOrderItemMap.get(Number(item.relatedOrderId || 0)) || []
      const saleOrderItem = item.saleOrderItemId
        ? saleOrderItems.find((row: any) => Number(row.id) === Number(item.saleOrderItemId))
        : saleOrderItems.find((row: any) => Number(row.productId) === Number(item.productId))
      const inventory = inventoryMap.get(item.relatedOrderId)
      const transfer = transferMap.get(item.relatedOrderId)
      const customer = customerMap.get(saleOrder?.customerId)
      const user = userMap.get(item.operatorId)
      const qty = toNumber(item.qty)
      const unitPrice = toNumber(saleOrderItem?.unitPrice)
      const saleAmount = item.relatedOrderType === 'SALE_ORDER' ? roundMoney(qty * unitPrice) : 0
      const recordedAmount = item.amount === null || item.amount === undefined || item.amount === '' ? undefined : toFiniteNumber(item.amount)
      const stockUnitCost = roundUnitCost(item.unitCost ?? (recordedAmount !== undefined && qty > 0 ? recordedAmount / qty : product?.piecePrice))
      const purchaseAmount = item.moveReason === 'IN_PURCHASE'
        ? roundMoney(toNumber(item.amount) || qty * stockUnitCost)
        : 0
      const cost = item.relatedOrderType === 'SALE_ORDER' && item.moveReason === 'OUT_SALE'
        ? resolveShipmentCost(item, productMap, rawProductMap)
        : { cost: 0, hasGap: false, reason: '' }
      const materialCost = roundMoney(cost.cost)
      const grossProfit = roundMoney(saleAmount - materialCost)
      return {
        id: item.id,
        moveNo: item.moveNo,
        productId: item.productId,
        productName: product?.name || '-',
        productCode: product?.code || '-',
        productUnit: product?.unit || '',
        warehouseId: item.warehouseId,
        warehouseName: warehouse?.name || '-',
        toWarehouseId: item.toWarehouseId,
        toWarehouseName: item.toWarehouseId ? warehouseMap.get(item.toWarehouseId)?.name || '-' : '-',
        locationId: item.locationId,
        locationCode: location?.code || '-',
        batchId: item.batchId,
        batchNo: batch?.batchNo || '-',
        batchStatus: resolveBatchStatus(batch ? { ...batch, remainingQty: batchRemainingQty } : null),
        batchProductionDate: normalizeDateOnly(batch?.productionDate),
        batchExpiryDate: normalizeDateOnly(batch?.expiryDate),
        batchInitialQty: toNumber(batch?.initialQty),
        batchRemainingQty,
        supplierId: batch?.supplierId,
        supplierName: supplier?.name || '-',
        moveType: item.moveType,
        moveReason: item.moveReason,
        qty,
        relatedOrderId: item.relatedOrderId,
        relatedOrderType: item.relatedOrderType,
        prodOrderNo: order?.orderNo || '-',
        saleOrderNo: saleOrder?.orderNo || '-',
        transferNo: transfer?.transferNo || (item.relatedOrderType === 'STOCK_TRANSFER' ? item.moveNo : '-'),
        saleOrderItemId: item.saleOrderItemId || saleOrderItem?.id,
        saleUnitPrice: unitPrice,
        saleAmount,
        stockUnitCost,
        stockAmount: roundMoney(toNumber(item.amount) || qty * stockUnitCost),
        purchaseUnitCost: item.moveReason === 'IN_PURCHASE' ? stockUnitCost : 0,
        purchaseAmount,
        materialCost,
        grossProfit,
        costStatus: cost.hasGap ? 'GAP' : item.relatedOrderType === 'SALE_ORDER' && item.moveReason === 'OUT_SALE' ? (cost as any).source || 'ESTIMATED' : '',
        costGapReason: cost.reason || '',
        inventoryNo: inventory?.inventoryNo || '-',
        customerId: saleOrder?.customerId,
        customerName: customer?.shortName || customer?.name || '-',
        operatorId: item.operatorId,
        operatorName: user?.realName || user?.username || '-',
        remark: item.remark || '',
        createdAt: item.operateTime || item.createdAt || '',
      }
    })
    .filter((item: any) => {
      if (!keyword) return true
      return [
        item.moveNo,
        item.productName,
        item.warehouseName,
        item.toWarehouseName,
        item.supplierName,
        item.saleOrderNo,
        item.inventoryNo,
        item.customerName,
        item.locationCode,
        item.batchNo,
        item.moveType,
        item.moveReason,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
    .filter((item: any) => {
      if (params?.supplierId && Number(item.supplierId) !== Number(params.supplierId)) return false
      if (params?.customerId && Number(item.customerId) !== Number(params.customerId)) return false
      return true
    })
  const records = filtered.slice(from, to + 1)
  return ok({ records, list: records, total: filtered.length, summary: summarizeStockLedgerRows(filtered) })
}

function createInventoryNo() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `PD-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

async function loadInventoryItems(inventoryIds: number[]) {
  const ids = Array.from(new Set(inventoryIds.filter((id) => Number.isFinite(id) && id > 0)))
  if (!ids.length) return new Map<number, any[]>()
  const { data, error } = await getSupabaseClient()
    .from('stock_inventory_item')
    .select('*')
    .in('inventory_id', ids)
    .order('id', { ascending: true })
  if (error) throw error
  const rows = toCamelDeep(data || [])
  const productMap = await loadRowsByIds('product', rows.map((item: any) => item.productId))
  const locationMap = await loadRowsByIds('warehouse_location', rows.map((item: any) => item.locationId))
  const batchMap = await loadRowsByIds('material_batch', rows.map((item: any) => item.batchId))
  const supplierMap = await loadRowsByIds(
    'supplier',
    Array.from(batchMap.values()).map((item: any) => item.supplierId),
    'id, code, name'
  )
  return rows.reduce((map: Map<number, any[]>, item: any) => {
    const product = productMap.get(item.productId)
    const location = locationMap.get(item.locationId)
    const batch = batchMap.get(item.batchId)
    const supplier = supplierMap.get(batch?.supplierId)
    const next = {
      id: item.id,
      inventoryId: item.inventoryId,
      productId: item.productId,
      productCode: product?.code || '-',
      productName: product?.name || '-',
      locationId: item.locationId,
      locationCode: location?.code || '-',
      batchId: item.batchId,
      batchNo: batch?.batchNo || '-',
      supplierId: batch?.supplierId || null,
      supplierCode: supplier?.code || '',
      supplierName: supplier?.name || '',
      bookQty: toNumber(item.bookQty),
      actualQty: toNumber(item.actualQty),
      diffQty: toNumber(item.diffQty),
      reason: item.reason || '',
    }
    const key = Number(item.inventoryId)
    map.set(key, [...(map.get(key) || []), next])
    return map
  }, new Map<number, any[]>())
}

async function buildStockInventoryRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  let query = supabase.from('stock_inventory').select('*', { count: 'exact' })
  const keyword = String(params?.keyword || '').trim()
  if (keyword) {
    query = query.or(`inventory_no.ilike.%${keyword}%,remark.ilike.%${keyword}%`)
  }
  if (params?.status) {
    query = query.eq('status', params.status)
  }
  if (params?.warehouseId) {
    query = query.eq('warehouse_id', Number(params.warehouseId))
  }
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw error
  const rows = toCamelDeep(data || [])
  const warehouseMap = await loadRowsByIds('warehouse', rows.map((item: any) => item.warehouseId))
  const userMap = await loadRowsByIds(
    'sys_user',
    rows.flatMap((item: any) => [item.operatorId, item.approverId].filter(Boolean)),
    'id, username, real_name'
  )
  const itemMap = await loadInventoryItems(rows.map((item: any) => Number(item.id)))
  const records = rows.map((item: any) => {
    const items: any[] = itemMap.get(Number(item.id)) || []
    const diffItemCount = items.filter((detail: any) => Number(detail.diffQty || 0) !== 0).length
    const diffQty = items.reduce((sum: number, detail: any) => sum + Number(detail.diffQty || 0), 0)
    const operator = userMap.get(item.operatorId)
    const approver = userMap.get(item.approverId)
    return {
      ...item,
      warehouseName: warehouseMap.get(item.warehouseId)?.name || '-',
      creatorName: operator?.realName || operator?.username || '-',
      approverName: approver?.realName || approver?.username || '-',
      items,
      itemCount: items.length,
      diffItemCount,
      diffQty,
    }
  })
  return ok({ records, list: records, total: count || records.length })
}

async function createStockInventoryDoc(data: any) {
  const supabase = getSupabaseClient()
  const warehouseId = Number(data?.warehouseId || 0)
  if (!warehouseId) throw new Error('请选择盘点仓库')
  const inventoryType = data?.inventoryType || 'FULL'
  const productIds = Array.isArray(data?.productIds)
    ? data.productIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)
    : []
  if (inventoryType === 'PARTIAL' && !productIds.length) throw new Error('请选择抽盘产品')

  let stockQuery = supabase.from('stock').select('*').eq('warehouse_id', warehouseId)
  if (productIds.length) {
    stockQuery = stockQuery.in('product_id', productIds)
  }
  const { data: stockRowsRaw, error: stockError } = await stockQuery.order('product_id', { ascending: true })
  if (stockError) throw stockError
  const stockRows = toCamelDeep(stockRowsRaw || [])
  if (!stockRows.length) throw new Error('当前仓库没有可盘点库存')

  const inventoryPayload = {
    inventory_no: data?.inventoryNo || createInventoryNo(),
    warehouse_id: warehouseId,
    inventory_type: inventoryType,
    status: 'DRAFT',
    freeze_stock: 0,
    operator_id: data?.operatorId || getCurrentUserId() || null,
    remark: data?.remark || '',
  }
  const { data: created, error } = await supabase.from('stock_inventory').insert(inventoryPayload).select().single()
  if (error) throw error

  const inventoryId = Number(created?.id || 0)
  const itemPayload = stockRows.map((row: any) => ({
    inventory_id: inventoryId,
    product_id: row.productId,
    location_id: row.locationId || null,
    batch_id: row.batchId || null,
    book_qty: toNumber(row.qty),
    actual_qty: toNumber(row.qty),
    diff_qty: 0,
    reason: '',
  }))
  const { error: itemError } = await supabase.from('stock_inventory_item').insert(itemPayload)
  if (itemError) {
    await supabase.from('stock_inventory').delete().eq('id', inventoryId)
    throw itemError
  }
  return ok(toCamelDeep(created), 'created')
}

async function loadInventory(id: number) {
  const { data, error } = await getSupabaseClient().from('stock_inventory').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  const row = toCamelDeep(data || {})
  if (!row?.id) throw new Error('未找到盘点单')
  return row
}

async function loadInventoryApprovalStockRows(inventory: any, items: any[]) {
  const productIds = Array.from(
    new Set(items.map((item: any) => Number(item.productId || 0)).filter((id: number) => Number.isFinite(id) && id > 0))
  )
  if (!productIds.length) return []
  const { data, error } = await getSupabaseClient()
    .from('stock')
    .select('*')
    .eq('warehouse_id', Number(inventory.warehouseId || 0))
    .in('product_id', productIds)
  if (error) throw error
  return toCamelDeep(data || [])
}

async function startInventoryCount(id: number) {
  const inventory = await loadInventory(id)
  const statusMessage = validateInventoryStatus(inventory.status, 'start')
  if (statusMessage) throw new Error(statusMessage)
  const { error } = await getSupabaseClient()
    .from('stock_inventory')
    .update({ status: 'COUNTING', freeze_stock: 1, operator_id: inventory.operatorId || getCurrentUserId() || null })
    .eq('id', id)
  if (error) throw error
  return ok(true)
}

async function updateInventoryCount(id: number, data: any) {
  const inventory = await loadInventory(id)
  const statusMessage = validateInventoryStatus(inventory.status, 'count')
  if (statusMessage) throw new Error(statusMessage)
  const items = Array.isArray(data?.items) ? data.items : []
  if (!items.length) throw new Error('请录入盘点明细')
  const itemMap = await loadInventoryItems([id])
  const existingItems = new Map<number, any>((itemMap.get(id) || []).map((item: any) => [Number(item.id), item]))
  const normalizedItems = items.map((item: any) => {
    const itemId = getInventoryItemId(item)
    const existing = existingItems.get(itemId)
    if (!existing) throw new Error('盘点明细不存在')
    return {
      ...existing,
      actualQty: item.actualQty,
      reason: item.reason || '',
    }
  })
  const countMessage = validateInventoryCountItems(normalizedItems)
  if (countMessage) throw new Error(countMessage)
  const supabase = getSupabaseClient()
  for (const item of normalizedItems) {
    const itemId = getInventoryItemId(item)
    const actualQty = Number(item.actualQty)
    const diffQty = actualQty - getInventoryBookQty(item)
    const { error } = await supabase
      .from('stock_inventory_item')
      .update({ actual_qty: actualQty, diff_qty: diffQty, reason: item.reason || '' })
      .eq('id', itemId)
      .eq('inventory_id', id)
    if (error) throw error
  }
  return ok(true)
}

async function submitInventoryReview(id: number) {
  const inventory = await loadInventory(id)
  const itemMap = await loadInventoryItems([id])
  const items = itemMap.get(id) || []
  const reviewMessage = validateInventoryReviewSubmit(inventory, items)
  if (reviewMessage) throw new Error(reviewMessage)
  const { error } = await getSupabaseClient().from('stock_inventory').update({ status: 'PENDING_APPROVE' }).eq('id', id)
  if (error) throw error
  return ok({ summary: buildInventoryApprovalSummary(items) })
}

async function approveInventoryDoc(id: number) {
  const inventory = await loadInventory(id)
  const itemMap = await loadInventoryItems([id])
  const items = itemMap.get(id) || []
  const stockRows = await loadInventoryApprovalStockRows(inventory, items)
  const approvalMessage = validateInventoryApproval(inventory, items, stockRows)
  if (approvalMessage) throw new Error(approvalMessage)
  const supabase = getSupabaseClient()
  const applied: any[] = []
  const createdMoveIds: number[] = []
  try {
    for (const item of items) {
      const diffQty = getInventoryDiffQty(item)
      if (!diffQty) continue
      const payload = {
        productId: Number(item.productId),
        warehouseId: Number(inventory.warehouseId),
        locationId: item.locationId ? Number(item.locationId) : null,
        batchId: item.batchId ? Number(item.batchId) : null,
      }
      await adjustStock(payload, diffQty)
      applied.push({ payload, diffQty })
      const { data: createdMove, error } = await supabase
        .from('stock_move')
        .insert({
          move_no: `PDY-${inventory.inventoryNo}-${item.id}`,
          product_id: payload.productId,
          warehouse_id: payload.warehouseId,
          location_id: payload.locationId,
          batch_id: payload.batchId,
          move_type: diffQty > 0 ? 'IN' : 'OUT',
          move_reason: diffQty > 0 ? 'INVENTORY_PROFIT' : 'INVENTORY_LOSS',
          qty: Math.abs(diffQty),
          related_order_id: id,
          related_order_type: 'STOCK_INVENTORY',
          operator_id: getCurrentUserId() || inventory.operatorId || null,
          operate_time: new Date().toISOString(),
          remark: item.reason || inventory.remark || '',
        })
        .select()
        .single()
      if (error) throw error
      if (createdMove?.id) createdMoveIds.push(Number(createdMove.id))
    }
    const { error } = await supabase
      .from('stock_inventory')
      .update({ status: 'FINISHED', freeze_stock: 0, approver_id: getCurrentUserId() || null })
      .eq('id', id)
    if (error) throw error
    return ok({ summary: buildInventoryApprovalSummary(items) })
  } catch (error) {
    for (const moveId of createdMoveIds) {
      try {
        await supabase.from('stock_move').delete().eq('id', moveId)
      } catch {
        // best effort rollback
      }
    }
    for (const item of applied.reverse()) {
      try {
        await adjustStock(item.payload, -item.diffQty)
      } catch {
        // best effort rollback
      }
    }
    throw error
  }
}

async function rejectInventoryDoc(id: number) {
  const inventory = await loadInventory(id)
  const statusMessage = validateInventoryStatus(inventory.status, 'reject')
  if (statusMessage) throw new Error(statusMessage)
  const { error } = await getSupabaseClient()
    .from('stock_inventory')
    .update({ status: 'COUNTING', freeze_stock: 1, approver_id: getCurrentUserId() || null })
    .eq('id', id)
  if (error) throw error
  return ok(true)
}

export function resolveResourceRoute(url: string) {
  const path = normalizePath(url)
  return routeConfigs
    .slice()
    .sort((a, b) => b.resource.length - a.resource.length)
    .find((route) => path === route.resource || path.startsWith(`${route.resource}/`))
}

export function resolveResourceTable(resource: string) {
  return resolveResourceRoute(`/${resource}`)?.table || resource.replace(/-/g, '_')
}

function parseRoute(url: string) {
  const path = normalizePath(url)
  const route = resolveResourceRoute(path)
  if (!route) return { path, route: undefined, id: undefined as number | undefined, action: undefined as string | undefined }
  const rest = path.slice(route.resource.length).replace(/^\/+/, '').split('/').filter(Boolean)
  const maybeId = Number(rest[0])
  return {
    path,
    route,
    id: Number.isFinite(maybeId) && rest[0] ? maybeId : undefined,
    action: Number.isFinite(maybeId) && rest[0] ? rest[1] : rest[0],
  }
}

function pageParams(params?: Record<string, any>) {
  const page = Number(params?.page || params?.current || 1)
  const pageSize = Number(params?.pageSize || params?.size || 20)
  return {
    from: Math.max(0, page - 1) * pageSize,
    to: Math.max(0, page - 1) * pageSize + pageSize - 1,
    page,
    pageSize,
  }
}

function searchableColumns(route: RouteConfig) {
  return (route.searchColumns || ['code', 'name', 'order_no', 'title']).filter((column) =>
    tableColumns[route.table]?.includes(column)
  )
}

function applyFilters(query: any, route: RouteConfig, params?: Record<string, any>) {
  let nextQuery = query
  const columns = tableColumns[route.table] || []
  const keyword = String(params?.keyword || '').trim()
  const searchColumns = searchableColumns(route)
  if (keyword && searchColumns.length) {
    nextQuery = nextQuery.or(searchColumns.map((column) => `${column}.ilike.%${keyword}%`).join(','))
  }

  if (route.table === 'product' && params?.type && columns.includes('type')) {
    nextQuery = nextQuery.eq('type', params.type)
  }

  for (const [key, rawValue] of Object.entries(params || {})) {
    if (rawValue === undefined || rawValue === null || rawValue === '' || filterOnlyKeys.has(key)) continue
    const column = toSnakeCase(key)
    if (columns.includes(column)) {
      nextQuery = nextQuery.eq(column, rawValue)
    }
  }

  if (params?.startDate && columns.includes('created_at')) {
    nextQuery = nextQuery.gte('created_at', params.startDate)
  }
  if (params?.endDate && columns.includes('created_at')) {
    nextQuery = nextQuery.lte('created_at', `${params.endDate} 23:59:59`)
  }
  return nextQuery
}

async function listTable(route: RouteConfig, params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  let query: any = supabase.from(route.table).select('*', { count: 'exact' })
  query = applyFilters(query, route, params)
  query = query.order(route.defaultOrder || 'id', { ascending: false }).range(from, to)
  const { data, error, count } = await query
  if (error) throw error
  const records = toCamelDeep(data || [])
  return ok({ records, list: records, total: count || records.length })
}

async function getTableDetail(route: RouteConfig, id: number) {
  const { data, error } = await getSupabaseClient().from(route.table).select('*').eq('id', id).single()
  if (error) throw error
  return ok(toCamelDeep(data))
}

async function validateProductReferences(record: any) {
  const normalized = toCamelDeep(record || {})
  const rawMaterialId = Number(normalized.rawMaterialId || 0)
  const customerId = Number(normalized.customerId || 0)
  const supabase = getSupabaseClient()

  if (rawMaterialId) {
    const { data, error } = await supabase
      .from('product')
      .select('id, type, status')
      .eq('id', rawMaterialId)
      .maybeSingle()
    if (error) throw error
    const material = toCamelDeep(data || {})
    if (!material?.id) throw new Error('未找到原料产品档案')
    if (Number(material.status ?? 1) !== 1) throw new Error('原料产品已停用')
    if (String(material.type || '').toUpperCase() === 'FINISH') throw new Error('原料产品不能选择成品')
  }

  if (customerId) {
    const { data, error } = await supabase
      .from('customer')
      .select('id, status')
      .eq('id', customerId)
      .maybeSingle()
    if (error) throw error
    const customer = toCamelDeep(data || {})
    if (!customer?.id) throw new Error('未找到客户档案')
    if (Number(customer.status ?? 1) !== 1) throw new Error('客户档案已停用')
  }
}

async function validateCustomerReferences(record: any) {
  const normalized = toCamelDeep(record || {})
  const salesUserId = Number(normalized.salesUserId || 0)
  if (!salesUserId) return

  const { data, error } = await getSupabaseClient()
    .from('sys_user')
    .select('id, status')
    .eq('id', salesUserId)
    .maybeSingle()
  if (error) throw error
  const salesUser = toCamelDeep(data || {})
  if (!salesUser?.id) throw new Error('未找到销售员档案')
  if (Number(salesUser.status ?? 1) !== 1) throw new Error('销售员账号已停用')
}

async function assertCustomerUsable(customerId: number) {
  const { data, error } = await getSupabaseClient()
    .from('customer')
    .select('id, status')
    .eq('id', customerId)
    .maybeSingle()
  if (error) throw error
  const customer = toCamelDeep(data || {})
  if (!customer?.id) throw new Error('未找到客户档案')
  if (Number(customer.status ?? 1) !== 1) throw new Error('客户档案已停用')
  return customer
}

async function assertCustomerCanDelete(id: number) {
  const supabase = getSupabaseClient()
  const checks = [
    { table: 'product', column: 'customer_id', message: '客户已被产品档案引用，不能删除' },
    { table: 'sale_order', column: 'customer_id', message: '客户已有销售订单，不能删除' },
    { table: 'payment_record', column: 'customer_id', message: '客户已有回款记录，不能删除' },
    { table: 'delivery_order', column: 'customer_id', message: '客户已有发货单，不能删除' },
  ]

  for (const item of checks) {
    const { data, error } = await supabase
      .from(item.table)
      .select('id')
      .eq(item.column, id)
      .limit(1)
    if (error) throw error
    if (data?.length) throw new Error(item.message)
  }
}

async function assertSupplierUsable(supplierId: number) {
  const { data, error } = await getSupabaseClient()
    .from('supplier')
    .select('id, status')
    .eq('id', supplierId)
    .maybeSingle()
  if (error) throw error
  const supplier = toCamelDeep(data || {})
  if (!supplier?.id) throw new Error('未找到供应商档案')
  if (String(supplier.status ?? '1') !== '1') throw new Error('供应商档案已停用')
  return supplier
}

async function assertSupplierCanDelete(id: number) {
  const { data, error } = await getSupabaseClient()
    .from('material_batch')
    .select('id')
    .eq('supplier_id', id)
    .limit(1)
  if (error) throw error
  if (data?.length) throw new Error('供应商已被物料批次引用，不能删除')
}

async function insertTable(route: RouteConfig, payload: any) {
  if (route.table === 'sys_user') {
    return saveUserRecord(undefined, payload)
  }
  if (route.table === 'product') {
    const submitted = toCamelDeep(payload || {})
    const message = validateProductMaster(submitted)
    if (message) throw new Error(message)
    await validateProductReferences(submitted)
    payload = buildProductPayload(submitted)
  }
  if (route.table === 'customer') {
    const submitted = toCamelDeep(payload || {})
    const message = validateCustomerMaster(submitted)
    if (message) throw new Error(message)
    await validateCustomerReferences(submitted)
    payload = buildCustomerPayload(submitted)
  }
  if (route.table === 'supplier') {
    const submitted = toCamelDeep(payload || {})
    const message = validateSupplierMaster(submitted)
    if (message) throw new Error(message)
    payload = buildSupplierPayload(submitted)
  }
  const { data, error } = await getSupabaseClient()
    .from(route.table)
    .insert(toSnakePayload(payload))
    .select()
    .single()
  if (error) throw error
  return ok(toCamelDeep(data), 'created')
}

async function updateTable(route: RouteConfig, id: number, payload: any) {
  if (route.table === 'sys_user') {
    return saveUserRecord(id, payload)
  }
  if (route.table === 'product') {
    const submitted = toCamelDeep(payload || {})
    const { data: existingRaw, error: fetchError } = await getSupabaseClient()
      .from('product')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!existingRaw?.id) throw new Error('未找到产品档案')
    const merged = { ...toCamelDeep(existingRaw), ...submitted, id }
    const message = validateProductMaster(merged, { isEditing: true })
    if (message) throw new Error(message)
    await validateProductReferences(merged)
    payload = buildProductPayload(submitted)
  }
  if (route.table === 'customer') {
    const submitted = toCamelDeep(payload || {})
    const { data: existingRaw, error: fetchError } = await getSupabaseClient()
      .from('customer')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!existingRaw?.id) throw new Error('未找到客户档案')
    const merged = { ...toCamelDeep(existingRaw), ...submitted, id }
    const message = validateCustomerMaster(merged, { isEditing: true })
    if (message) throw new Error(message)
    await validateCustomerReferences(merged)
    payload = buildCustomerPayload(submitted)
  }
  if (route.table === 'supplier') {
    const submitted = toCamelDeep(payload || {})
    const { data: existingRaw, error: fetchError } = await getSupabaseClient()
      .from('supplier')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!existingRaw?.id) throw new Error('未找到供应商档案')
    const merged = { ...toCamelDeep(existingRaw), ...submitted, id }
    const message = validateSupplierMaster(merged, { isEditing: true })
    if (message) throw new Error(message)
    payload = buildSupplierPayload(submitted)
  }
  const { data, error } = await getSupabaseClient()
    .from(route.table)
    .update(toSnakePayload(payload))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return ok(toCamelDeep(data), 'updated')
}

async function deleteTable(route: RouteConfig, id: number) {
  if (route.table === 'customer') {
    await assertCustomerCanDelete(id)
  }
  if (route.table === 'supplier') {
    await assertSupplierCanDelete(id)
  }
  const { error } = await getSupabaseClient().from(route.table).delete().eq('id', id)
  if (error) throw error
  return ok(true, 'deleted')
}

function createSaleOrderNo() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `XS-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function createPaymentNo() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `HK-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function createExpenseNo() {
  const now = new Date()
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')
  return `FY-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`
}

async function loadSaleOrderItemMap(orderIds: number[]) {
  const ids = Array.from(new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0)))
  if (!ids.length) return new Map<number, any[]>()
  const { data, error } = await getSupabaseClient()
    .from('sale_order_item')
    .select('*')
    .in('sale_order_id', ids)
    .order('id', { ascending: true })
  if (error) throw error
  const rows = toCamelDeep(data || [])
  return rows.reduce((map: Map<number, any[]>, item: any) => {
    const key = Number(item.saleOrderId || 0)
    const next = map.get(key) || []
    next.push(item)
    map.set(key, next)
    return map
  }, new Map<number, any[]>())
}

async function buildSaleOrderRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  let query = supabase.from('sale_order').select('*')
  if (params?.id) query = query.eq('id', Number(params.id))
  if (params?.status) query = query.eq('status', params.status)
  if (params?.customerId) query = query.eq('customer_id', Number(params.customerId))
  if (params?.startDate) query = query.gte('order_date', params.startDate)
  if (params?.endDate) query = query.lte('order_date', params.endDate)
  const { data, error } = await query.order('id', { ascending: false })
  if (error) throw error

  const orders = toCamelDeep(data || [])
  const itemMap = await loadSaleOrderItemMap(orders.map((item: any) => Number(item.id || 0)))
  const allItems = Array.from(itemMap.values()).flat()
  const customerMap = await loadRowsByIds('customer', orders.map((item: any) => item.customerId), 'id, code, name, short_name')
  const productMap = await loadRowsByIds(
    'product',
    allItems.map((item: any) => item.productId),
    'id, code, name, spec, unit'
  )
  const userMap = await loadRowsByIds('sys_user', orders.map((item: any) => item.salesUserId), 'id, username, real_name')
  const paymentSummaryMap = await loadSaleOrderPaymentSummaryMap(orders.map((item: any) => item.id))
  const keyword = String(params?.keyword || '').trim().toLowerCase()

  const enriched = orders
    .map((order: any) => {
      const items = (itemMap.get(Number(order.id)) || []).map((item: any) => {
        const product = productMap.get(item.productId)
        return {
          ...item,
          productName: product?.name || '-',
          productCode: product?.code || '-',
          productSpec: product?.spec || '',
          unit: product?.unit || '',
          amount: toNumber(item.amount) || Number((toNumber(item.qty) * toNumber(item.unitPrice)).toFixed(2)),
        }
      })
      const customer = customerMap.get(order.customerId)
      const salesUser = userMap.get(order.salesUserId)
      const totalAmount = toNumber(order.totalAmount) || items.reduce((sum: number, item: any) => sum + toNumber(item.amount), 0)
      const paymentSummary = paymentSummaryMap.get(Number(order.id))
      const receivedAmount = resolveSaleOrderReceivedAmount(order, paymentSummary)
      const qty = items.reduce((sum: number, item: any) => sum + toNumber(item.qty), 0)
      const deliveredQty = items.reduce((sum: number, item: any) => sum + toNumber(item.deliveredQty), 0)
      const productNames = items.map((item: any) => item.productName).filter((value: string) => value && value !== '-')
      const productName = productNames.length > 2 ? `${productNames.slice(0, 2).join('、')}等${productNames.length}项` : productNames.join('、') || '-'
      const paymentStatus = getPaymentStatus(totalAmount, receivedAmount)
      return {
        ...order,
        customerName: customer?.shortName || customer?.name || '-',
        customerCode: customer?.code || '',
        salesUserName: salesUser?.realName || salesUser?.username || '-',
        items,
        itemCount: items.length,
        productName,
        productId: items[0]?.productId,
        quantity: qty,
        qty,
        deliveredQty,
        unitPrice: items.length === 1 ? toNumber(items[0].unitPrice) : undefined,
        totalAmount,
        receivedAmount,
        receivableAmount: Math.max(totalAmount - receivedAmount, 0),
        paymentRecordAmount: paymentSummary?.amount || 0,
        paymentRecordCount: paymentSummary?.count || 0,
        paymentStatus,
      }
    })
    .filter((item: any) => {
      if (!keyword) return true
      return [
        item.orderNo,
        item.customerName,
        item.customerCode,
        item.productName,
        item.status,
        item.remark,
        ...item.items.flatMap((row: any) => [row.productName, row.productCode, row.remark]),
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })

  const records = enriched.slice(from, to + 1)
  return ok({ records, list: records, total: enriched.length })
}

async function getSaleOrderDoc(id: number) {
  const rows = await buildSaleOrderRows({ page: 1, pageSize: 1, id })
  const record = rows.data.records.find((item: any) => Number(item.id) === Number(id))
  if (record) return ok(record)
  const detail = await getTableDetail(resolveResourceRoute('/sale-orders')!, id)
  return ok(detail.data)
}

async function createSaleOrderDoc(payload: any) {
  const supabase = getSupabaseClient()
  const customerId = Number(payload?.customerId || 0)
  if (!customerId) throw new Error('请选择客户')
  const normalizedPayload = buildSaleOrderPayload({
    ...payload,
    customerId,
    orderDate: payload?.orderDate || payload?.order_date || formatLocalDate(new Date()),
    deliveryDate: payload?.deliveryDate ?? payload?.delivery_date ?? '',
  })
  await assertCustomerUsable(customerId)
  const items = normalizedPayload.items
  const totalAmount = items.reduce((sum: number, item: any) => sum + item.amount, 0)
  const orderPayload = {
    order_no: payload?.orderNo || createSaleOrderNo(),
    customer_id: normalizedPayload.customerId,
    order_date: normalizedPayload.orderDate,
    delivery_date: normalizedPayload.deliveryDate || null,
    total_amount: totalAmount,
    received_amount: 0,
    status: payload?.status || 'DRAFT',
    sales_user_id: payload?.salesUserId || getCurrentUserId() || null,
    remark: normalizedPayload.remark || '',
    created_by: getCurrentUserId() || null,
    updated_at: new Date().toISOString(),
  }
  const { data: created, error } = await supabase.from('sale_order').insert(orderPayload).select().single()
  if (error) throw error
  const saleOrderId = Number(created?.id || 0)
  const itemPayload = items.map((item: any) => ({
    sale_order_id: saleOrderId,
    product_id: item.productId,
    qty: item.qty,
    unit_price: item.unitPrice,
    amount: item.amount,
    delivered_qty: 0,
    produced_qty: 0,
    remark: item.remark,
  }))
  const { error: itemError } = await supabase.from('sale_order_item').insert(itemPayload)
  if (itemError) {
    await supabase.from('sale_order').delete().eq('id', saleOrderId)
    throw itemError
  }
  return getSaleOrderDoc(saleOrderId)
}

async function updateSaleOrderDoc(id: number, payload: any) {
  const supabase = getSupabaseClient()
  const existing = await getSaleOrderDoc(id)
  const current = existing.data || {}
  const currentItems = current.items || []
  if (['PARTIAL', 'SHIPPED'].includes(String(current.status || '').toUpperCase())) {
    throw new Error('已出库销售订单不能编辑')
  }
  const paymentSummary = await loadSaleOrderPaymentSummary(id)
  if (resolveSaleOrderReceivedAmount(current, paymentSummary) > 0) {
    throw new Error('已回款销售订单不能编辑')
  }
  if (currentItems.some((item: any) => toNumber(item.deliveredQty) > 0 || toNumber(item.producedQty) > 0)) {
    throw new Error('已有生产或出库记录的销售订单不能编辑')
  }
  const customerId = Number(payload?.customerId || current.customerId || 0)
  if (!customerId) throw new Error('请选择客户')
  const normalizedPayload = buildSaleOrderPayload({
    ...payload,
    customerId,
    orderDate: payload?.orderDate || payload?.order_date || current.orderDate || formatLocalDate(new Date()),
    deliveryDate: payload?.deliveryDate ?? payload?.delivery_date ?? current.deliveryDate ?? '',
  })
  await assertCustomerUsable(customerId)
  const items = normalizedPayload.items
  const totalAmount = items.reduce((sum: number, item: any) => sum + item.amount, 0)
  const nextItemPayload = items.map((item: any) => ({
    sale_order_id: id,
    product_id: item.productId,
    qty: item.qty,
    unit_price: item.unitPrice,
    amount: item.amount,
    delivered_qty: 0,
    produced_qty: 0,
    remark: item.remark,
  }))
  const previousItemPayload = currentItems.map((item: any) => ({
    sale_order_id: id,
    product_id: item.productId,
    qty: item.qty,
    unit_price: item.unitPrice,
    amount: item.amount,
    delivered_qty: item.deliveredQty || 0,
    produced_qty: item.producedQty || 0,
    remark: item.remark || '',
  }))
  const { data: createdItems, error: itemError } = await supabase.from('sale_order_item').insert(nextItemPayload).select('id')
  if (itemError) throw itemError
  const createdItemIds = (createdItems || []).map((item: any) => item.id).filter(Boolean)
  const oldItemIds = currentItems.map((item: any) => item.id).filter(Boolean)
  if (oldItemIds.length) {
    const { error: deleteError } = await supabase.from('sale_order_item').delete().in('id', oldItemIds)
    if (deleteError) {
      if (createdItemIds.length) await supabase.from('sale_order_item').delete().in('id', createdItemIds)
      throw deleteError
    }
  }
  const { error: updateError } = await supabase
    .from('sale_order')
    .update({
      customer_id: customerId,
      order_date: normalizedPayload.orderDate,
      delivery_date: normalizedPayload.deliveryDate || null,
      total_amount: totalAmount,
      status: payload?.status || current.status || 'DRAFT',
      sales_user_id: payload?.salesUserId || current.salesUserId || getCurrentUserId() || null,
      remark: normalizedPayload.remark || '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (updateError) {
    if (createdItemIds.length) await supabase.from('sale_order_item').delete().in('id', createdItemIds)
    if (previousItemPayload.length) await supabase.from('sale_order_item').insert(previousItemPayload)
    throw updateError
  }
  return getSaleOrderDoc(id)
}

async function deleteSaleOrderDoc(id: number) {
  const supabase = getSupabaseClient()
  const existing = await getSaleOrderDoc(id)
  const current = existing.data || {}
  const paymentSummary = await loadSaleOrderPaymentSummary(id)
  if (resolveSaleOrderReceivedAmount(current, paymentSummary) > 0) throw new Error('已回款销售订单不能删除')
  if ((current.items || []).some((item: any) => toNumber(item.deliveredQty) > 0 || toNumber(item.producedQty) > 0)) {
    throw new Error('已有生产或出库记录的销售订单不能删除')
  }
  const { error: itemError } = await supabase.from('sale_order_item').delete().eq('sale_order_id', id)
  if (itemError) throw itemError
  const { error } = await supabase.from('sale_order').delete().eq('id', id)
  if (error) throw error
  return ok(true, 'deleted')
}

async function loadSaleOrderForPayment(id: number) {
  const { data, error } = await getSupabaseClient().from('sale_order').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  const order = toCamelDeep(data || {})
  if (!order?.id) throw new Error('未找到销售订单')
  return order
}

async function loadSaleOrderPaymentSummary(saleOrderId: number) {
  const { data, error } = await getSupabaseClient()
    .from('payment_record')
    .select('id, pay_amount')
    .eq('sale_order_id', saleOrderId)
  if (error) throw error
  const rows = toCamelDeep(data || [])
  return {
    amount: roundPaymentMoney(rows.reduce((sum: number, item: any) => sum + roundPaymentMoney(item.payAmount), 0)),
    count: rows.length,
  }
}

async function loadSaleOrderPaymentSummaryMap(
  orderIds: Array<number | string | null | undefined>,
  options?: { endDate?: string }
) {
  const ids = Array.from(new Set(orderIds.map((id) => Number(id || 0)).filter(Boolean)))
  const summaryMap = new Map<number, { amount: number; count: number }>()
  if (!ids.length) return summaryMap
  let query = getSupabaseClient()
    .from('payment_record')
    .select('sale_order_id, pay_amount')
    .in('sale_order_id', ids)
  if (options?.endDate) query = query.lte('pay_date', options.endDate)
  const { data, error } = await query
  if (error) throw error
  for (const item of toCamelDeep(data || [])) {
    const orderId = Number(item.saleOrderId || 0)
    if (!orderId) continue
    const current = summaryMap.get(orderId) || { amount: 0, count: 0 }
    current.amount = roundPaymentMoney(current.amount + roundPaymentMoney(item.payAmount))
    current.count += 1
    summaryMap.set(orderId, current)
  }
  return summaryMap
}

function resolveSaleOrderPaymentBase(order: any, summary?: { amount: number; count: number }) {
  return getSaleOrderPaymentBaseAmount(order, summary)
}

function resolveSaleOrderReceivedAmount(order: any, summary?: { amount: number; count: number }) {
  return getSaleOrderReceivedAmountFromSummary(order, summary)
}

function resolveSaleOrderReceivedAmountAsOf(
  order: any,
  fullSummary?: { amount: number; count: number },
  asOfSummary?: { amount: number; count: number }
) {
  return getSaleOrderReceivedAmountAsOf(order, fullSummary, asOfSummary)
}

function resolveSaleOrderReceivableAmount(order: any, summary?: { amount: number; count: number }) {
  return getSaleOrderReceivableAmount({
    id: order?.id,
    totalAmount: getSaleOrderTotalAmount(order),
    receivedAmount: resolveSaleOrderReceivedAmount(order, summary),
  })
}

const shippableSaleOrderStatuses = new Set(['APPROVED', 'CONFIRMED', 'PARTIAL'])
const collectableSaleOrderStatuses = new Set(['APPROVED', 'CONFIRMED', 'PARTIAL', 'SHIPPED'])

function assertSaleOrderCanShip(order: any) {
  const status = normalizeBusinessStatus(order?.status)
  if (!order?.id) throw new Error('未找到销售订单')
  if (status === 'DRAFT') throw new Error('销售订单未审核，不能出库')
  if (status === 'CANCELLED') throw new Error('销售订单已取消，不能出库')
  if (status === 'SHIPPED') throw new Error('销售订单已全部出库')
  if (!shippableSaleOrderStatuses.has(status)) throw new Error('销售订单状态不允许出库')
}

function assertSaleOrderCanCollect(order: any) {
  const status = normalizeBusinessStatus(order?.status)
  if (!order?.id) throw new Error('未找到销售订单')
  if (status === 'DRAFT') throw new Error('销售订单未审核，不能回款')
  if (status === 'CANCELLED') throw new Error('销售订单已取消，不能回款')
  if (!isSaleOrderCollectableForPayment(status) || !collectableSaleOrderStatuses.has(status)) {
    throw new Error('销售订单状态不允许回款')
  }
}

async function updateSaleOrderReceivedAmount(id: number, nextAmount: number) {
  const { error } = await getSupabaseClient()
    .from('sale_order')
    .update({
      received_amount: Number(Math.max(nextAmount, 0).toFixed(2)),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

async function buildPaymentRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  let query = supabase.from('payment_record').select('*')
  if (params?.saleOrderId) query = query.eq('sale_order_id', Number(params.saleOrderId))
  if (params?.customerId) query = query.eq('customer_id', Number(params.customerId))
  if (params?.startDate) query = query.gte('pay_date', params.startDate)
  if (params?.endDate) query = query.lte('pay_date', params.endDate)
  const { data, error } = await query.order('id', { ascending: false })
  if (error) throw error

  const rows = toCamelDeep(data || [])
  const paymentSummaryMap = await loadSaleOrderPaymentSummaryMap(rows.map((item: any) => item.saleOrderId))
  const orderMap = await loadRowsByIds('sale_order', rows.map((item: any) => item.saleOrderId))
  const customerMap = await loadRowsByIds(
    'customer',
    rows.map((item: any) => item.customerId).concat(Array.from(orderMap.values()).map((item: any) => item.customerId)),
    'id, code, name, short_name'
  )
  const keyword = String(params?.keyword || '').trim().toLowerCase()
  const enriched = rows
    .map((item: any) => {
      const order = orderMap.get(item.saleOrderId)
      const paymentSummary = paymentSummaryMap.get(Number(item.saleOrderId))
      const receivedAmount = resolveSaleOrderReceivedAmount(order, paymentSummary)
      const customer = customerMap.get(item.customerId || order?.customerId)
      return {
        ...item,
        paymentNo: item.paymentNo,
        orderNo: order?.orderNo || '-',
        customerId: item.customerId || order?.customerId,
        customerName: customer?.shortName || customer?.name || '-',
        amount: toNumber(item.payAmount),
        paymentDate: item.payDate,
        paymentMethod: item.payMethod,
        totalAmount: toNumber(order?.totalAmount),
        receivedAmount,
        receivableAmount: resolveSaleOrderReceivableAmount(order, paymentSummary),
        paymentRecordAmount: paymentSummary?.amount || 0,
        paymentRecordCount: paymentSummary?.count || 0,
        orderStatus: order?.status || '',
      }
    })
    .filter((item: any) => {
      if (!keyword) return true
      return [item.paymentNo, item.orderNo, item.customerName, item.paymentMethod, item.invoiceNo, item.remark]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  const records = enriched.slice(from, to + 1)
  return ok({ records, list: records, total: enriched.length })
}

async function createPaymentRecord(payload: any) {
  const supabase = getSupabaseClient()
  const saleOrderId = Number(payload?.saleOrderId || payload?.orderId || 0)
  const payAmount = roundPaymentMoney(payload?.payAmount ?? payload?.amount)
  if (!saleOrderId) throw new Error('请选择销售订单')
  if (!Number.isFinite(payAmount) || payAmount <= 0) throw new Error('回款金额必须大于 0')
  const order = await loadSaleOrderForPayment(saleOrderId)
  assertSaleOrderCanCollect(order)
  const summary = await loadSaleOrderPaymentSummary(saleOrderId)
  const baseReceivedAmount = resolveSaleOrderPaymentBase(order, summary)
  const maxReceivableAmount = Math.max(roundPaymentMoney(getSaleOrderTotalAmount(order) - baseReceivedAmount - summary.amount), 0)
  const normalizedPayload = buildSalePaymentPayload({
    saleOrderId,
    amount: payAmount,
    paymentDate: payload?.payDate || payload?.paymentDate || formatLocalDate(new Date()),
    paymentMethod: payload?.payMethod || payload?.paymentMethod,
    invoiceNo: payload?.invoiceNo,
    remark: payload?.remark,
  }, maxReceivableAmount)
  const recordPayload = {
    payment_no: payload?.paymentNo || createPaymentNo(),
    customer_id: order.customerId,
    sale_order_id: normalizedPayload.saleOrderId,
    pay_amount: normalizedPayload.amount,
    pay_date: normalizedPayload.paymentDate,
    pay_method: normalizedPayload.paymentMethod,
    invoice_no: normalizedPayload.invoiceNo || '',
    remark: normalizedPayload.remark || '',
    created_by: getCurrentUserId() || null,
  }
  const { data, error } = await supabase.from('payment_record').insert(recordPayload).select().single()
  if (error) throw error
  try {
    await updateSaleOrderReceivedAmount(saleOrderId, baseReceivedAmount + summary.amount + normalizedPayload.amount)
  } catch (error) {
    await supabase.from('payment_record').delete().eq('id', data?.id)
    throw error
  }
  return ok(toCamelDeep(data), 'created')
}

function restorePaymentRecordPayload(existing: any) {
  return {
    payment_no: existing.paymentNo,
    customer_id: existing.customerId,
    sale_order_id: existing.saleOrderId,
    pay_amount: roundPaymentMoney(existing.payAmount),
    pay_date: existing.payDate,
    pay_method: existing.payMethod || '',
    invoice_no: existing.invoiceNo || '',
    remark: existing.remark || '',
  }
}

async function updatePaymentRecord(id: number, payload: any) {
  const supabase = getSupabaseClient()
  const { data: existingRaw, error: existingError } = await supabase.from('payment_record').select('*').eq('id', id).maybeSingle()
  if (existingError) throw existingError
  const existing = toCamelDeep(existingRaw || {})
  if (!existing?.id) throw new Error('未找到回款记录')

  const oldOrder = await loadSaleOrderForPayment(Number(existing.saleOrderId))
  const nextSaleOrderId = Number(payload?.saleOrderId || payload?.orderId || existing.saleOrderId)
  const nextOrder = Number(oldOrder.id) === nextSaleOrderId ? oldOrder : await loadSaleOrderForPayment(nextSaleOrderId)
  assertSaleOrderCanCollect(nextOrder)
  const oldAmount = roundPaymentMoney(existing.payAmount)
  const nextAmount = roundPaymentMoney(payload?.payAmount ?? payload?.amount ?? oldAmount)
  if (!Number.isFinite(nextAmount) || nextAmount <= 0) throw new Error('回款金额必须大于 0')

  const oldSummary = await loadSaleOrderPaymentSummary(Number(oldOrder.id))
  const nextSummary = Number(oldOrder.id) === Number(nextOrder.id)
    ? oldSummary
    : await loadSaleOrderPaymentSummary(nextSaleOrderId)
  const oldBaseReceivedAmount = resolveSaleOrderPaymentBase(oldOrder, oldSummary)
  const nextBaseReceivedAmount = Number(oldOrder.id) === Number(nextOrder.id)
    ? oldBaseReceivedAmount
    : resolveSaleOrderPaymentBase(nextOrder, nextSummary)
  const nextSummaryWithoutCurrent = Number(oldOrder.id) === Number(nextOrder.id)
    ? roundPaymentMoney(nextSummary.amount - oldAmount)
    : nextSummary.amount
  const maxReceivableAmount = Math.max(
    roundPaymentMoney(getSaleOrderTotalAmount(nextOrder) - nextBaseReceivedAmount - nextSummaryWithoutCurrent),
    0
  )
  const normalizedPayload = buildSalePaymentPayload({
    saleOrderId: nextSaleOrderId,
    amount: nextAmount,
    paymentDate: payload?.payDate || payload?.paymentDate || existing.payDate,
    paymentMethod: payload?.payMethod || payload?.paymentMethod || existing.payMethod,
    invoiceNo: payload?.invoiceNo ?? existing.invoiceNo,
    remark: payload?.remark ?? existing.remark,
  }, maxReceivableAmount)

  const { data, error } = await supabase
    .from('payment_record')
    .update({
      customer_id: nextOrder.customerId,
      sale_order_id: normalizedPayload.saleOrderId,
      pay_amount: normalizedPayload.amount,
      pay_date: normalizedPayload.paymentDate,
      pay_method: normalizedPayload.paymentMethod,
      invoice_no: normalizedPayload.invoiceNo || '',
      remark: normalizedPayload.remark || '',
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error

  const restoredOrders: Array<{ id: number; receivedAmount: number }> = []
  try {
    if (Number(oldOrder.id) === Number(nextOrder.id)) {
      await updateSaleOrderReceivedAmount(
        nextSaleOrderId,
        nextBaseReceivedAmount + nextSummaryWithoutCurrent + normalizedPayload.amount
      )
    } else {
      await updateSaleOrderReceivedAmount(Number(oldOrder.id), oldBaseReceivedAmount + oldSummary.amount - oldAmount)
      restoredOrders.push({ id: Number(oldOrder.id), receivedAmount: toNumber(oldOrder.receivedAmount) })
      await updateSaleOrderReceivedAmount(nextSaleOrderId, nextBaseReceivedAmount + nextSummary.amount + normalizedPayload.amount)
      restoredOrders.push({ id: nextSaleOrderId, receivedAmount: toNumber(nextOrder.receivedAmount) })
    }
  } catch (syncError) {
    try {
      await supabase.from('payment_record').update(restorePaymentRecordPayload(existing)).eq('id', id)
      for (const item of restoredOrders.reverse()) {
        await updateSaleOrderReceivedAmount(item.id, item.receivedAmount)
      }
    } catch {
      // best effort rollback; surface the original synchronization failure
    }
    throw syncError
  }
  return ok(toCamelDeep(data), 'updated')
}

async function deletePaymentRecord(id: number) {
  const supabase = getSupabaseClient()
  const { data: existingRaw, error: existingError } = await supabase.from('payment_record').select('*').eq('id', id).maybeSingle()
  if (existingError) throw existingError
  const existing = toCamelDeep(existingRaw || {})
  if (!existing?.id) throw new Error('未找到回款记录')
  const order = await loadSaleOrderForPayment(Number(existing.saleOrderId))
  const previousReceivedAmount = toNumber(order.receivedAmount)
  const summary = await loadSaleOrderPaymentSummary(Number(order.id))
  const baseReceivedAmount = resolveSaleOrderPaymentBase(order, summary)
  const { error } = await supabase.from('payment_record').delete().eq('id', id)
  if (error) {
    throw error
  }
  try {
    await updateSaleOrderReceivedAmount(
      Number(order.id),
      baseReceivedAmount + Math.max(roundPaymentMoney(summary.amount - roundPaymentMoney(existing.payAmount)), 0)
    )
  } catch (error) {
    try {
      await supabase.from('payment_record').insert(restorePaymentRecordPayload(existing))
      await updateSaleOrderReceivedAmount(Number(order.id), previousReceivedAmount)
    } catch {
      // best effort rollback; surface the original synchronization failure
    }
    throw error
  }
  return ok(true, 'deleted')
}

function createDeliveryNo() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `FH-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

async function loadDeliveryItemMap(deliveryIds: Array<number | string | null | undefined>) {
  const ids = Array.from(new Set(deliveryIds.map((id) => Number(id || 0)).filter(Boolean)))
  if (!ids.length) return new Map<number, any[]>()
  const { data, error } = await getSupabaseClient()
    .from('delivery_order_item')
    .select('*')
    .in('delivery_order_id', ids)
  if (error) throw error
  return toCamelDeep(data || []).reduce((map: Map<number, any[]>, item: any) => {
    const key = Number(item.deliveryOrderId || 0)
    const list = map.get(key) || []
    list.push(item)
    map.set(key, list)
    return map
  }, new Map<number, any[]>())
}

function getDeliveryLineKey(item: any) {
  return [
    Number(item?.deliveryOrderId || 0),
    Number(item?.saleOrderItemId || 0),
    Number(item?.productId || 0),
    toNumber(item?.qty),
  ].join('|')
}

async function loadDeliveryStockMoveContext(deliveryIds: Array<number | string>, items: any[]) {
  const stockMoveMap = await loadRowsByIds('stock_move', items.map((item: any) => item.stockMoveId))
  const stockMoveByDeliveryItemId = new Map<number, any>()
  const stockMoveByDeliveryLineKey = new Map<string, any>()

  const collect = (row: any) => {
    const id = Number(row?.id || 0)
    if (!id) return
    stockMoveMap.set(id, row)
    const deliveryItemId = Number(row.deliveryOrderItemId || 0)
    if (deliveryItemId) stockMoveByDeliveryItemId.set(deliveryItemId, row)
    const lineKey = getDeliveryLineKey(row)
    if (lineKey !== '0|0|0|0') stockMoveByDeliveryLineKey.set(lineKey, row)
  }

  Array.from(stockMoveMap.values()).forEach(collect)

  const needsFallback = items.some((item: any) => !item.stockMoveId || !stockMoveMap.has(Number(item.stockMoveId || 0)))
  if (needsFallback) {
    try {
      const linkedRows = await loadRowsByColumn('stock_move', 'delivery_order_id', deliveryIds, '*')
      linkedRows.forEach(collect)
    } catch (error) {
      if (!isMissingDeliveryLinkColumnError(error)) throw error
    }
  }

  return { stockMoveMap, stockMoveByDeliveryItemId, stockMoveByDeliveryLineKey }
}

async function buildDeliveryRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  let query = supabase.from('delivery_order').select('*')
  if (params?.customerId) query = query.eq('customer_id', Number(params.customerId))
  if (params?.saleOrderId) query = query.eq('sale_order_id', Number(params.saleOrderId))
  if (params?.status) query = query.eq('status', String(params.status).toUpperCase())
  if (params?.startDate) query = query.gte('delivery_date', params.startDate)
  if (params?.endDate) query = query.lte('delivery_date', params.endDate)
  const { data, error } = await query.order('id', { ascending: false })
  if (error) throw error

  const deliveries = toCamelDeep(data || [])
  const itemMap = await loadDeliveryItemMap(deliveries.map((item: any) => item.id))
  const allItems = Array.from(itemMap.values()).flat()
  const { stockMoveMap, stockMoveByDeliveryItemId, stockMoveByDeliveryLineKey } = await loadDeliveryStockMoveContext(
    deliveries.map((item: any) => item.id),
    allItems
  )
  const orderMap = await loadRowsByIds('sale_order', deliveries.map((item: any) => item.saleOrderId), 'id, order_no, customer_id, status')
  const customerMap = await loadRowsByIds(
    'customer',
    deliveries.map((item: any) => item.customerId).concat(Array.from(orderMap.values()).map((item: any) => item.customerId)),
    'id, code, name, short_name'
  )
  const productMap = await loadRowsByIds(
    'product',
    allItems.map((item: any) => item.productId),
    'id, code, name, spec, unit'
  )
  const warehouseMap = await loadRowsByIds(
    'warehouse',
    Array.from(stockMoveMap.values()).map((item: any) => item.warehouseId),
    'id, code, name'
  )
  const userMap = await loadRowsByIds('sys_user', deliveries.map((item: any) => item.operatorId), 'id, username, real_name')
  const keyword = String(params?.keyword || '').trim().toLowerCase()
  const productId = Number(params?.productId || 0)
  const warehouseId = Number(params?.warehouseId || 0)

  const enriched = deliveries
    .map((item: any) => {
      const order = orderMap.get(Number(item.saleOrderId || 0))
      const customer = customerMap.get(Number(item.customerId || order?.customerId || 0))
      const operator = userMap.get(Number(item.operatorId || 0))
      const items = (itemMap.get(Number(item.id || 0)) || []).map((line: any) => {
        const product = productMap.get(Number(line.productId || 0))
        const stockMove =
          stockMoveMap.get(Number(line.stockMoveId || 0)) ||
          stockMoveByDeliveryItemId.get(Number(line.id || 0)) ||
          stockMoveByDeliveryLineKey.get(getDeliveryLineKey(line))
        const warehouse = warehouseMap.get(Number(stockMove?.warehouseId || 0))
        return {
          ...line,
          productCode: product?.code || '',
          productName: product?.name || '-',
          productSpec: product?.spec || '',
          productUnit: product?.unit || '',
          stockMoveId: stockMove?.id,
          moveNo: stockMove?.moveNo || '',
          warehouseId: stockMove?.warehouseId,
          warehouseName: warehouse?.name || '',
          warehouseCode: warehouse?.code || '',
          saleAmount: stockMove?.saleAmount,
          materialCost: stockMove?.amount,
        }
      })
      const productNames = items.map((line: any) => line.productName).filter((value: string) => value && value !== '-')
      const warehouseNames = Array.from(new Set(items.map((line: any) => line.warehouseName).filter(Boolean)))
      const moveNos = Array.from(new Set(items.map((line: any) => line.moveNo).filter(Boolean)))
      return {
        ...item,
        items,
        itemCount: items.length,
        saleOrderNo: order?.orderNo || '-',
        customerId: item.customerId || order?.customerId,
        customerName: customer?.shortName || customer?.name || '-',
        customerCode: customer?.code || '',
        productId: items[0]?.productId,
        productCode: items[0]?.productCode || '',
        productName: productNames.length > 2 ? `${productNames.slice(0, 2).join('、')}等${productNames.length}项` : productNames.join('、') || '-',
        productUnit: items[0]?.productUnit || '',
        warehouseId: items[0]?.warehouseId,
        warehouseName: warehouseNames.join('、') || '-',
        moveNo: moveNos.join('、') || '',
        totalQty: toNumber(item.totalQty) || sumSaleDeliveryQty(items),
        operatorName: operator?.realName || operator?.username || '-',
        statusText: getSaleDeliveryStatusText(item.status),
      }
    })
    .filter((item: any) => {
      if (productId && !(item.items || []).some((line: any) => Number(line.productId) === productId)) return false
      if (warehouseId && !(item.items || []).some((line: any) => Number(line.warehouseId) === warehouseId)) return false
      if (!keyword) return true
      return [
        item.deliveryNo,
        item.saleOrderNo,
        item.customerName,
        item.customerCode,
        item.productName,
        item.logisticsCompany,
        item.trackingNo,
        item.statusText,
        item.remark,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  const records = enriched.slice(from, to + 1)
  return ok({ records, list: records, total: enriched.length })
}

function normalizeDeliveryUpdatePayload(payload: any) {
  const status = normalizeBusinessStatus(payload?.status || 'SHIPPED')
  if (!isSaleDeliveryStatus(status)) throw new Error('发货状态不正确')
  return {
    delivery_date: payload?.deliveryDate || payload?.delivery_date || formatLocalDate(new Date()),
    logistics_company: payload?.logisticsCompany || payload?.logistics_company || '',
    tracking_no: payload?.trackingNo || payload?.tracking_no || '',
    status,
    remark: payload?.remark || '',
  }
}

async function updateDeliveryDoc(id: number, payload: any) {
  const { data: existingRaw, error: existingError } = await getSupabaseClient()
    .from('delivery_order')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (existingError) throw existingError
  const existing = toCamelDeep(existingRaw || {})
  if (!existing?.id) throw new Error('未找到发货单')
  const existingStatus = normalizeBusinessStatus(existing.status)
  if (existingStatus === 'CANCELLED') throw new Error('已取消发货单不能更新物流')
  const nextPayload = normalizeDeliveryUpdatePayload(payload)
  if (nextPayload.status === 'CANCELLED') {
    throw new Error('发货单取消需要通过退货或红冲流程处理，不能在物流维护中直接取消')
  }
  const { data, error } = await getSupabaseClient()
    .from('delivery_order')
    .update(nextPayload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return ok(toCamelDeep(data), 'updated')
}

async function deleteDeliveryDoc(id: number) {
  const supabase = getSupabaseClient()
  const { data: existingRaw, error: existingError } = await supabase
    .from('delivery_order')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (existingError) throw existingError
  const existing = toCamelDeep(existingRaw || {})
  if (!existing?.id) throw new Error('未找到发货单')
  if (['SHIPPED', 'IN_TRANSIT', 'RECEIVED'].includes(normalizeBusinessStatus(existing.status))) {
    throw new Error('已发货单据不能删除')
  }
  const { error: itemError } = await supabase.from('delivery_order_item').delete().eq('delivery_order_id', id)
  if (itemError) throw itemError
  const { error } = await supabase.from('delivery_order').delete().eq('id', id)
  if (error) throw error
  return ok(true, 'deleted')
}

function isMissingDeliveryLinkColumnError(error: any) {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase()
  return (
    message.includes('stock_move_id') ||
    message.includes('delivery_order_id') ||
    message.includes('delivery_order_item_id') ||
    (message.includes('delivery_order_item') && message.includes('schema cache')) ||
    (message.includes('stock_move') && message.includes('schema cache'))
  )
}

async function updateStockMoveDeliveryLink(stockMoveId: number, deliveryOrderId: number, deliveryOrderItemId: number) {
  if (!stockMoveId || !deliveryOrderId || !deliveryOrderItemId) return
  const { error } = await getSupabaseClient()
    .from('stock_move')
    .update({
      delivery_order_id: deliveryOrderId,
      delivery_order_item_id: deliveryOrderItemId,
    })
    .eq('id', stockMoveId)
  if (error && !isMissingDeliveryLinkColumnError(error)) throw error
}

async function insertDeliveryOrderItem(record: any) {
  const supabase = getSupabaseClient()
  const insertRecord = async (nextRecord: any) => supabase.from('delivery_order_item').insert(nextRecord).select().single()
  let { data, error } = await insertRecord(record)
  if (error && isMissingDeliveryLinkColumnError(error)) {
    const legacyRecord = { ...record }
    delete legacyRecord.stock_move_id
    ;({ data, error } = await insertRecord(legacyRecord))
  }
  if (error) throw error
  return data
}

async function createDeliveryForSaleShipment(item: any, payload: any, stockMoveId?: number) {
  if (!item || payload.moveReason !== 'OUT_SALE' || payload.relatedOrderType !== 'SALE_ORDER') return null
  const supabase = getSupabaseClient()
  const { data: orderRaw, error: orderError } = await supabase
    .from('sale_order')
    .select('id, customer_id')
    .eq('id', item.saleOrderId)
    .maybeSingle()
  if (orderError) throw orderError
  const order = toCamelDeep(orderRaw || {})
  if (!order?.id) throw new Error('未找到销售订单')
  const status = normalizeBusinessStatus(payload.deliveryStatus || 'SHIPPED')
  if (!isSaleDeliveryStatus(status)) throw new Error('发货状态不正确')
  const { data: deliveryRaw, error: deliveryError } = await supabase
    .from('delivery_order')
    .insert({
      delivery_no: payload.deliveryNo || createDeliveryNo(),
      sale_order_id: item.saleOrderId,
      customer_id: order.customerId,
      delivery_date: payload.deliveryDate || formatLocalDate(new Date()),
      total_qty: payload.qty,
      logistics_company: payload.logisticsCompany || '',
      tracking_no: payload.trackingNo || '',
      status,
      operator_id: payload.operatorId || getCurrentUserId() || null,
      remark: payload.remark || '',
    })
    .select()
    .single()
  if (deliveryError) throw deliveryError
  const delivery = toCamelDeep(deliveryRaw || {})
  try {
    const detailRaw = await insertDeliveryOrderItem({
      delivery_order_id: Number(delivery.id),
      sale_order_item_id: Number(item.id),
      product_id: payload.productId,
      qty: payload.qty,
      stock_move_id: stockMoveId || null,
    })
    const detail = toCamelDeep(detailRaw || {})
    await updateStockMoveDeliveryLink(Number(stockMoveId || 0), Number(delivery.id), Number(detail.id || 0))
  } catch (error) {
    try {
      await supabase.from('delivery_order_item').delete().eq('delivery_order_id', delivery.id)
      await supabase.from('delivery_order').delete().eq('id', delivery.id)
    } catch {
      // best effort rollback; surface the original delivery detail failure
    }
    throw error
  }
  return Number(delivery.id || 0) || null
}

async function deleteDeliveryCascade(id?: number | null) {
  if (!id) return
  try {
    await getSupabaseClient().from('delivery_order_item').delete().eq('delivery_order_id', id)
    await getSupabaseClient().from('delivery_order').delete().eq('id', id)
  } catch {
    // best effort rollback
  }
}

function normalizeExpensePayload(payload: any, current: any = {}) {
  const expenseType = normalizeExpenseType(payload?.expenseType ?? current.expenseType)
  const amount = roundExpenseAmount(payload?.amount ?? current.amount)
  const expenseDate = normalizeExpenseDate(payload?.expenseDate ?? current.expenseDate)
  if (!isFinanceExpenseType(expenseType)) throw new Error('请选择正确的费用类型')
  const amountError = validateExpenseAmount(amount)
  if (amountError) throw new Error(amountError)
  const dateError = validateExpenseDate(expenseDate)
  if (dateError) throw new Error(dateError)
  const payee = normalizeExpensePayee(payload?.payee ?? current.payee)
  const payeeError = validateExpensePayee(payee)
  if (payeeError) throw new Error(payeeError)
  return {
    expense_type: expenseType,
    amount,
    expense_date: expenseDate,
    payee,
    remark: String(payload?.remark ?? current.remark ?? '').trim(),
  }
}

async function buildExpenseRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  let query: any = supabase.from('expense_record').select('*', { count: 'exact' })
  const keyword = normalizeExpenseKeyword(params?.keyword)
  const expenseType = normalizeExpenseType(params?.expenseType || params?.type)
  if (expenseType) query = query.eq('expense_type', expenseType)
  if (params?.startDate) query = query.gte('expense_date', params.startDate)
  if (params?.endDate) query = query.lte('expense_date', params.endDate)
  if (keyword) {
    query = query.or(`expense_no.ilike.*${keyword}*,payee.ilike.*${keyword}*,remark.ilike.*${keyword}*,expense_type.ilike.*${keyword}*`)
  }
  const { data, error, count } = await query.order('expense_date', { ascending: false }).order('id', { ascending: false }).range(from, to)
  if (error) throw error
  const records = toCamelDeep(data || []).map((item: any) => ({
    ...item,
    expenseTypeText: getFinanceExpenseTypeText(item.expenseType),
  }))
  return ok({ records, list: records, total: count || records.length })
}

async function createExpenseRecord(payload: any) {
  const data = {
    expense_no: payload?.expenseNo || createExpenseNo(),
    ...normalizeExpensePayload(payload),
    created_by: getCurrentUserId() || null,
  }
  const { data: created, error } = await getSupabaseClient().from('expense_record').insert(data).select().single()
  if (error) throw error
  return ok(toCamelDeep(created), 'created')
}

async function updateExpenseRecord(id: number, payload: any) {
  const supabase = getSupabaseClient()
  const { data: existingRaw, error: existingError } = await supabase.from('expense_record').select('*').eq('id', id).maybeSingle()
  if (existingError) throw existingError
  const existing = toCamelDeep(existingRaw || {})
  if (!existing?.id) throw new Error('未找到费用记录')
  const updates: Record<string, any> = normalizeExpensePayload(payload, existing)
  if (payload?.expenseNo) {
    updates.expense_no = payload.expenseNo
  }
  const { data, error } = await supabase.from('expense_record').update(updates).eq('id', id).select().single()
  if (error) throw error
  return ok(toCamelDeep(data), 'updated')
}

function loginEmail(loginName: string) {
  return loginName.includes('@') ? loginName : `${loginName}@${supabaseAuthEmailDomain}`
}

async function findUserProfile(loginName?: string, authUserId?: string) {
  const supabase = getSupabaseClient()
  const columns = 'id, username, real_name, phone, role, status'
  if (authUserId && tableColumns.sys_user.includes('auth_user_id')) {
    const result = await supabase.from('sys_user').select(columns).eq('auth_user_id', authUserId).maybeSingle()
    if (!result.error && result.data) return result.data
  }
  if (loginName) {
    const result = await supabase
      .from('sys_user')
      .select(columns)
      .or(`username.eq.${loginName},phone.eq.${loginName}`)
      .maybeSingle()
    if (!result.error && result.data) return result.data
  }
  return undefined
}

function authPayload(raw: any, fallbackToken?: string) {
  const data = Array.isArray(raw) ? raw[0] : raw
  const camel = toCamelDeep(data || {})
  const token = camel.token || camel.sessionToken || fallbackToken || ''
  const userId = camel.userId || camel.id || 0
  const userName = camel.userName || camel.username || camel.phone || ''
  const realName = camel.realName || camel.name || userName
  const role = camel.role || 'USER'
  return {
    token,
    userId,
    userName,
    username: userName,
    realName,
    phone: camel.phone || '',
    role,
    roles: [role],
  }
}

async function login(data: any) {
  const supabase = getSupabaseClient()
  const loginName = String(data?.username || data?.phone || data?.email || '').trim()
  const password = String(data?.password || '')
  if (!loginName || !password) throw new Error('请输入账号和密码')

  const authResult = await supabase.auth.signInWithPassword({
    email: loginEmail(loginName),
    password,
  })
  if (!authResult.error && authResult.data.session) {
    const profile = await findUserProfile(loginName, authResult.data.user?.id)
    return ok(authPayload(profile || authResult.data.user?.user_metadata || {}, authResult.data.session.access_token))
  }

  const rpcResult = await supabase.rpc('erp_login', {
    login_name: loginName,
    login_password: password,
  })
  if (rpcResult.error) throw authResult.error || rpcResult.error
  return ok(authPayload(rpcResult.data))
}

async function currentUser() {
  const storedUser = getStoredUserContext()
  if (storedUser.userId) {
    return ok(formatCurrentUserPayload(storedUser, getStoredToken()))
  }
  const supabase = getSupabaseClient()
  const { data } = await supabase.auth.getUser()
  const authUser = data.user
  const profile = await findUserProfile(authUser?.email?.split('@')[0], authUser?.id)
  return ok(authPayload(profile || authUser?.user_metadata || {}, (await supabase.auth.getSession()).data.session?.access_token))
}

async function uploadFile(file: File, prefix = 'uploads') {
  const supabase = getSupabaseClient()
  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `${prefix}/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from(supabaseStorageBucket).upload(path, file, { upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from(supabaseStorageBucket).getPublicUrl(path)
  return ok({ path, url: data.publicUrl })
}

async function uploadFormData(data: any, prefix: string) {
  const file = data instanceof FormData ? data.get('file') : undefined
  if (file instanceof File) {
    return uploadFile(file, prefix)
  }
  throw new Error('未找到可上传的文件')
}

const integrationTargetMap: Record<string, { table: string; codeColumn: string; labelColumns: string }> = {
  MACHINE: { table: 'machine', codeColumn: 'code', labelColumns: 'id, code, name, status' },
  MOLD: { table: 'mold', codeColumn: 'code', labelColumns: 'id, code, name, status' },
  PRODUCT: { table: 'product', codeColumn: 'code', labelColumns: 'id, code, name, unit, status' },
  BATCH: { table: 'material_batch', codeColumn: 'batch_no', labelColumns: 'id, batch_no, product_id, remaining_qty, status' },
  PROD_ORDER: { table: 'prod_order', codeColumn: 'order_no', labelColumns: 'id, order_no, product_id, machine_id, status, plan_qty, completed_qty' },
}

async function findIntegrationTarget(targetType: string, codeOrId: string | number) {
  const target = integrationTargetMap[targetType]
  if (!target) throw new Error('不支持的集成目标类型')
  const supabase = getSupabaseClient()
  const text = String(codeOrId || '').trim()
  let query = supabase.from(target.table).select(target.labelColumns)
  const id = Number(text)
  if (Number.isFinite(id) && id > 0 && String(id) === text) {
    query = query.eq('id', id)
  } else {
    query = query.eq(target.codeColumn, text)
  }
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ? toCamelDeep(data) : null
}

async function handleIntegrationTelemetry(data: any) {
  const message = validateIntegrationTelemetry(data || {})
  if (message) throw new Error(message)
  const payload = normalizeIntegrationTelemetry(data || {})
  const resolvedMachine = payload.machineId || payload.machineCode ? await findIntegrationTarget('MACHINE', payload.machineId || payload.machineCode || '') : null
  if (!resolvedMachine?.id) throw new Error('未找到匹配的机台')

  if (payload.status) {
    const { error } = await getSupabaseClient()
      .from('machine')
      .update({ status: payload.status, updated_at: new Date().toISOString() })
      .eq('id', resolvedMachine.id)
    if (error) throw error
  }

  const resolvedOrder = payload.prodOrderId || payload.orderNo ? await findIntegrationTarget('PROD_ORDER', payload.prodOrderId || payload.orderNo || '') : null
  return ok(
    buildIntegrationResult('success', 'PLC 遥测已校验并接入机台状态。', {
      telemetry: payload,
      machine: resolvedMachine,
      prodOrder: resolvedOrder || null,
      materialized: { machineStatusUpdated: !!payload.status, productionReportCreated: false },
    }),
  )
}

async function handleIntegrationScan(data: any) {
  const message = validateIntegrationScan(data || {})
  if (message) throw new Error(message)
  const payload = normalizeIntegrationScan(data || {})
  const target = await findIntegrationTarget(payload.codeType, payload.code)
  if (!target?.id) {
    return ok(buildIntegrationResult('warning', '未找到匹配的业务对象。', { scan: payload, target: null }))
  }
  return ok(buildIntegrationResult('success', '扫码识别完成。', { scan: payload, target }))
}

async function handleIntegrationLabelPreview(data: any) {
  const message = validateIntegrationLabel(data || {})
  if (message) throw new Error(message)
  const payload = normalizeIntegrationLabel(data || {})
  const target = await findIntegrationTarget(payload.targetType, payload.targetId)
  if (!target?.id) throw new Error('未找到标签目标')
  const code = target.code || target.batchNo || String(target.id)
  return ok(
    buildIntegrationResult('success', '标签预览已生成。', {
      label: {
        targetType: payload.targetType,
        targetId: payload.targetId,
        code,
        title: target.name || target.batchNo || code,
        qrText: `${payload.targetType}:${code}`,
      },
      target,
    }),
  )
}

async function handleIntegrationScale(data: any) {
  const message = validateIntegrationScale(data || {})
  if (message) throw new Error(message)
  const payload = convertIntegrationScale(data || {})
  return ok(buildIntegrationResult('success', '称重换算完成。', { scale: payload }))
}

async function handleIntegrationPushTest(data: any) {
  const message = validateIntegrationPush(data || {})
  if (message) throw new Error(message)
  const payload = normalizeIntegrationPush(data || {})
  return ok(
    buildIntegrationResult('success', '推送测试请求已生成。', {
      message: payload,
      delivery: { externalPushExecuted: false, reason: '本地模拟返回，不在页面测试中触发外部 Webhook。' },
    }),
  )
}

async function handleIntegrationPost(path: string, data: any) {
  if (path === 'integrations/plc/telemetry') return handleIntegrationTelemetry(data)
  if (path === 'integrations/scan') return handleIntegrationScan(data)
  if (path === 'integrations/label/preview') return handleIntegrationLabelPreview(data)
  if (path === 'integrations/scale') return handleIntegrationScale(data)
  if (path === 'integrations/push/test') return handleIntegrationPushTest(data)
  throw new Error(`未配置集成接口：/${path}`)
}

async function configObject() {
  const route = resolveResourceRoute('/system/config')!
  const result = await listTable(route, { page: 1, size: 500 })
  const rows = result.data.records || []
  const config = rows.reduce((acc: Record<string, any>, row: any) => {
      acc[row.configKey] = row.configValue
      return acc
    }, {})
  return ok(normalizeSystemConfig(config))
}

async function updateConfig(payload: Record<string, any>) {
  const supabase = getSupabaseClient()
  const current = (await configObject()).data || {}
  const next = { ...current, ...payload }
  const message = validateSystemConfig(next)
  if (message) throw new Error(message)
  const normalized = normalizeSystemConfig(next)
  const rows = buildSystemConfigRows(normalized)
  const { error } = await supabase.from('sys_config').upsert(rows, { onConflict: 'config_key' })
  if (error) throw error
  return ok(normalized, 'updated')
}

async function unreadCount() {
  const supabase = getSupabaseClient()
  let query = supabase.from('notification').select('id', { count: 'exact', head: true }).eq('is_read', 0)
  const userId = getCurrentUserId()
  if (userId) {
    query = query.eq('user_id', userId)
  }
  const { count, error } = await query
  if (error) throw error
  return ok({ count: count || 0, unreadCount: count || 0, total: count || 0 })
}

async function dashboardHome() {
  const supabase = getSupabaseClient()
  const today = new Date().toISOString().slice(0, 10)
  const userId = getCurrentUserId()
  let notificationQuery = supabase.from('notification').select('id').eq('is_read', 0)
  if (userId) {
    notificationQuery = notificationQuery.eq('user_id', userId)
  }
  const [reports, orders, machines, notifications] = await Promise.all([
    supabase.from('prod_report').select('qty, bad_qty, created_at').gte('created_at', today),
    supabase.from('prod_order').select('status, plan_qty, completed_qty, created_at'),
    supabase.from('machine').select('status'),
    notificationQuery,
  ])
  const reportRows = reports.data || []
  const orderRows = orders.data || []
  const machineRows = machines.data || []
  return ok({
    todayProductionQty: reportRows.reduce((sum, item: any) => sum + Number(item.qty || 0), 0),
    pendingOrderQty: orderRows.filter((item: any) => ['WAITING', 'SCHEDULED', 'RUNNING', 'PAUSED'].includes(item.status)).length,
    runningMachineQty: machineRows.filter((item: any) => item.status === 'RUNNING').length,
    unreadNotificationQty: notifications.data?.length || 0,
    productionTrend: [{ date: today, qty: reportRows.reduce((sum, item: any) => sum + Number(item.qty || 0), 0) }],
    orderStatusDistribution: Object.entries(
      orderRows.reduce((acc: Record<string, number>, item: any) => {
        acc[item.status || 'UNKNOWN'] = (acc[item.status || 'UNKNOWN'] || 0) + 1
        return acc
      }, {})
    ).map(([status, count]) => ({ status, label: status, count })),
    todoList: [],
  })
}

async function productionBoard(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const scope = createFinanceStatementScope(params)
  const startTime = `${scope.startDate} 00:00:00`
  const endTime = `${scope.endDate} 23:59:59`
  const today = new Date().toISOString().slice(0, 10)
  const [machines, orders, reports, defects] = await Promise.all([
    supabase.from('machine').select('id, code, name, status').limit(1000),
    supabase
      .from('prod_order')
      .select('id, order_no, product_id, machine_id, plan_qty, completed_qty, status, plan_start, plan_end, created_at')
      .limit(2000),
    supabase
      .from('prod_report')
      .select('shift, qty, bad_qty, work_minutes, start_time, created_at')
      .gte('start_time', startTime)
      .lte('start_time', endTime)
      .limit(5000),
    supabase
      .from('qc_record')
      .select('defect_type, defect_qty, check_time')
      .gte('check_time', startTime)
      .lte('check_time', endTime)
      .limit(2000),
  ])

  const queryError = [machines, orders, reports, defects].find((item: any) => item.error)?.error
  if (queryError) throw queryError

  const orderRows = toCamelDeep(orders.data || [])
  const machineRows = toCamelDeep(machines.data || [])
  const reportRows = toCamelDeep(reports.data || [])
  const defectRows = toCamelDeep(defects.data || [])
  const isInScope = (value?: string | null) => {
    const date = String(value || '').slice(0, 10)
    return !!date && date >= scope.startDate && date <= scope.endDate
  }
  const scopedOrders = orderRows.filter(
    (item: any) =>
      isActiveProductionOrderStatus(item.status) ||
      isInScope(item.createdAt) ||
      isInScope(item.planStart) ||
      isInScope(item.planEnd),
  )
  const productMap = await loadRowsByIds(
    'product',
    scopedOrders.map((item: any) => item.productId),
    'id, code, name'
  )
  const activeOrderByMachine = new Map<number, any>()
  const orderedRows = scopedOrders.slice().sort((a: any, b: any) => {
    const statusRank = (status?: string) => {
      if (status === 'RUNNING') return 0
      if (status === 'PAUSED') return 1
      if (status === 'SCHEDULED') return 2
      if (status === 'WAITING') return 3
      return 9
    }
    return statusRank(a.status) - statusRank(b.status)
  })
  for (const item of orderedRows) {
    if (!item.machineId || !isActiveProductionOrderStatus(item.status)) continue
    if (!activeOrderByMachine.has(item.machineId)) {
      activeOrderByMachine.set(item.machineId, item)
    }
  }
  const machineStatuses = machineRows.map((item: any) => {
    const activeOrder = activeOrderByMachine.get(item.id)
    const activeProduct = activeOrder ? productMap.get(activeOrder.productId) : undefined
    return {
      machineId: item.id,
      machineName: item.name,
      status: item.status,
      orderNo: activeOrder?.orderNo || activeOrder?.order_no || '-',
      productName: activeProduct?.name || '-',
    }
  })
  const orderProgresses = scopedOrders.map((item: any) => {
    const product = productMap.get(item.productId)
    const planQty = Number(item.planQty || 0)
    const completedQty = Number(item.completedQty || 0)
    return {
      orderId: item.id,
      orderNo: item.orderNo,
      productName: product?.name || '-',
      planQty,
      completedQty,
      completionRate: productionRatioPercent(completedQty, planQty),
      status: item.status,
      planEnd: item.planEnd,
      overdue: !!item.planEnd && String(item.planEnd).slice(0, 10) < today && !isDoneProductionOrderStatus(item.status),
    }
  })
  const shiftMap = reportRows.reduce((acc: Record<string, any>, item: any) => {
    const key = item.shift || '未分班'
    acc[key] ||= { shift: key, qty: 0, badQty: 0, goodQty: 0, reportCount: 0, workMinutes: 0 }
    acc[key].qty += Number(item.qty || 0)
    acc[key].badQty += Number(item.badQty || 0)
    acc[key].goodQty += Math.max(Number(item.qty || 0) - Number(item.badQty || 0), 0)
    acc[key].reportCount += 1
    acc[key].workMinutes += Number(item.workMinutes || 0)
    return acc
  }, {})
  const defectMap = defectRows.reduce((acc: Record<string, number>, item: any) => {
    const key = item.defectType || '未分类'
    acc[key] = (acc[key] || 0) + Number(item.defectQty || 0)
    return acc
  }, {})
  return ok(buildProductionBoardSummary({
    periodMode: scope.periodMode,
    months: scope.months,
    startDate: scope.startDate,
    endDate: scope.endDate,
    machineStatuses,
    orderProgresses,
    shiftOutputs: Object.values(shiftMap),
    topDefects: Object.entries(defectMap)
      .map(([defectType, qty]) => ({ defectType, qty: Number(qty || 0) }))
      .sort((a, b) => Number(b.qty) - Number(a.qty))
      .slice(0, 5),
  }))
}

async function qualityBoard(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const scope = createFinanceStatementScope(params)
  const startTime = `${scope.startDate} 00:00:00`
  const endTime = `${scope.endDate} 23:59:59`
  const result = await supabase
    .from('qc_record')
    .select('id, product_id, check_type, check_result, defect_type, defect_qty, sample_qty, check_time')
    .gte('check_time', startTime)
    .lte('check_time', endTime)
    .order('check_time', { ascending: true })
    .limit(5000)
  if (result.error) throw result.error

  const rows = toCamelDeep(result.data || [])
  const productMap = await loadRowsByIds(
    'product',
    rows.map((item: any) => item.productId),
    'id, code, name'
  )
  const records = rows.map((item: any) => {
    const product = productMap.get(item.productId)
    return {
      id: item.id,
      productId: item.productId,
      productName: product?.name || '-',
      checkType: item.checkType,
      checkResult: item.checkResult,
      defectType: item.defectType,
      defectQty: item.defectQty,
      sampleQty: item.sampleQty,
      checkTime: item.checkTime,
    }
  })

  return ok(
    buildQualityBoardSummaryFromRecords(records, {
      periodMode: scope.periodMode,
      months: scope.months,
      startDate: scope.startDate,
      endDate: scope.endDate,
    }),
  )
}

function configRowsToObject(rows: any[]) {
  return rows.reduce((config: Record<string, any>, row: any) => {
    const key = row.configKey || row.config_key
    if (key) config[key] = row.configValue ?? row.config_value ?? ''
    return config
  }, {})
}

async function loadBusinessWarningRows() {
  const supabase = getSupabaseClient()
  const [stockResult, moldResult, configResult] = await Promise.all([
    supabase.from('stock').select('*').order('updated_at', { ascending: false }).limit(1000),
    supabase.from('mold').select('id, code, name, status, used_shots, lifetime, shots_since_maintenance, maintenance_cycle').limit(1000),
    supabase.from('sys_config').select('config_key, config_value').in('config_key', [
      'stock_warning_enabled',
      'stock_expiry_warning_days',
      'mold_maintenance_warning_ratio',
      'mold_lifetime_warning_ratio',
    ]),
  ])
  const queryError = [stockResult, moldResult, configResult].find((item: any) => item.error)?.error
  if (queryError) throw queryError

  const stockRows = toCamelDeep(stockResult.data || [])
  const moldRows = toCamelDeep(moldResult.data || [])
  const productMap = await loadRowsByIds(
    'product',
    stockRows.map((item: any) => item.productId),
    'id, code, name, unit, safe_stock, status'
  )
  const warehouseMap = await loadRowsByIds('warehouse', stockRows.map((item: any) => item.warehouseId), 'id, name')
  const locationMap = await loadRowsByIds('warehouse_location', stockRows.map((item: any) => item.locationId), 'id, code')
  const batchMap = await loadRowsByIds(
    'material_batch',
    stockRows.map((item: any) => item.batchId),
    'id, batch_no, expiry_date, production_date, remaining_qty, status'
  )

  return buildBusinessWarnings({
    config: configRowsToObject(toCamelDeep(configResult.data || [])),
    stockRows: stockRows.map((item: any) => {
      const product = productMap.get(Number(item.productId || 0))
      const warehouse = warehouseMap.get(Number(item.warehouseId || 0))
      const location = locationMap.get(Number(item.locationId || 0))
      const batch = batchMap.get(Number(item.batchId || 0))
      const qty = toNumber(item.qty)
      const lockedQty = toNumber(item.lockedQty)
      return {
        id: item.id,
        productId: item.productId,
        productCode: product?.code,
        productName: product?.name,
        productUnit: product?.unit,
        warehouseName: warehouse?.name,
        locationCode: location?.code,
        batchId: item.batchId,
        batchNo: batch?.batchNo,
        batchStatus: batch ? resolveBatchStatus({ ...batch, remainingQty: qty }) : '',
        batchExpiryDate: normalizeDateOnly(batch?.expiryDate),
        qty,
        lockedQty,
        availableQty: qty - lockedQty,
        safeStock: toNumber(product?.safeStock),
      }
    }),
    moldRows,
  })
}

async function warningList() {
  return ok(await loadBusinessWarningRows())
}

async function warningSummary() {
  return ok(summarizeBusinessWarnings(await loadBusinessWarningRows()))
}

async function stockWarningList() {
  const warnings = await loadBusinessWarningRows()
  return ok(warnings.filter((item) => item.category === '库存'))
}

async function oeeStats() {
  return ok({ oee: 0, timeAvailability: 0, performanceRate: 0, qualityRate: 0 })
}

type FinanceMonthBucket = {
  month: string
  orderAmount: number
  paymentAmount: number
  expenseTotal: number
  salaryTotal: number
  pendingSalaryTotal: number
  materialCost: number
  grossProfit: number
  receivableBalance: number
  orderCount: number
  paymentCount: number
  shipmentQty: number
  shipmentCount: number
  costGapCount: number
  draftOrderCount: number
  pendingSalaryCount: number
  collectionRate: number
  profitRate: number
  status: string
}

function roundMoney(value: any) {
  return Number(toNumber(value).toFixed(2))
}

function roundUnitCost(value: any) {
  return Number(toNumber(value).toFixed(4))
}

function roundRate(value: any) {
  return Number(toNumber(value).toFixed(1))
}

function ratioPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return numerator > 0 ? 100 : 0
  return roundRate((numerator / denominator) * 100)
}

function createFinanceMonthBucket(month: string): FinanceMonthBucket {
  return {
    month,
    orderAmount: 0,
    paymentAmount: 0,
    expenseTotal: 0,
    salaryTotal: 0,
    pendingSalaryTotal: 0,
    materialCost: 0,
    grossProfit: 0,
    receivableBalance: 0,
    orderCount: 0,
    paymentCount: 0,
    shipmentQty: 0,
    shipmentCount: 0,
    costGapCount: 0,
    draftOrderCount: 0,
    pendingSalaryCount: 0,
    collectionRate: 0,
    profitRate: 0,
    status: 'NORMAL',
  }
}

function createFinanceMonthScope(params?: Record<string, any>) {
  const scope = createFinanceStatementScope(params)
  return {
    ...scope,
    buckets: new Map(scope.monthKeys.map((month) => [month, createFinanceMonthBucket(month)])),
  }
}

function estimateShipmentMaterialCost(row: any, productMap: Map<number, any>, rawProductMap: Map<number, any>) {
  const product = productMap.get(Number(row.productId || 0))
  if (!product) return { cost: 0, hasGap: true, reason: '缺少产品档案' }
  const rawMaterialId = Number(product.rawMaterialId || 0)
  const rawMaterialUsage = toNumber(product.rawMaterialUsage)
  if (!rawMaterialId || rawMaterialUsage <= 0) return { cost: 0, hasGap: true, reason: '缺少产品原料用量' }
  const rawProduct = rawProductMap.get(rawMaterialId)
  const rawUnitCost = toNumber(rawProduct?.piecePrice)
  if (rawUnitCost <= 0) return { cost: 0, hasGap: true, reason: '缺少原料单价' }
  return {
    cost: toNumber(row.qty) * rawMaterialUsage * rawUnitCost,
    hasGap: false,
    reason: '',
  }
}

function stockCostKey(productId: any, warehouseId: any, locationId?: any, batchId?: any) {
  return [
    Number(productId || 0),
    Number(warehouseId || 0),
    Number(locationId || 0) || 0,
    Number(batchId || 0) || 0,
  ].join('|')
}

async function loadInboundStockCostMap(stockRows: any[]) {
  const productIds = Array.from(new Set(stockRows.map((item: any) => Number(item.productId || 0)).filter(Boolean)))
  if (!productIds.length) return new Map<string, number>()
  const { data, error } = await getSupabaseClient()
    .from('stock_move')
    .select('product_id, warehouse_id, location_id, batch_id, qty, unit_cost, amount, move_type')
    .eq('move_type', 'IN')
    .in('product_id', productIds)
  if (error) throw error
  const grouped = new Map<string, { qty: number; amount: number }>()
  for (const row of data || []) {
    const qty = toNumber(row.qty)
    if (qty <= 0) continue
    const rowAmount = row.amount === null || row.amount === undefined || row.amount === '' ? undefined : toFiniteNumber(row.amount)
    const rowUnitCost = row.unit_cost === null || row.unit_cost === undefined || row.unit_cost === '' ? undefined : toFiniteNumber(row.unit_cost)
    const amount = rowAmount ?? (rowUnitCost !== undefined ? qty * rowUnitCost : undefined)
    if (amount === undefined || amount <= 0) continue
    const key = stockCostKey(row.product_id, row.warehouse_id, row.location_id, row.batch_id)
    const current = grouped.get(key) || { qty: 0, amount: 0 }
    current.qty += qty
    current.amount += amount
    grouped.set(key, current)
  }
  return new Map(
    Array.from(grouped.entries())
      .filter(([, value]) => value.qty > 0 && value.amount > 0)
      .map(([key, value]) => [key, roundUnitCost(value.amount / value.qty)])
  )
}

function resolveStockUnitCostFromMap(costMap: Map<string, number>, stockRow: any, product?: any) {
  const exactKey = stockCostKey(stockRow.productId, stockRow.warehouseId, stockRow.locationId, stockRow.batchId)
  const warehouseKey = stockCostKey(stockRow.productId, stockRow.warehouseId)
  return costMap.get(exactKey) ?? costMap.get(warehouseKey) ?? roundUnitCost(product?.piecePrice)
}

function resolveShipmentCost(row: any, productMap: Map<number, any>, rawProductMap: Map<number, any>) {
  const qty = toNumber(row.qty)
  const actualAmount = row.amount === null || row.amount === undefined || row.amount === '' ? undefined : toFiniteNumber(row.amount)
  if (actualAmount !== undefined) {
    return { cost: roundMoney(actualAmount), hasGap: false, reason: '', source: 'ACTUAL' }
  }
  const actualUnitCost = row.unitCost === null || row.unitCost === undefined || row.unitCost === '' ? undefined : toFiniteNumber(row.unitCost)
  if (actualUnitCost !== undefined && actualUnitCost > 0) {
    return { cost: roundMoney(qty * actualUnitCost), hasGap: false, reason: '', source: 'ACTUAL' }
  }
  const estimated = estimateShipmentMaterialCost(row, productMap, rawProductMap)
  return { ...estimated, source: estimated.hasGap ? 'GAP' : 'ESTIMATED' }
}

function resolveBatchStatus(batch?: any) {
  if (!batch) return ''
  const remainingQty = toNumber(batch.remainingQty)
  if (remainingQty <= 0) return 'DEPLETED'
  const expiryDate = normalizeDateOnly(batch.expiryDate)
  if (!expiryDate) return normalizeBusinessStatus(batch.status) || 'NORMAL'
  if (compareDateOnly(expiryDate, todayDateOnly()) < 0) return 'EXPIRED'
  const expiryTime = new Date(`${expiryDate}T00:00:00`).getTime()
  const todayTime = new Date(`${todayDateOnly()}T00:00:00`).getTime()
  const daysToExpiry = Math.ceil((expiryTime - todayTime) / (24 * 60 * 60 * 1000))
  return daysToExpiry <= 30 ? 'EXPIRING' : normalizeBusinessStatus(batch.status) || 'NORMAL'
}

function buildFinanceRisks(monthItems: FinanceMonthBucket[]) {
  const risks: Array<{ type: string; level: string; month: string; title: string; description: string }> = []
  for (const item of monthItems) {
    if (item.grossProfit < 0) {
      risks.push({
        type: 'LOSS',
        level: 'error',
        month: item.month,
        title: `${item.month} 估算毛利为负`,
        description: `订单金额 ${roundMoney(item.orderAmount)}，成本费用合计 ${roundMoney(item.materialCost + item.salaryTotal + item.expenseTotal)}，需复核售价、成本和费用归集。`,
      })
    }
    if (item.costGapCount > 0) {
      risks.push({
        type: 'COST_GAP',
        level: 'warning',
        month: item.month,
        title: `${item.month} 存在成本数据缺口`,
        description: `${item.costGapCount} 笔销售出库缺少流水成本，已按产品原料用量兜底估算；若仍缺少产品原料或单价，成本按 0 列示。`,
      })
    }
    if (item.orderAmount > 0 && item.receivableBalance > 0 && item.collectionRate < 80) {
      risks.push({
        type: 'RECEIVABLE',
        level: 'warning',
        month: item.month,
        title: `${item.month} 回款率偏低`,
        description: `回款率 ${roundRate(item.collectionRate)}%，应收余额 ${roundMoney(item.receivableBalance)}，建议结合客户账期跟进催收。`,
      })
    }
    if (item.draftOrderCount > 0) {
      risks.push({
        type: 'DRAFT_ORDER',
        level: 'info',
        month: item.month,
        title: `${item.month} 存在未审核销售订单`,
        description: `${item.draftOrderCount} 单仍为草稿状态，已纳入订单金额统计，正式财务口径需完成审核确认。`,
      })
    }
    if (item.pendingSalaryCount > 0) {
      risks.push({
        type: 'PENDING_SALARY',
        level: 'info',
        month: item.month,
        title: `${item.month} 存在未结算工资`,
        description: `${item.pendingSalaryCount} 条工资或奖惩明细尚未月结，待结金额 ${roundMoney(item.pendingSalaryTotal)} 未纳入正式工资总额和毛利。`,
      })
    }
  }
  return risks.slice(0, 12)
}

async function financeStatements(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const scope = createFinanceMonthScope(params)
  const startTime = `${scope.startDate} 00:00:00`
  const endTime = `${scope.endDate} 23:59:59`

  const [ordersResult, paymentsResult, expensesResult, salaryResult, salaryAdjustResult, shipmentsResult] = await Promise.all([
    supabase
      .from('sale_order')
      .select('*')
      .gte('order_date', scope.startDate)
      .lte('order_date', scope.endDate),
    supabase
      .from('payment_record')
      .select('id, pay_amount, pay_date, sale_order_id, customer_id')
      .gte('pay_date', scope.startDate)
      .lte('pay_date', scope.endDate),
    supabase
      .from('expense_record')
      .select('id, amount, expense_date, expense_type')
      .gte('expense_date', scope.startDate)
      .lte('expense_date', scope.endDate),
    supabase
      .from('salary_daily')
      .select('id, total_piece_amount, subsidy, deduction, total_amount, work_date, status')
      .gte('work_date', scope.startDate)
      .lte('work_date', scope.endDate),
    supabase
      .from('salary_adjust')
      .select('*')
      .gte('adjust_date', scope.startDate)
      .lte('adjust_date', scope.endDate),
    supabase
      .from('stock_move')
      .select('id, product_id, qty, unit_cost, amount, operate_time, related_order_id, related_order_type, move_reason')
      .eq('related_order_type', 'SALE_ORDER')
      .eq('move_reason', 'OUT_SALE')
      .gte('operate_time', startTime)
      .lte('operate_time', endTime),
  ])

  const queryError = [ordersResult, paymentsResult, expensesResult, salaryResult, salaryAdjustResult, shipmentsResult].find((item: any) => item.error)?.error
  if (queryError) throw queryError

  const orders = toCamelDeep(ordersResult.data || [])
  const payments = toCamelDeep(paymentsResult.data || [])
  const expenses = toCamelDeep(expensesResult.data || [])
  const salaries = toCamelDeep(salaryResult.data || [])
  const salaryAdjustments = toCamelDeep(salaryAdjustResult.data || [])
  const shipments = toCamelDeep(shipmentsResult.data || [])
  const productMap = await loadRowsByIds(
    'product',
    shipments.map((item: any) => item.productId),
    'id, code, name, raw_material_id, raw_material_usage, piece_price'
  )
  const rawProductMap = await loadRowsByIds(
    'product',
    Array.from(productMap.values()).map((item: any) => item.rawMaterialId),
    'id, code, name, piece_price'
  )
  const paymentSummaryMap = await loadSaleOrderPaymentSummaryMap(orders.map((item: any) => item.id))
  const paymentSummaryAsOfEndMap = await loadSaleOrderPaymentSummaryMap(
    orders.map((item: any) => item.id),
    { endDate: scope.endDate }
  )

  for (const order of orders) {
    const bucket = scope.buckets.get(getFinanceStatementMonthKey(order.orderDate))
    if (!bucket || String(order.status || '').toUpperCase() === 'CANCELLED') continue
    const orderAmount = toNumber(order.totalAmount)
    const orderId = Number(order.id)
    const receivedAmount = resolveSaleOrderReceivedAmountAsOf(
      order,
      paymentSummaryMap.get(orderId),
      paymentSummaryAsOfEndMap.get(orderId)
    )
    bucket.orderAmount += orderAmount
    bucket.receivableBalance += Math.max(orderAmount - receivedAmount, 0)
    bucket.orderCount += 1
    if (String(order.status || '').toUpperCase() === 'DRAFT') {
      bucket.draftOrderCount += 1
    }
  }

  for (const payment of payments) {
    const bucket = scope.buckets.get(getFinanceStatementMonthKey(payment.payDate))
    if (!bucket) continue
    bucket.paymentAmount += toNumber(payment.payAmount)
    bucket.paymentCount += 1
  }

  for (const expense of expenses) {
    const bucket = scope.buckets.get(getFinanceStatementMonthKey(expense.expenseDate))
    if (!bucket) continue
    bucket.expenseTotal += toNumber(expense.amount)
  }

  for (const salary of salaries) {
    const bucket = scope.buckets.get(getFinanceStatementMonthKey(salary.workDate))
    if (!bucket) continue
    const dailyAmount = toNumber(salary.totalPieceAmount) + toNumber(salary.subsidy) - toNumber(salary.deduction)
    const amount = dailyAmount || toNumber(salary.totalAmount)
    if (String(salary.status || '').toUpperCase() === 'SETTLED') {
      bucket.salaryTotal += amount
    } else {
      bucket.pendingSalaryTotal += amount
      bucket.pendingSalaryCount += 1
    }
  }

  for (const adjust of salaryAdjustments) {
    const bucket = scope.buckets.get(getFinanceStatementMonthKey(adjust.adjustDate))
    if (!bucket) continue
    const amount = getSalaryAdjustEffect(adjust.adjustType, adjust.amount)
    if (String(adjust.status || '').toUpperCase() === 'SETTLED') {
      bucket.salaryTotal += amount
    } else {
      bucket.pendingSalaryTotal += amount
      bucket.pendingSalaryCount += 1
    }
  }

  for (const shipment of shipments) {
    const bucket = scope.buckets.get(getFinanceStatementMonthKey(shipment.operateTime))
    if (!bucket) continue
    const qty = toNumber(shipment.qty)
    const estimatedCost = resolveShipmentCost(shipment, productMap, rawProductMap)
    bucket.shipmentQty += qty
    bucket.shipmentCount += 1
    bucket.materialCost += estimatedCost.cost
    if (estimatedCost.hasGap) {
      bucket.costGapCount += 1
    }
  }

  const monthItems = scope.monthKeys.map((month) => {
    const item = scope.buckets.get(month) || createFinanceMonthBucket(month)
    item.orderAmount = roundMoney(item.orderAmount)
    item.paymentAmount = roundMoney(item.paymentAmount)
    item.expenseTotal = roundMoney(item.expenseTotal)
    item.salaryTotal = roundMoney(item.salaryTotal)
    item.pendingSalaryTotal = roundMoney(item.pendingSalaryTotal)
    item.materialCost = roundMoney(item.materialCost)
    item.receivableBalance = roundMoney(item.receivableBalance)
    item.shipmentQty = roundMoney(item.shipmentQty)
    item.grossProfit = roundMoney(item.orderAmount - item.materialCost - item.salaryTotal - item.expenseTotal)
    item.collectionRate = ratioPercent(item.paymentAmount, item.orderAmount)
    item.profitRate = ratioPercent(item.grossProfit, item.orderAmount)
    item.status = item.grossProfit < 0 ? 'LOSS' : item.costGapCount > 0 ? 'COST_GAP' : item.receivableBalance > 0 ? 'RECEIVABLE' : 'NORMAL'
    return item
  })

  const totals = monthItems.reduce(
    (acc, item) => {
      acc.orderAmount += item.orderAmount
      acc.paymentAmount += item.paymentAmount
      acc.expenseTotal += item.expenseTotal
      acc.salaryTotal += item.salaryTotal
      acc.pendingSalaryTotal += item.pendingSalaryTotal
      acc.materialCost += item.materialCost
      acc.grossProfit += item.grossProfit
      acc.receivableBalance += item.receivableBalance
      acc.orderCount += item.orderCount
      acc.paymentCount += item.paymentCount
      acc.shipmentQty += item.shipmentQty
      acc.shipmentCount += item.shipmentCount
      acc.costGapCount += item.costGapCount
      acc.draftOrderCount += item.draftOrderCount
      acc.pendingSalaryCount += item.pendingSalaryCount
      return acc
    },
    {
      orderAmount: 0,
      paymentAmount: 0,
      expenseTotal: 0,
      salaryTotal: 0,
      pendingSalaryTotal: 0,
      materialCost: 0,
      grossProfit: 0,
      receivableBalance: 0,
      orderCount: 0,
      paymentCount: 0,
      shipmentQty: 0,
      shipmentCount: 0,
      costGapCount: 0,
      draftOrderCount: 0,
      pendingSalaryCount: 0,
      collectionRate: 0,
      profitRate: 0,
    }
  )
  totals.orderAmount = roundMoney(totals.orderAmount)
  totals.paymentAmount = roundMoney(totals.paymentAmount)
  totals.expenseTotal = roundMoney(totals.expenseTotal)
  totals.salaryTotal = roundMoney(totals.salaryTotal)
  totals.pendingSalaryTotal = roundMoney(totals.pendingSalaryTotal)
  totals.materialCost = roundMoney(totals.materialCost)
  totals.grossProfit = roundMoney(totals.grossProfit)
  totals.receivableBalance = roundMoney(totals.receivableBalance)
  totals.shipmentQty = roundMoney(totals.shipmentQty)
  totals.collectionRate = ratioPercent(totals.paymentAmount, totals.orderAmount)
  totals.profitRate = ratioPercent(totals.grossProfit, totals.orderAmount)

  return ok({
    months: scope.months,
    periodMode: scope.periodMode,
    startDate: scope.startDate,
    endDate: scope.endDate,
    monthItems,
    totals,
    riskItems: buildFinanceRisks(monthItems),
    monthOrderAmount: totals.orderAmount,
    monthPaymentAmount: totals.paymentAmount,
    monthExpenseTotal: totals.expenseTotal,
    monthSalaryTotal: totals.salaryTotal,
    pendingSalaryTotal: totals.pendingSalaryTotal,
    monthMaterialCost: totals.materialCost,
    monthGrossProfit: totals.grossProfit,
    receivableBalance: totals.receivableBalance,
    paymentRate: totals.collectionRate,
    collectionRate: totals.collectionRate,
    profitRate: totals.profitRate,
    orderCount: totals.orderCount,
    paymentCount: totals.paymentCount,
    shipmentQty: totals.shipmentQty,
    shipmentCount: totals.shipmentCount,
    costGapCount: totals.costGapCount,
    draftOrderCount: totals.draftOrderCount,
    pendingSalaryCount: totals.pendingSalaryCount,
  })
}

async function financeReceivables(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const scope = createFinanceStatementScope(params)
  const page = Math.max(Number(params?.page || 1), 1)
  const pageSize = Math.min(Math.max(Number(params?.pageSize || params?.size || 20), 1), 200)
  const keyword = String(params?.keyword || '').trim().toLowerCase()
  const filterCustomerId = Number(params?.customerId || 0)

  let orderQuery = supabase
    .from('sale_order')
    .select('*')
    .gte('order_date', scope.startDate)
    .lte('order_date', scope.endDate)
  if (filterCustomerId) orderQuery = orderQuery.eq('customer_id', filterCustomerId)

  const { data: orderRowsRaw, error: orderError } = await orderQuery
  if (orderError) throw orderError

  const orders = toCamelDeep(orderRowsRaw || [])
    .filter((order: any) => normalizeBusinessStatus(order.status) !== 'CANCELLED')
  const orderIds = orders.map((order: any) => Number(order.id || 0))
  const customerMap = await loadRowsByIds(
    'customer',
    orders.map((order: any) => order.customerId),
    'id, name, short_name, payment_days, credit_level'
  )
  const fullSummaryMap = await loadSaleOrderPaymentSummaryMap(orderIds)
  const asOfSummaryMap = await loadSaleOrderPaymentSummaryMap(orderIds, { endDate: scope.endDate })

  const rows = orders
    .map((order: any) => {
      const orderId = Number(order.id || 0)
      const receivedAmount = resolveSaleOrderReceivedAmountAsOf(
        order,
        fullSummaryMap.get(orderId),
        asOfSummaryMap.get(orderId)
      )
      return buildFinanceReceivableRow(
        {
          ...order,
          receivedAmount,
        },
        customerMap.get(Number(order.customerId || 0)),
        scope.endDate,
      )
    })
    .filter((row: any) => row.receivableAmount > 0)
    .filter((row: any) => {
      if (!keyword) return true
      return [
        row.orderNo,
        row.customerName,
        row.creditLevel,
        row.riskText,
      ].filter(Boolean).join(' ').toLowerCase().includes(keyword)
    })
    .sort((a: any, b: any) =>
      b.overdueDays - a.overdueDays
      || b.receivableAmount - a.receivableAmount
      || String(a.dueDate).localeCompare(String(b.dueDate))
      || String(a.orderNo).localeCompare(String(b.orderNo))
    )

  const from = (page - 1) * pageSize
  const records = rows.slice(from, from + pageSize)

  return ok({
    records,
    list: records,
    total: rows.length,
    summary: summarizeFinanceReceivables(rows),
    startDate: scope.startDate,
    endDate: scope.endDate,
    asOfDate: scope.endDate,
    page,
    pageSize,
  })
}

async function bossDashboard(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const scope = createFinanceStatementScope(params)
  const startTime = `${scope.startDate} 00:00:00`
  const endTime = `${scope.endDate} 23:59:59`
  const [financeResult, reportsResult, ordersResult, machinesResult, qcResult, warningRows] = await Promise.all([
    financeStatements(params),
    supabase
      .from('prod_report')
      .select('id, qty, bad_qty, work_minutes, created_at')
      .gte('created_at', startTime)
      .lte('created_at', endTime)
      .limit(2000),
    supabase
      .from('prod_order')
      .select('id, status, plan_qty, completed_qty, plan_end, created_at')
      .limit(2000),
    supabase.from('machine').select('id, status'),
    supabase
      .from('qc_record')
      .select('id, check_result, defect_qty, sample_qty, check_time')
      .gte('check_time', startTime)
      .lte('check_time', endTime)
      .limit(2000),
    loadBusinessWarningRows(),
  ])

  const queryError = [reportsResult, ordersResult, machinesResult, qcResult].find((item: any) => item.error)?.error
  if (queryError) throw queryError

  const reports = toCamelDeep(reportsResult.data || [])
  const orders = toCamelDeep(ordersResult.data || [])
  const machines = toCamelDeep(machinesResult.data || [])
  const qcRows = toCamelDeep(qcResult.data || [])
  const activeStatuses = new Set(['WAITING', 'SCHEDULED', 'RUNNING', 'PAUSED'])
  const closedStatuses = new Set(['DONE', 'FINISHED', 'COMPLETED', 'CANCELLED'])
  const today = todayDateOnly()

  const monthCompletedQty = reports.reduce((sum: number, item: any) => sum + toNumber(item.qty), 0)
  const monthBadQty = reports.reduce((sum: number, item: any) => sum + toNumber(item.badQty), 0)
  const monthGoodQty = Math.max(roundMoney(monthCompletedQty - monthBadQty), 0)
  const monthBadRate = ratioPercent(monthBadQty, monthCompletedQty)
  const qualityRate = ratioPercent(monthGoodQty, monthCompletedQty)

  const validOrders = orders.filter((item: any) => !closedStatuses.has(normalizeBusinessStatus(item.status)))
  const productionOrderCount = validOrders.length
  const runningOrderCount = validOrders.filter((item: any) => activeStatuses.has(normalizeBusinessStatus(item.status))).length
  const overdueOrderCount = validOrders.filter((item: any) => {
    const planEnd = normalizeDateOnly(item.planEnd)
    return planEnd && compareDateOnly(planEnd, today) < 0
  }).length
  const plannedQty = validOrders.reduce((sum: number, item: any) => sum + toNumber(item.planQty), 0)
  const completedOrderQty = validOrders.reduce((sum: number, item: any) => sum + toNumber(item.completedQty), 0)
  const performanceRate = ratioPercent(completedOrderQty, plannedQty)

  const machineCount = machines.length
  const runningMachineCount = machines.filter((item: any) => normalizeBusinessStatus(item.status) === 'RUNNING').length
  const timeAvailability = ratioPercent(runningMachineCount, machineCount)
  const oee = roundRate((timeAvailability / 100) * (performanceRate / 100) * (qualityRate / 100) * 100)
  const qcRecordCount = qcRows.length
  const defectQty = qcRows.reduce((sum: number, item: any) => sum + toNumber(item.defectQty), 0)
  const qcFailCount = qcRows.filter((item: any) => {
    const result = normalizeBusinessStatus(item.checkResult)
    return result && !['PASS', 'OK', 'QUALIFIED'].includes(result)
  }).length

  return ok({
    ...(financeResult.data || {}),
    startDate: scope.startDate,
    endDate: scope.endDate,
    months: scope.months,
    periodMode: scope.periodMode,
    monthCompletedQty: roundMoney(monthCompletedQty),
    monthGoodQty: roundMoney(monthGoodQty),
    monthBadQty: roundMoney(monthBadQty),
    monthBadRate,
    productionOrderCount,
    runningOrderCount,
    overdueOrderCount,
    machineCount,
    runningMachineCount,
    timeAvailability,
    performanceRate,
    qualityRate,
    oee,
    qcRecordCount,
    qcFailCount,
    defectQty: roundMoney(defectQty),
    warningCount: warningRows.length,
    warningSummary: summarizeBusinessWarnings(warningRows),
  })
}

async function actionUpdate(route: RouteConfig, id: number, action?: string) {
  const statusMap: Record<string, Record<string, any>> = {
    approve: { status: 'APPROVED' },
    confirm: { status: 'CONFIRMED' },
    cancel: { status: 'CANCELLED' },
    dispatch: { status: 'SCHEDULED' },
    start: { status: 'RUNNING', actual_start: new Date().toISOString() },
    pause: { status: 'PAUSED' },
    resume: { status: 'RUNNING' },
    finish: { status: 'FINISHED', actual_end: new Date().toISOString() },
    close: { status: 'CLOSED' },
    ship: { status: 'SHIPPED' },
    receive: { status: 'RECEIVED', receive_time: new Date().toISOString() },
    submit: { status: 'SUBMITTED' },
    reject: { status: 'REJECTED' },
    read: { is_read: 1 },
  }
  await assertProdOrderActionAllowed(route, id, action)
  return updateTable(route, id, statusMap[action || ''] || {})
}

async function assertProdOrderActionAllowed(route: RouteConfig, id: number, action?: string) {
  if (route.table !== 'prod_order' || action !== 'finish') return
  const { data, error } = await getSupabaseClient()
    .from('prod_order')
    .select('id, product_id, plan_qty, completed_qty, picked_material_qty, picked_material_amount, raw_material_qty')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  const order = toCamelDeep(data || {})
  if (!order?.id) throw new Error('未找到生产工单')
  if (toNumber(order.completedQty) <= 0) throw new Error('没有报工产量，不能直接完工')
  const productMap = await loadRowsByIds('product', [order.productId], 'id, raw_material_usage')
  const plannedQty = plannedMaterialQty(order, productMap.get(Number(order.productId || 0)))
  if (plannedQty > 0 && toNumber(order.pickedMaterialQty) < plannedQty) {
    throw new Error('工单领料未完成，不能完工')
  }
}

function createMovePayload(url: string, data: any) {
  const path = normalizePath(url)
  const source = path === 'stock/in-purchase'
    ? { ...data, ...buildPurchaseInboundPayload(data || {}) }
    : path === 'stock/transfer'
      ? { ...data, ...buildStockTransferPayload(data || {}) }
      : data
  const moveType = path.includes('in-') ? 'IN' : path.includes('out-') ? 'OUT' : 'TRANSFER'
  const rows = source?.items || source?.products || [source]
  const first = Array.isArray(rows) ? rows[0] || source : source
  const unitCost = first.unitCost ?? first.purchaseUnitPrice ?? first.unitPrice ?? source?.unitCost ?? source?.purchaseUnitPrice ?? source?.unitPrice
  return {
    moveNo: source?.moveNo || source?.orderNo || `SM-${Date.now()}`,
    productId: first.productId,
    warehouseId: first.warehouseId || source?.warehouseId,
    locationId: first.locationId || source?.locationId,
    batchId: first.batchId || source?.batchId,
    toWarehouseId: first.toWarehouseId || source?.toWarehouseId,
    toLocationId: first.toLocationId || source?.toLocationId,
    toBatchId: first.toBatchId || source?.toBatchId,
    moveType,
    moveReason: path.split('/').pop()?.toUpperCase().replace(/-/g, '_') || moveType,
    qty: first.qty ?? first.quantity ?? source?.qty ?? source?.quantity ?? 0,
    unitCost,
    amount: first.amount ?? first.purchaseAmount ?? source?.amount ?? source?.purchaseAmount,
    saleOrderItemId: first.saleOrderItemId || first.itemId || source?.saleOrderItemId || source?.itemId,
    deliveryOrderId: first.deliveryOrderId || source?.deliveryOrderId,
    deliveryOrderItemId: first.deliveryOrderItemId || source?.deliveryOrderItemId,
    deliveryNo: source?.deliveryNo,
    deliveryDate: source?.deliveryDate,
    logisticsCompany: source?.logisticsCompany,
    trackingNo: source?.trackingNo,
    deliveryStatus: source?.deliveryStatus,
    relatedOrderId: source?.relatedOrderId,
    relatedOrderType: source?.relatedOrderType,
    operatorId: source?.operatorId || getCurrentUserId() || null,
    operateTime: source?.operateTime || (source?.inDate ? `${source.inDate}T00:00:00` : new Date().toISOString()),
    remark: source?.remark,
  }
}

function createPurchaseBatchNo(productId: number) {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `PC-${stamp}-${productId}-${String(now.getMilliseconds()).padStart(3, '0')}`
}

function normalizeStockMovePayload(url: string, data: any) {
  const payload = createMovePayload(url, data)
  const qty = Number(payload.qty)
  const unitCostValue = toFiniteNumber(payload.unitCost)
  const unitCost = unitCostValue === undefined ? undefined : roundUnitCost(unitCostValue)
  const amountValue = toFiniteNumber(payload.amount)
  const amount = amountValue === undefined ? (unitCost !== undefined ? roundMoney(qty * unitCost) : undefined) : roundMoney(amountValue)
  if (!payload.productId) throw new Error('请选择产品或物料')
  if (!payload.warehouseId) throw new Error('请选择仓库')
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('数量必须是大于 0 的整数')
  if (payload.moveReason === 'IN_PURCHASE' && (!unitCost || unitCost <= 0)) throw new Error('采购单价必须大于 0')
  if (payload.moveType === 'TRANSFER' && !payload.toWarehouseId) throw new Error('请选择调入仓库')
  return {
    ...payload,
    productId: Number(payload.productId),
    warehouseId: Number(payload.warehouseId),
    locationId: payload.locationId ? Number(payload.locationId) : null,
    batchId: payload.batchId ? Number(payload.batchId) : null,
    toWarehouseId: payload.toWarehouseId ? Number(payload.toWarehouseId) : null,
    toLocationId: payload.toLocationId ? Number(payload.toLocationId) : null,
    toBatchId: payload.toBatchId ? Number(payload.toBatchId) : null,
    relatedOrderId: payload.relatedOrderId ? Number(payload.relatedOrderId) : null,
    qty,
    unitCost,
    amount,
    saleOrderItemId: payload.saleOrderItemId ? Number(payload.saleOrderItemId) : null,
    deliveryOrderId: payload.deliveryOrderId ? Number(payload.deliveryOrderId) : null,
    deliveryOrderItemId: payload.deliveryOrderItemId ? Number(payload.deliveryOrderItemId) : null,
    deliveryNo: payload.deliveryNo || undefined,
    deliveryDate: payload.deliveryDate || undefined,
    logisticsCompany: payload.logisticsCompany || undefined,
    trackingNo: payload.trackingNo || undefined,
    deliveryStatus: payload.deliveryStatus || undefined,
  }
}

function validatePurchaseStockMove(data: any, payload: any) {
  if (payload.moveReason !== 'IN_PURCHASE') return
  buildPurchaseInboundPayload(data || {})
}

async function validatePurchaseSupplier(data: any, payload: any) {
  if (payload.moveReason !== 'IN_PURCHASE') return
  const supplierId = buildPurchaseInboundPayload(data || {}).supplierId
  const supplier = await assertSupplierUsable(supplierId)
  if (!payload.batchId) return
  const { data: batchRaw, error } = await getSupabaseClient()
    .from('material_batch')
    .select('id, supplier_id')
    .eq('id', payload.batchId)
    .maybeSingle()
  if (error) throw error
  const batch = toCamelDeep(batchRaw || {})
  if (!batch?.id) throw new Error('未找到采购入库批次')
  if (batch.supplierId && Number(batch.supplierId) !== Number(supplier.id)) {
    throw new Error('采购批次供应商与入库供应商不一致')
  }
}

async function ensurePurchaseBatch(data: any, payload: any) {
  if (payload.moveReason !== 'IN_PURCHASE') return null
  if (payload.batchId) return null
  const purchase = buildPurchaseInboundPayload(data || {})
  const { data: created, error } = await getSupabaseClient()
    .from('material_batch')
    .insert({
      batch_no: purchase.batchNo || createPurchaseBatchNo(payload.productId),
      product_id: payload.productId,
      warehouse_id: payload.warehouseId,
      supplier_id: purchase.supplierId,
      production_date: purchase.productionDate || null,
      expiry_date: purchase.expiryDate || null,
      initial_qty: payload.qty,
      remaining_qty: payload.qty,
      status: 'NORMAL',
    })
    .select()
    .single()
  if (error) throw error
  payload.batchId = Number(created?.id || 0) || null
  return payload.batchId
}

const PICKING_ORDER_STATUSES = new Set(['SCHEDULED', 'RUNNING', 'PAUSED'])

function assertProdOrderCanPick(order: any) {
  const status = normalizeBusinessStatus(order?.status)
  if (!order?.id) throw new Error('请选择生产工单')
  if (!PICKING_ORDER_STATUSES.has(status)) {
    throw new Error('仅已派工、生产中或暂停工单允许领料')
  }
}

function plannedMaterialQty(order: any, finishedProduct: any) {
  const explicitQty = toNumber(order?.rawMaterialQty ?? order?.raw_material_qty)
  if (explicitQty > 0) return Number(explicitQty.toFixed(2))
  const planQty = toNumber(order?.planQty ?? order?.plan_qty)
  const rawMaterialUsage = toNumber(finishedProduct?.rawMaterialUsage ?? finishedProduct?.raw_material_usage)
  return rawMaterialUsage > 0 ? Number((planQty * rawMaterialUsage).toFixed(2)) : 0
}

async function loadPickedMaterialSummary(orderId: number, productId: number) {
  const { data, error } = await getSupabaseClient()
    .from('stock_move')
    .select('qty, amount')
    .eq('related_order_type', 'PROD_ORDER')
    .eq('related_order_id', orderId)
    .eq('move_reason', 'OUT_PICKING')
    .eq('product_id', productId)
  if (error) throw error
  return (data || []).reduce(
    (summary, row: any) => ({
      qty: summary.qty + toNumber(row.qty),
      amount: summary.amount + toNumber(row.amount),
    }),
    { qty: 0, amount: 0 }
  )
}

function stockBatchSortValue(batch: any) {
  return [
    normalizeDateOnly(batch?.expiryDate) || '9999-12-31',
    normalizeDateOnly(batch?.productionDate) || '9999-12-31',
    String(batch?.createdAt || ''),
  ].join('|')
}

async function resolveOutboundStockBatch(payload: any) {
  let query = getSupabaseClient()
    .from('stock')
    .select('id, product_id, warehouse_id, location_id, batch_id, qty, locked_qty, updated_at')
    .eq('product_id', payload.productId)
    .eq('warehouse_id', payload.warehouseId)
  if (payload.batchId) {
    query = query.eq('batch_id', payload.batchId)
  }
  if (payload.locationId) {
    query = query.eq('location_id', payload.locationId)
  }
  const { data, error } = await query
  if (error) throw error
  const rows = toCamelDeep(data || [])
  const batchMap = await loadRowsByIds('material_batch', rows.map((item: any) => item.batchId))
  const candidates = rows
    .map((item: any) => {
      const batch = batchMap.get(item.batchId)
      const batchStatus = resolveBatchStatus(batch ? { ...batch, remainingQty: item.qty } : null)
      return {
        ...item,
        batch,
        batchStatus,
        availableQty: toNumber(item.qty) - toNumber(item.lockedQty),
      }
    })
    .filter((item: any) => {
      if (item.availableQty <= 0) return false
      return !['DEPLETED', 'EXPIRED', 'LOCKED', 'DISABLED'].includes(normalizeBusinessStatus(item.batchStatus))
    })
    .sort((a: any, b: any) => {
      const byBatch = stockBatchSortValue(a.batch).localeCompare(stockBatchSortValue(b.batch))
      if (byBatch !== 0) return byBatch
      return Number(a.id || 0) - Number(b.id || 0)
    })

  if (payload.batchId) {
    const selected = candidates[0]
    if (!selected || selected.availableQty < payload.qty) throw new Error('所选批次库存不足，无法出库')
    return selected
  }

  const selected = candidates.find((item: any) => item.availableQty >= payload.qty)
  if (selected) return selected
  const totalAvailable = candidates.reduce((sum: number, item: any) => sum + item.availableQty, 0)
  if (totalAvailable >= payload.qty) throw new Error('单批次可用库存不足，请拆分批次出库')
  throw new Error('库存不足，无法出库')
}

async function validateStockTransferMove(data: any, payload: any) {
  if (payload.moveReason !== 'TRANSFER') return null
  buildStockTransferPayload(data || {})
  if (Number(payload.warehouseId) === Number(payload.toWarehouseId)) throw new Error('调入仓库不能与调出仓库相同')

  const [productMap, warehouseMap] = await Promise.all([
    loadRowsByIds('product', [payload.productId], 'id, code, name, status, piece_price'),
    loadRowsByIds('warehouse', [payload.warehouseId, payload.toWarehouseId], 'id, code, name, is_enabled'),
  ])
  const product = productMap.get(Number(payload.productId || 0))
  if (!product) throw new Error('未找到调拨产品档案')
  if (Number(product.status ?? 1) !== 1) throw new Error('调拨产品已停用')

  const fromWarehouse = warehouseMap.get(Number(payload.warehouseId || 0))
  const toWarehouse = warehouseMap.get(Number(payload.toWarehouseId || 0))
  if (!fromWarehouse) throw new Error('未找到调出仓库')
  if (!toWarehouse) throw new Error('未找到调入仓库')
  if (Number(fromWarehouse.isEnabled ?? 1) !== 1) throw new Error('调出仓库已停用')
  if (Number(toWarehouse.isEnabled ?? 1) !== 1) throw new Error('调入仓库已停用')

  const stockRow = await resolveOutboundStockBatch(payload)
  payload.batchId = Number(stockRow.batchId || 0) || null
  payload.locationId = payload.locationId || stockRow.locationId || null
  payload.toBatchId = payload.toBatchId || payload.batchId || null
  payload.relatedOrderType = 'STOCK_TRANSFER'

  const stockCostMap = await loadInboundStockCostMap([{ ...stockRow, productId: payload.productId, warehouseId: payload.warehouseId }])
  const unitCost = toFiniteNumber(payload.unitCost)
    ?? resolveStockUnitCostFromMap(stockCostMap, { ...stockRow, productId: payload.productId, warehouseId: payload.warehouseId }, product)
  payload.unitCost = roundUnitCost(unitCost)
  payload.amount = roundMoney(payload.qty * payload.unitCost)
  return true
}

async function deleteStockTransferCascade(id?: number | null) {
  if (!id) return
  const supabase = getSupabaseClient()
  try {
    await supabase.from('stock_transfer_item').delete().eq('transfer_id', id)
    await supabase.from('stock_transfer').delete().eq('id', id)
  } catch {
    // best effort rollback
  }
}

async function createStockTransferDocument(payload: any) {
  if (payload.moveReason !== 'TRANSFER') return null
  const supabase = getSupabaseClient()
  const transferNo = payload.moveNo || `DB-${Date.now()}`
  const receiveTime = payload.operateTime || new Date().toISOString()
  const { data: transfer, error } = await supabase
    .from('stock_transfer')
    .insert({
      transfer_no: transferNo,
      from_warehouse_id: payload.warehouseId,
      to_warehouse_id: payload.toWarehouseId,
      status: 'RECEIVED',
      operator_id: payload.operatorId || null,
      receive_time: receiveTime,
      remark: payload.remark || null,
    })
    .select('id')
    .single()
  if (error) throw error
  const transferId = Number(transfer?.id || 0)
  if (!transferId) throw new Error('调拨单创建失败')

  const { error: itemError } = await supabase.from('stock_transfer_item').insert({
    transfer_id: transferId,
    product_id: payload.productId,
    from_location_id: payload.locationId || null,
    to_location_id: payload.toLocationId || null,
    from_batch_id: payload.batchId || null,
    qty: payload.qty,
    received_qty: payload.qty,
    remark: payload.remark || null,
  })
  if (itemError) {
    await deleteStockTransferCascade(transferId)
    throw itemError
  }
  payload.relatedOrderId = transferId
  payload.relatedOrderType = 'STOCK_TRANSFER'
  return transferId
}

type ProductionPickingContext = {
  orderId: number
  pickedQty: number
  pickedAmount: number
}

async function validateProductionPicking(data: any, payload: any): Promise<ProductionPickingContext | null> {
  if (payload.moveReason !== 'OUT_PICKING') return null
  if (payload.relatedOrderType !== 'PROD_ORDER' || !payload.relatedOrderId) throw new Error('请选择生产工单')
  const orderId = Number(payload.relatedOrderId)
  const { data: orderRaw, error: orderError } = await getSupabaseClient()
    .from('prod_order')
    .select('id, order_no, product_id, plan_qty, raw_material_qty, status, picked_material_qty, picked_material_amount')
    .eq('id', orderId)
    .maybeSingle()
  if (orderError) throw orderError
  const order = toCamelDeep(orderRaw || {})
  assertProdOrderCanPick(order)

  const productMap = await loadRowsByIds(
    'product',
    [order.productId, payload.productId],
    'id, code, name, type, unit, piece_price, raw_material_id, raw_material_usage, status'
  )
  const finishedProduct = productMap.get(Number(order.productId || 0))
  const materialProduct = productMap.get(Number(payload.productId || 0))
  if (!finishedProduct) throw new Error('生产工单缺少产品档案')
  if (!materialProduct) throw new Error('请选择领用物料')
  if (Number(materialProduct.status ?? 1) !== 1) throw new Error('领用物料已停用')
  const expectedRawMaterialId = Number(finishedProduct.rawMaterialId || 0)
  if (expectedRawMaterialId && Number(payload.productId) !== expectedRawMaterialId) {
    throw new Error('领用物料与产品原料配置不匹配')
  }

  const pickedSummary = await loadPickedMaterialSummary(orderId, payload.productId)
  const plannedQty = plannedMaterialQty(order, finishedProduct)
  if (plannedQty > 0 && pickedSummary.qty + payload.qty > plannedQty) {
    throw new Error('领料数量不能超过工单计划用料')
  }

  const stockRow = await resolveOutboundStockBatch(payload)
  payload.batchId = Number(stockRow.batchId || 0) || null
  payload.locationId = payload.locationId || stockRow.locationId || null
  const unitCost = toFiniteNumber(payload.unitCost) ?? toFiniteNumber(materialProduct.piecePrice) ?? 0
  payload.unitCost = roundUnitCost(unitCost)
  payload.amount = roundMoney(payload.qty * payload.unitCost)
  return {
    orderId,
    pickedQty: pickedSummary.qty + payload.qty,
    pickedAmount: roundMoney(pickedSummary.amount + payload.amount),
  }
}

function isMissingProdOrderPickingColumnError(error: any) {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase()
  return message.includes('picked_material_qty') || message.includes('picked_material_amount')
}

async function applyProductionPicking(context: ProductionPickingContext | null) {
  if (!context) return
  const { error } = await getSupabaseClient()
    .from('prod_order')
    .update({
      picked_material_qty: Number(context.pickedQty.toFixed(2)),
      picked_material_amount: Number(context.pickedAmount.toFixed(2)),
      updated_at: new Date().toISOString(),
    })
    .eq('id', context.orderId)
  if (error && !isMissingProdOrderPickingColumnError(error)) throw error
}

const INBOUND_ORDER_STATUSES = new Set(['RUNNING', 'PAUSED', 'FINISHED'])

function qualifiedProductionQty(order: any) {
  const explicitQty = toNumber(order?.qualifiedQty ?? order?.qualified_qty)
  if (explicitQty > 0) return explicitQty
  return Math.max(toNumber(order?.completedQty ?? order?.completed_qty) - toNumber(order?.badQty ?? order?.bad_qty), 0)
}

async function loadProductionInboundSummary(orderId: number, productId: number) {
  const { data, error } = await getSupabaseClient()
    .from('stock_move')
    .select('qty, amount')
    .eq('related_order_type', 'PROD_ORDER')
    .eq('related_order_id', orderId)
    .eq('move_reason', 'IN_PRODUCE')
    .eq('product_id', productId)
  if (error) throw error
  return (data || []).reduce(
    (summary, row: any) => ({
      qty: summary.qty + toNumber(row.qty),
      amount: summary.amount + toNumber(row.amount),
    }),
    { qty: 0, amount: 0 }
  )
}

async function loadSaleOrderItemProducedQty(saleOrderItemId: number) {
  if (!saleOrderItemId) return 0
  const { data: orders, error: orderError } = await getSupabaseClient()
    .from('prod_order')
    .select('id')
    .eq('sale_order_item_id', saleOrderItemId)
  if (orderError) throw orderError
  const orderIds = (orders || []).map((item: any) => Number(item.id || 0)).filter(Boolean)
  if (!orderIds.length) return 0
  const { data, error } = await getSupabaseClient()
    .from('stock_move')
    .select('qty')
    .eq('related_order_type', 'PROD_ORDER')
    .eq('move_reason', 'IN_PRODUCE')
    .in('related_order_id', orderIds)
  if (error) throw error
  return (data || []).reduce((sum: number, row: any) => sum + toNumber(row.qty), 0)
}

function isMissingProdOrderInboundColumnError(error: any) {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase()
  return message.includes('inbounded_qty') || message.includes('inbounded_amount')
}

type ProductionInboundContext = {
  orderId: number
  productId: number
  saleOrderItemId: number | null
  inboundedQty: number
  inboundedAmount: number
}

async function validateProductionInbound(data: any, payload: any): Promise<ProductionInboundContext | null> {
  if (payload.moveReason !== 'IN_PRODUCE') return null
  if (payload.relatedOrderType !== 'PROD_ORDER' || !payload.relatedOrderId) throw new Error('请选择生产工单')
  const orderId = Number(payload.relatedOrderId)
  const { data: orderRaw, error: orderError } = await getSupabaseClient()
    .from('prod_order')
    .select('id, order_no, sale_order_item_id, product_id, plan_qty, completed_qty, qualified_qty, bad_qty, status, picked_material_qty, picked_material_amount, inbounded_qty, inbounded_amount')
    .eq('id', orderId)
    .maybeSingle()
  if (orderError) throw orderError
  const order = toCamelDeep(orderRaw || {})
  if (!order?.id) throw new Error('未找到生产工单')
  if (!INBOUND_ORDER_STATUSES.has(normalizeBusinessStatus(order.status))) {
    throw new Error('仅生产中、暂停或已完工工单允许成品入库')
  }
  if (Number(payload.productId) !== Number(order.productId)) throw new Error('入库产品与生产工单不匹配')

  const productMap = await loadRowsByIds('product', [order.productId], 'id, name, piece_price, raw_material_usage, status')
  const product = productMap.get(Number(order.productId || 0))
  if (!product) throw new Error('生产工单缺少产品档案')
  if (Number(product.status ?? 1) !== 1) throw new Error('入库产品已停用')

  const inboundSummary = await loadProductionInboundSummary(orderId, payload.productId)
  const qualifiedQty = qualifiedProductionQty(order)
  if (qualifiedQty <= 0) throw new Error('工单暂无合格产量，不能入库')
  if (inboundSummary.qty + payload.qty > qualifiedQty) throw new Error('入库数量不能超过工单可入库数量')

  const rawMaterialUsage = toNumber(product.rawMaterialUsage)
  if (rawMaterialUsage > 0) {
    const requiredMaterialQty = roundMoney((inboundSummary.qty + payload.qty) * rawMaterialUsage)
    if (toNumber(order.pickedMaterialQty) < requiredMaterialQty) {
      throw new Error('工单领料不足，不能入库')
    }
  }

  if (order.saleOrderItemId) {
    const { data: itemRaw, error: itemError } = await getSupabaseClient()
      .from('sale_order_item')
      .select('id, qty')
      .eq('id', order.saleOrderItemId)
      .maybeSingle()
    if (itemError) throw itemError
    const item = toCamelDeep(itemRaw || {})
    if (item?.id) {
      const producedQty = await loadSaleOrderItemProducedQty(Number(order.saleOrderItemId))
      if (producedQty + payload.qty > toNumber(item.qty)) throw new Error('入库数量不能超过销售订单需求数量')
    }
  }

  const unitCost = toFiniteNumber(payload.unitCost)
    ?? (qualifiedQty > 0 && toNumber(order.pickedMaterialAmount) > 0
      ? toNumber(order.pickedMaterialAmount) / qualifiedQty
      : toFiniteNumber(product.piecePrice))
    ?? 0
  payload.unitCost = roundUnitCost(unitCost)
  payload.amount = roundMoney(payload.qty * payload.unitCost)

  return {
    orderId,
    productId: payload.productId,
    saleOrderItemId: Number(order.saleOrderItemId || 0) || null,
    inboundedQty: inboundSummary.qty + payload.qty,
    inboundedAmount: roundMoney(inboundSummary.amount + payload.amount),
  }
}

async function applyProductionInbound(context: ProductionInboundContext | null) {
  if (!context) return
  const supabase = getSupabaseClient()
  if (context.saleOrderItemId) {
    const producedQty = await loadSaleOrderItemProducedQty(context.saleOrderItemId)
    const { error: itemError } = await supabase
      .from('sale_order_item')
      .update({ produced_qty: Number(producedQty.toFixed(2)) })
      .eq('id', context.saleOrderItemId)
    if (itemError) throw itemError
  }

  const { error: orderError } = await supabase
    .from('prod_order')
    .update({
      inbounded_qty: Number(context.inboundedQty.toFixed(2)),
      inbounded_amount: Number(context.inboundedAmount.toFixed(2)),
      updated_at: new Date().toISOString(),
    })
    .eq('id', context.orderId)
  if (orderError && !isMissingProdOrderInboundColumnError(orderError)) throw orderError
}

function stockKeyValue(payload: any, key: 'warehouseId' | 'locationId' | 'batchId', prefix = '') {
  if (!prefix) return payload[key]
  const prefixedKey = `${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`
  return payload[prefixedKey]
}

function applyStockKey(query: any, payload: any, prefix = '') {
  const warehouseId = stockKeyValue(payload, 'warehouseId', prefix)
  const locationId = stockKeyValue(payload, 'locationId', prefix)
  const batchId = stockKeyValue(payload, 'batchId', prefix)
  let nextQuery = query.eq('product_id', payload.productId).eq('warehouse_id', warehouseId)
  nextQuery = locationId ? nextQuery.eq('location_id', locationId) : nextQuery.is('location_id', null)
  nextQuery = batchId ? nextQuery.eq('batch_id', batchId) : nextQuery.is('batch_id', null)
  return nextQuery
}

async function loadStockRow(payload: any, prefix = '') {
  const query = applyStockKey(getSupabaseClient().from('stock').select('*'), payload, prefix)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return toCamelDeep(data || null)
}

async function adjustStock(payload: any, delta: number, prefix = '') {
  const supabase = getSupabaseClient()
  const stock = await loadStockRow(payload, prefix)
  const nextQty = toNumber(stock?.qty) + delta
  if (delta < 0) {
    const availableQty = toNumber(stock?.qty) - toNumber(stock?.lockedQty)
    if (!stock || availableQty < Math.abs(delta)) {
      throw new Error('库存不足，无法出库')
    }
  }
  if (stock) {
    const { error } = await supabase
      .from('stock')
      .update({ qty: nextQty, updated_at: new Date().toISOString() })
      .eq('id', stock.id)
    if (error) throw error
    return
  }
  if (nextQty < 0) throw new Error('库存不足，无法出库')
  const { error } = await supabase.from('stock').insert({
    product_id: payload.productId,
    warehouse_id: stockKeyValue(payload, 'warehouseId', prefix),
    location_id: stockKeyValue(payload, 'locationId', prefix) || null,
    batch_id: stockKeyValue(payload, 'batchId', prefix) || null,
    qty: nextQty,
    locked_qty: 0,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}

async function validateSaleShipment(data: any, payload: any) {
  if (payload.moveReason !== 'OUT_SALE' || payload.relatedOrderType !== 'SALE_ORDER') return null
  if (!payload.relatedOrderId) throw new Error('请选择销售订单')
  const supabase = getSupabaseClient()
  const { data: orderRaw, error: orderError } = await supabase
    .from('sale_order')
    .select('id, order_no, status')
    .eq('id', payload.relatedOrderId)
    .maybeSingle()
  if (orderError) throw orderError
  const order = toCamelDeep(orderRaw || {})
  assertSaleOrderCanShip(order)
  const saleOrderItemId = Number(data?.saleOrderItemId || data?.itemId || 0)
  let query = supabase.from('sale_order_item').select('*')
  if (saleOrderItemId) {
    query = query.eq('id', saleOrderItemId)
  } else {
    query = query.eq('sale_order_id', payload.relatedOrderId).eq('product_id', payload.productId)
  }
  const { data: row, error } = await query.maybeSingle()
  if (error) throw error
  const item = toCamelDeep(row || {})
  if (!item?.id) throw new Error('未找到销售订单明细')
  if (Number(item.saleOrderId) !== Number(payload.relatedOrderId)) throw new Error('销售订单明细与订单不匹配')
  if (Number(item.productId) !== Number(payload.productId)) throw new Error('销售订单明细与产品不匹配')
  const nextDeliveredQty = toNumber(item.deliveredQty) + payload.qty
  if (nextDeliveredQty > toNumber(item.qty)) {
    throw new Error('出库数量不能超过订单可出库数量')
  }

  const productMap = await loadRowsByIds('product', [payload.productId], 'id, code, name, type, status, piece_price')
  const product = productMap.get(Number(payload.productId || 0))
  if (!product) throw new Error('未找到出库产品档案')
  if (Number(product.status ?? 1) !== 1) throw new Error('出库产品已停用')
  if (['RAW', 'MATERIAL'].includes(normalizeBusinessStatus(product.type))) throw new Error('销售出库仅允许成品或商品')

  const warehouseMap = await loadRowsByIds('warehouse', [payload.warehouseId], 'id, type, is_enabled')
  const warehouse = warehouseMap.get(Number(payload.warehouseId || 0))
  if (!warehouse) throw new Error('未找到出库仓库')
  if (Number(warehouse.isEnabled ?? 1) !== 1) throw new Error('出库仓库已停用')
  if (warehouse.type && normalizeBusinessStatus(warehouse.type) !== 'FINISH') throw new Error('销售出库请选择成品仓')

  const stockRow = await resolveOutboundStockBatch(payload)
  payload.batchId = Number(stockRow.batchId || 0) || null
  payload.locationId = payload.locationId || stockRow.locationId || null
  payload.saleOrderItemId = Number(item.id)
  const stockCostMap = await loadInboundStockCostMap([{ ...stockRow, productId: payload.productId, warehouseId: payload.warehouseId }])
  const unitCost = toFiniteNumber(payload.unitCost)
    ?? resolveStockUnitCostFromMap(stockCostMap, { ...stockRow, productId: payload.productId, warehouseId: payload.warehouseId }, product)
  payload.unitCost = roundUnitCost(unitCost)
  payload.amount = roundMoney(payload.qty * payload.unitCost)
  return item
}

async function applySaleShipment(item: any, payload: any) {
  if (!item) return
  const supabase = getSupabaseClient()
  const previousDeliveredQty = toNumber(item.deliveredQty)
  const nextDeliveredQty = previousDeliveredQty + payload.qty
  const { data: orderRaw, error: orderFetchError } = await supabase
    .from('sale_order')
    .select('id, status')
    .eq('id', item.saleOrderId)
    .maybeSingle()
  if (orderFetchError) throw orderFetchError
  const previousOrder = toCamelDeep(orderRaw || {})
  if (!previousOrder?.id) throw new Error('未找到销售订单')
  const restoreSaleShipment = async () => {
    try {
      await supabase.from('sale_order_item').update({ delivered_qty: previousDeliveredQty }).eq('id', item.id)
      await supabase.from('sale_order').update({ status: previousOrder.status }).eq('id', item.saleOrderId)
    } catch {
      // best effort rollback; surface the original shipment failure
    }
  }

  try {
    const { error: itemError } = await supabase
      .from('sale_order_item')
      .update({ delivered_qty: nextDeliveredQty })
      .eq('id', item.id)
    if (itemError) throw itemError

    const { data: rows, error: listError } = await supabase
      .from('sale_order_item')
      .select('qty, delivered_qty')
      .eq('sale_order_id', item.saleOrderId)
    if (listError) throw listError

    const allShipped = (rows || []).every((row: any) => toNumber(row.delivered_qty) >= toNumber(row.qty))
    const nextStatus = allShipped ? 'SHIPPED' : 'PARTIAL'
    const { error: orderError } = await supabase.from('sale_order').update({ status: nextStatus }).eq('id', item.saleOrderId)
    if (orderError) throw orderError
  } catch (error) {
    await restoreSaleShipment()
    throw error
  }
}

function isMissingStockMoveCostColumnError(error: any) {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase()
  return (
    message.includes('unit_cost') ||
    message.includes('amount') ||
    message.includes('sale_order_item_id') ||
    message.includes('delivery_order_id') ||
    message.includes('delivery_order_item_id') ||
    (message.includes('stock_move') && message.includes('schema cache')) ||
    (message.includes('stock_move') && message.includes('column'))
  )
}

async function insertStockMove(payload: any) {
  const supabase = getSupabaseClient()
  const insertPayload = async (record: any) => supabase.from('stock_move').insert(toSnakePayload(record)).select().single()
  let { data, error } = await insertPayload(payload)
  if (error && isMissingStockMoveCostColumnError(error)) {
    const legacyPayload = { ...payload }
    delete legacyPayload.unitCost
    delete legacyPayload.amount
    delete legacyPayload.saleOrderItemId
    delete legacyPayload.deliveryOrderId
    delete legacyPayload.deliveryOrderItemId
    ;({ data, error } = await insertPayload(legacyPayload))
  }
  if (error) throw error
  return data
}

type PurchaseCostSnapshot = {
  productId: number
  previousPiecePrice: number | null
}

async function applyPurchaseCost(payload: any): Promise<PurchaseCostSnapshot | null> {
  if (payload.moveReason !== 'IN_PURCHASE' || !payload.unitCost || payload.unitCost <= 0) return null
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.from('product').select('id, piece_price').eq('id', payload.productId).maybeSingle()
  if (error) throw error
  if (!data?.id) throw new Error('未找到入库物料档案')
  const previousPiecePrice = data.piece_price === null || data.piece_price === undefined ? null : Number(data.piece_price)
  const { error: updateError } = await supabase
    .from('product')
    .update({ piece_price: payload.unitCost })
    .eq('id', payload.productId)
  if (updateError) throw updateError
  return {
    productId: payload.productId,
    previousPiecePrice,
  }
}

async function restorePurchaseCost(snapshot: PurchaseCostSnapshot | null) {
  if (!snapshot) return
  try {
    await getSupabaseClient()
      .from('product')
      .update({ piece_price: snapshot.previousPiecePrice })
      .eq('id', snapshot.productId)
  } catch {
    // best effort rollback
  }
}

async function createStockMove(url: string, data: any) {
  const payload = normalizeStockMovePayload(url, data)
  validatePurchaseStockMove(data, payload)
  await validatePurchaseSupplier(data, payload)
  const productionPickingContext = await validateProductionPicking(data, payload)
  const productionInboundContext = await validateProductionInbound(data, payload)
  await validateStockTransferMove(data, payload)
  const applied: Array<{ delta: number; prefix?: string }> = []
  const saleShipmentItem = await validateSaleShipment(data, payload)
  let createdMoveId: number | undefined
  let createdDeliveryId: number | null = null
  let createdBatchId: number | null = null
  let createdTransferId: number | null = null
  let purchaseCostSnapshot: PurchaseCostSnapshot | null = null
  try {
    createdBatchId = await ensurePurchaseBatch(data, payload)
    createdTransferId = await createStockTransferDocument(payload)
    if (payload.moveType === 'IN') {
      await adjustStock(payload, payload.qty)
      applied.push({ delta: payload.qty })
    } else if (payload.moveType === 'OUT') {
      await adjustStock(payload, -payload.qty)
      applied.push({ delta: -payload.qty })
    } else {
      await adjustStock(payload, -payload.qty)
      applied.push({ delta: -payload.qty })
      await adjustStock(payload, payload.qty, 'to')
      applied.push({ delta: payload.qty, prefix: 'to' })
    }
    const created = await insertStockMove(payload)
    createdMoveId = Number(created?.id || 0) || undefined
    purchaseCostSnapshot = await applyPurchaseCost(payload)
    createdDeliveryId = await createDeliveryForSaleShipment(saleShipmentItem, payload, createdMoveId)
    await applySaleShipment(saleShipmentItem, payload)
    await applyProductionPicking(productionPickingContext)
    await applyProductionInbound(productionInboundContext)
    return ok(toCamelDeep(created), 'created')
  } catch (error) {
    await deleteDeliveryCascade(createdDeliveryId)
    await deleteStockTransferCascade(createdTransferId)
    await restorePurchaseCost(purchaseCostSnapshot)
    if (createdMoveId) {
      try {
        await getSupabaseClient().from('stock_move').delete().eq('id', createdMoveId)
      } catch {
        // best effort rollback
      }
    }
    for (const item of applied.reverse()) {
      try {
        await adjustStock(payload, -item.delta, item.prefix || '')
      } catch {
        // best effort rollback
      }
    }
    if (createdBatchId) {
      try {
        await getSupabaseClient().from('material_batch').delete().eq('id', createdBatchId)
      } catch {
        // best effort rollback
      }
    }
    throw error
  }
}

async function get(url: string, config?: RequestConfig) {
  const { path, route, id, action } = parseRoute(url)
  if (path === 'auth/userinfo' || path === 'auth/user-info') return currentUser()
  if (path === 'dashboard' || path === 'dashboard/home') return dashboardHome()
  if (path === 'dashboard/boss') return bossDashboard(config?.params)
  if (path === 'dashboard/production') return productionBoard(config?.params)
  if (path === 'dashboard/quality') return qualityBoard(config?.params)
  if (path === 'warnings') return warningList()
  if (path === 'warnings/summary') return warningSummary()
  if (path === 'reports/oee') return oeeStats()
  if (path === 'finance/statements') return financeStatements(config?.params)
  if (path === 'finance/receivables') return financeReceivables(config?.params)
  if (path === 'notifications/unread-count') return unreadCount()
  if (path === 'system/config') return configObject()
  if (route?.table === 'machine' && id && action === 'qrcode') return getMachineQrCodeData(id)
  if (route?.table === 'mold' && id && action === 'shots') return getMoldShotsStatsData(id)
  if (path === 'salary/daily') return buildDailySalaryRows(config?.params)
  if (path === 'salary/monthly') return buildMonthlySalaryRows(config?.params)
  if (path === 'salary/prices') return listSalaryPriceRows(config?.params)
  if (route?.table === 'salary_adjust') return listSalaryAdjustRows(config?.params)
  if (path === 'stock') return buildStockRows(config?.params)
  if (path === 'stock/ledger') return buildStockLedgerRows(config?.params)
  if (path === 'stock-inventories') return buildStockInventoryRows(config?.params)
  if (route?.table === 'sale_order' && id) return getSaleOrderDoc(id)
  if (route?.table === 'sale_order') return buildSaleOrderRows(config?.params)
  if (route?.table === 'payment_record') return buildPaymentRows(config?.params)
  if (route?.table === 'delivery_order') return buildDeliveryRows(config?.params)
  if (route?.table === 'expense_record') return buildExpenseRows(config?.params)
  if (path === 'qc-records/pending-orders') return listTable(resolveResourceRoute('/prod-orders')!, { status: 'SCHEDULED', page: 1, size: 100 })
  if (path === 'prod-reports/current-shift-tasks' || path === 'prod-reports/work-orders') {
    return listTable(resolveResourceRoute('/prod-orders')!, { page: 1, size: 100, ...config?.params })
  }
  if (path === 'prod-reports') return buildProdReportRows(config?.params)
  if (path === 'prod-reports/my-output-stats') return ok({ totalQty: 0, totalBadQty: 0, totalShots: 0 })
  if (path === 'stock/warnings') return stockWarningList()
  if (!route) throw new Error(`未配置 Supabase 路由：/${path}`)
  if (id) return getTableDetail(route, id)
  return listTable(route, config?.params)
}

async function post(url: string, data?: any, config?: RequestConfig) {
  const { path, route, id, action } = parseRoute(url)
  if (path === 'auth/login') return login(data)
  if (path === 'auth/logout') {
    await getSupabaseClient().auth.signOut()
    return ok(true)
  }
  if (path === 'auth/refresh') return currentUser()
  if (path === 'auth/change-password') {
    const { error } = await getSupabaseClient().auth.updateUser({ password: data?.newPassword })
    if (error) throw error
    return ok(true)
  }
  if (route?.table === 'mold' && id && action === 'maintenance') return maintainMoldData(id)
  if (path === 'qc-records/upload') return uploadFormData(data, 'qc')
  if (path.startsWith('import/')) return uploadFormData(data, `imports/${path.split('/')[1]}`)
  if (path.startsWith('integrations/')) return handleIntegrationPost(path, data)
  if (path === 'prod-reports') return submitProdReport(data)
  if (path === 'qc-records') return submitQcRecord(data)
  if (path === 'salary/monthly/settle') return settleMonthlySalary(data || {})
  if (path.startsWith('stock/') && path !== 'stock') {
    return createStockMove(path, data)
  }
  if (path === 'stock-inventories') {
    return createStockInventoryDoc(data)
  }
  if (path === 'stock-inventories/mobile-check') {
    return ok(true)
  }
  if (!route) throw new Error(`未配置 Supabase 路由：/${path}`)
  if (route.table === 'sale_order') return createSaleOrderDoc(data || {})
  if (route.table === 'payment_record') return createPaymentRecord(data || {})
  if (route.table === 'delivery_order') throw new Error('请通过销售出库创建发货单')
  if (route.table === 'expense_record') return createExpenseRecord(data || {})
  if (route.table === 'salary_adjust') return saveSalaryAdjustRecord(undefined, data || {})
  if (route.table === 'piece_price') return saveSalaryPriceRecord(undefined, data || {})
  if (id && action) return actionUpdate(route, id, action)
  return insertTable(route, data || config?.params || {})
}

async function put(url: string, data?: any) {
  const { path, route, id, action } = parseRoute(url)
  if (path === 'system/config') return updateConfig(data || {})
  if (route?.table === 'sys_user' && id && action === 'reset-password') return resetUserPassword(id, String(data?.newPassword || ''))
  if (path === 'salary/monthly/settle') return settleMonthlySalary(data || {})
  if (path === 'stock-inventories' && id && action === 'start') return startInventoryCount(id)
  if (path === 'stock-inventories' && id && action === 'count') return updateInventoryCount(id, data)
  if (path === 'stock-inventories' && id && action === 'submit') return submitInventoryReview(id)
  if (path === 'stock-inventories' && id && action === 'approve') return approveInventoryDoc(id)
  if (path === 'stock-inventories' && id && action === 'reject') return rejectInventoryDoc(id)
  if (!route || !id) throw new Error(`未配置 Supabase 路由：/${path}`)
  if (route.table === 'sale_order' && !action) return updateSaleOrderDoc(id, data || {})
  if (route.table === 'prod_report' && !action) return updateProdReportRecord(id, data || {})
  if (route.table === 'payment_record' && !action) return updatePaymentRecord(id, data || {})
  if (route.table === 'delivery_order' && !action) return updateDeliveryDoc(id, data || {})
  if (route.table === 'expense_record' && !action) return updateExpenseRecord(id, data || {})
  if (route.table === 'salary_adjust' && !action) return saveSalaryAdjustRecord(id, data || {})
  if (route.table === 'piece_price' && !action) return saveSalaryPriceRecord(id, data || {})
  if (action) return actionUpdate(route, id, action)
  return updateTable(route, id, data || {})
}

async function remove(url: string) {
  const { path, route, id } = parseRoute(url)
  if (!route || !id) throw new Error(`未配置 Supabase 路由：/${path}`)
  if (route.table === 'sale_order') return deleteSaleOrderDoc(id)
  if (route.table === 'prod_report') return deleteProdReportRecord(id)
  if (route.table === 'payment_record') return deletePaymentRecord(id)
  if (route.table === 'delivery_order') return deleteDeliveryDoc(id)
  if (route.table === 'salary_adjust') return deleteSalaryAdjustRecord(id)
  if (route.table === 'piece_price') return deleteSalaryPriceRecord(id)
  return deleteTable(route, id)
}

function normalizeError(error: any) {
  return error?.message || error?.error_description || 'Supabase 请求失败'
}

export function createSupabaseRequest(hooks: RequestHooks = {}) {
  async function wrap<T>(runner: () => Promise<ApiResponse<T>>) {
    try {
      return await runner()
    } catch (error: any) {
      const message = normalizeError(error)
      if (message.includes('JWT') || message.includes('Auth')) {
        hooks.onUnauthorized?.()
      }
      hooks.onError?.(message)
      throw error
    }
  }

  return {
    get: <T = any>(url: string, config?: RequestConfig) => wrap<T>(() => get(url, config) as Promise<ApiResponse<T>>),
    post: <T = any>(url: string, data?: any, config?: RequestConfig) =>
      wrap<T>(() => post(url, data, config) as Promise<ApiResponse<T>>),
    put: <T = any>(url: string, data?: any, config?: RequestConfig) =>
      wrap<T>(() => put(url, data) as Promise<ApiResponse<T>>),
    delete: <T = any>(url: string) => wrap<T>(() => remove(url) as Promise<ApiResponse<T>>),
  }
}
