import { getSupabaseClient, supabaseAuthEmailDomain, supabaseStorageBucket } from './supabaseClient.ts'
import {
  assertMobileReportPiecePrice,
  chooseMobileReportPiecePrice,
  normalizeMobileReportProcessName,
  validateMobileReportProcessName,
} from '../utils/production-report.ts'
import { buildBusinessWarnings, summarizeBusinessWarnings } from '../utils/business-warning.ts'
import {
  getStockTransferStatusText,
  getTransferReceivedQty,
  getTransferRemainingQty,
  getTransferTotalQty,
  validateStockTransferReceive,
} from '../utils/stock-transfer.ts'
import { normalizeQcImageUrls, normalizeQcResult, validateMobileQcRecordInput } from '../utils/qc-record.ts'
import { getStockAvailableQty, getStockRisk, stockSearchText } from '../utils/stock-query.ts'
import {
  buildMobileInventoryCheckPayload,
  getInventoryBookQty,
  getInventoryDiffQty,
  getInventoryProductId,
  validateMobileInventoryCheckInput,
} from '../utils/inventory-check.ts'

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
  { resource: 'suppliers', table: 'supplier', searchColumns: ['code', 'name', 'contact', 'phone'] },
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
  prod_order: ['id', 'order_no', 'sale_order_id', 'sale_order_item_id', 'product_id', 'machine_id', 'mold_id', 'plan_qty', 'completed_qty', 'qualified_qty', 'bad_qty', 'raw_material_qty', 'plan_start', 'plan_end', 'actual_start', 'actual_end', 'status', 'priority', 'remark', 'created_by', 'created_at', 'updated_at'],
  prod_report: ['id', 'prod_order_id', 'user_id', 'machine_id', 'mold_id', 'report_type', 'process_name', 'shift', 'qty', 'bad_qty', 'shots', 'start_time', 'end_time', 'work_minutes', 'sync_status', 'created_at'],
  product: ['id', 'code', 'name', 'spec', 'type', 'unit', 'piece_price', 'cavity_yield', 'cycle_time_sec', 'safe_stock', 'weight_g', 'raw_material_id', 'raw_material_usage', 'color', 'customer_id', 'image_url', 'status', 'created_at'],
  qc_record: ['id', 'prod_order_id', 'product_id', 'check_type', 'check_result', 'defect_type', 'defect_desc', 'defect_qty', 'sample_qty', 'checker_id', 'check_time', 'image_urls', 'remark', 'created_at'],
  salary_adjust: ['id', 'user_id', 'adjust_type', 'amount', 'adjust_date', 'reason', 'created_by', 'created_at'],
  salary_daily: ['id', 'user_id', 'work_date', 'total_qualified_qty', 'total_piece_amount', 'subsidy', 'deduction', 'total_amount', 'status', 'confirmed_by', 'confirmed_at', 'created_at'],
  sale_order: ['id', 'order_no', 'customer_id', 'order_date', 'delivery_date', 'total_amount', 'received_amount', 'status', 'sales_user_id', 'remark', 'created_by', 'created_at', 'updated_at'],
  stock: ['id', 'product_id', 'warehouse_id', 'location_id', 'batch_id', 'qty', 'locked_qty', 'updated_at'],
  stock_inventory: ['id', 'inventory_no', 'warehouse_id', 'inventory_type', 'status', 'freeze_stock', 'operator_id', 'approver_id', 'remark', 'created_at'],
  stock_inventory_item: ['id', 'inventory_id', 'product_id', 'location_id', 'batch_id', 'book_qty', 'actual_qty', 'diff_qty', 'diff_amount', 'reason'],
  stock_move: ['id', 'move_no', 'product_id', 'warehouse_id', 'location_id', 'batch_id', 'to_warehouse_id', 'to_location_id', 'to_batch_id', 'move_type', 'move_reason', 'qty', 'related_order_id', 'related_order_type', 'operator_id', 'operate_time', 'remark', 'created_at'],
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

function getStoredToken() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem('token') || ''
}

function getCurrentUserId() {
  return getStoredUserContext().userId
}

function toNumber(value: any) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
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
  return chooseMobileReportPiecePrice(rows, productId, processName, date)
}

function normalizeBusinessStatus(value?: string | null) {
  return String(value || '').toUpperCase()
}

async function assertDailySalaryEditable(userId: number, workDate: string) {
  if (!userId || !workDate) throw new Error('报工人员或归属日期无效')
  const { data, error } = await getSupabaseClient()
    .from('salary_daily')
    .select('id, status')
    .eq('user_id', userId)
    .eq('work_date', workDate)
    .maybeSingle()
  if (error) throw error
  if (String(data?.status || '').toUpperCase() === 'SETTLED') {
    throw new Error(`${workDate} 日工资已结算，不能新增报工`)
  }
  return data
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

async function upsertDailySalarySummary(userId: number, workDate: string, goodQty: number, pieceAmount: number) {
  const supabase = getSupabaseClient()
  const { data: existing, error: fetchError } = await supabase
    .from('salary_daily')
    .select('*')
    .eq('user_id', userId)
    .eq('work_date', workDate)
    .maybeSingle()
  if (fetchError) throw fetchError
  const nextTotalPieceAmount = toNumber(existing?.total_piece_amount) + pieceAmount
  const nextTotalAmount = toNumber(existing?.total_amount) + pieceAmount
  const nextQualifiedQty = toNumber(existing?.total_qualified_qty) + goodQty
  const payload = {
    user_id: userId,
    work_date: workDate,
    total_qualified_qty: nextQualifiedQty,
    total_piece_amount: nextTotalPieceAmount,
    subsidy: toNumber(existing?.subsidy),
    deduction: toNumber(existing?.deduction),
    total_amount: nextTotalAmount,
    status: existing?.status || 'DRAFT',
    confirmed_by: existing?.confirmed_by || null,
    confirmed_at: existing?.confirmed_at || null,
  }
  if (existing?.id) {
    const { error } = await supabase.from('salary_daily').update(payload).eq('id', existing.id)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('salary_daily').insert(payload)
  if (error) throw error
}

async function buildMobileWorkOrderRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  let query = supabase.from('prod_order').select('*', { count: 'exact' })
  const keyword = String(params?.keyword || '').trim()
  if (params?.status) {
    query = query.eq('status', params.status)
  }
  if (params?.machineCode) {
    const machineRows = await loadRowsByColumn('machine', 'code', [params.machineCode])
    const machineIds = machineRows.map((item: any) => item.id).filter(Boolean)
    if (!machineIds.length) {
      return ok({ records: [], list: [], total: 0 })
    }
    query = query.in('machine_id', machineIds)
  }
  query = query.order('created_at', { ascending: false }).range(from, to)
  if (keyword) {
    query = query.or(`order_no.ilike.%${keyword}%,remark.ilike.%${keyword}%`)
  }

  const { data, error, count } = await query
  if (error) throw error
  const orders = toCamelDeep(data || [])
  const productMap = await loadRowsByIds('product', orders.map((item: any) => item.productId))
  const machineMap = await loadRowsByIds('machine', orders.map((item: any) => item.machineId))
  const moldMap = await loadRowsByIds('mold', orders.map((item: any) => item.moldId))
  const saleOrderMap = await loadRowsByIds('sale_order', orders.map((item: any) => item.saleOrderId))
  const customerMap = await loadRowsByIds(
    'customer',
    Array.from(saleOrderMap.values()).map((item: any) => item.customerId)
  )
  const records = orders.map((item: any) => {
    const product = productMap.get(item.productId)
    const machine = machineMap.get(item.machineId)
    const mold = moldMap.get(item.moldId)
    const saleOrder = saleOrderMap.get(item.saleOrderId)
    const customer = saleOrder ? customerMap.get(saleOrder.customerId) : undefined
    return {
      workOrderId: item.id,
      workOrderNo: item.orderNo,
      saleOrderId: item.saleOrderId,
      saleOrderNo: saleOrder?.orderNo || '-',
      customerId: saleOrder?.customerId,
      customerName: customer?.name || '-',
      productId: item.productId,
      productName: product?.name || '-',
      machineId: item.machineId,
      machineCode: machine?.code || '-',
      machineName: machine?.name || '-',
      moldId: item.moldId,
      moldName: mold?.name || '-',
      quantity: toNumber(item.planQty),
      completedQty: toNumber(item.completedQty),
      status: item.status,
      planDate: (item.planStart || item.planEnd || item.createdAt || '').slice(0, 10),
      remark: item.remark || '',
    }
  })
  return ok({ records, list: records, total: count || records.length })
}

async function buildMobileProdReportRows(params?: Record<string, any>, onlyMine = false) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  const currentUserId = getCurrentUserId()
  let query = supabase.from('prod_report').select('*', { count: 'exact' })
  if (onlyMine && currentUserId) {
    query = query.eq('user_id', currentUserId)
  }
  if (params?.startDate) {
    query = query.gte('start_time', `${params.startDate} 00:00:00`)
  }
  if (params?.endDate) {
    query = query.lte('start_time', `${params.endDate} 23:59:59`)
  }
  if (params?.type === 'day') {
    const day = params.date || dayBounds().day
    const bounds = dayBounds(day)
    query = query.gte('start_time', bounds.startTime).lte('start_time', bounds.endTime)
  }
  if (params?.type === 'month') {
    const now = new Date()
    const year = Number(params.year || now.getFullYear())
    const month = Number(params.month || now.getMonth() + 1)
    const bounds = monthBounds(year, month)
    query = query.gte('start_time', `${bounds.startDate} 00:00:00`).lte('start_time', `${bounds.endDate} 23:59:59`)
  }
  query = query.order('start_time', { ascending: false }).range(from, to)
  const { data, error, count } = await query
  if (error) throw error
  const reports = toCamelDeep(data || [])
  const orderMap = await loadRowsByIds('prod_order', reports.map((item: any) => item.prodOrderId))
  const productMap = await loadRowsByIds(
    'product',
    Array.from(orderMap.values()).map((item: any) => item.productId)
  )
  const machineMap = await loadRowsByIds('machine', reports.map((item: any) => item.machineId))
  const userMap = await loadRowsByIds('sys_user', reports.map((item: any) => item.userId))
  const priceRows = await loadRowsByColumn(
    'piece_price',
    'product_id',
    Array.from(orderMap.values()).map((item: any) => item.productId)
  )
  const records = reports.map((item: any) => {
    const order = orderMap.get(item.prodOrderId)
    const product = order ? productMap.get(order.productId) : undefined
    const machine = machineMap.get(item.machineId)
    const user = userMap.get(item.userId)
    const reportTime = item.startTime || item.createdAt || ''
    const price = choosePiecePrice(priceRows, order?.productId, item.processName, reportTime)
    const unitPrice = toNumber(price?.price)
    const quantity = toNumber(item.qty)
    const defectCount = toNumber(item.badQty)
    const goodQty = Math.max(quantity - defectCount, 0)
    return {
      id: item.id,
      workOrderId: item.prodOrderId,
      workOrderNo: order?.orderNo || item.prodOrderId,
      productId: order?.productId,
      productName: product?.name || '-',
      machineId: item.machineId,
      machineCode: machine?.code || '-',
      shift: item.shift || '-',
      quantity,
      defectCount,
      moldCount: toNumber(item.shots),
      createdAt: reportTime,
      reportTime,
      reporterName: user?.realName || user?.username || '-',
      processName: item.processName || price?.processName || '注塑',
      unitPrice,
      amount: Number((goodQty * unitPrice).toFixed(2)),
    }
  })
  return ok({ records, list: records, total: count || records.length })
}

async function buildMobileOutputStats(params?: Record<string, any>) {
  const currentUserId = getCurrentUserId()
  const now = new Date()
  const type = params?.type || 'day'
  const supabase = getSupabaseClient()
  let query = supabase.from('prod_report').select('qty, bad_qty, start_time, user_id')
  if (currentUserId) {
    query = query.eq('user_id', currentUserId)
  }
  if (type === 'month') {
    const bounds = monthBounds(Number(now.getFullYear()), Number(now.getMonth() + 1))
    query = query.gte('start_time', `${bounds.startDate} 00:00:00`).lte('start_time', `${bounds.endDate} 23:59:59`)
  } else {
    const bounds = dayBounds(params?.date || undefined)
    query = query.gte('start_time', bounds.startTime).lte('start_time', bounds.endTime)
  }
  const { data, error } = await query
  if (error) throw error
  const rows = toCamelDeep(data || [])
  const totalQuantity = rows.reduce((sum: number, item: any) => sum + toNumber(item.qty), 0)
  const totalDefect = rows.reduce((sum: number, item: any) => sum + toNumber(item.badQty), 0)
  return ok({
    totalQuantity,
    totalDefect,
    reportCount: rows.length,
  })
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
  const reportTime = data?.startTime || new Date().toISOString()
  const workDate = formatLocalDate(new Date(reportTime))
  const productId = Number(order.productId || data?.productId || 0)
  const processName = normalizeMobileReportProcessName(data?.processName || data?.process_name)
  const processError = validateMobileReportProcessName(processName)
  if (processError) throw new Error(processError)
  if (!order?.id) throw new Error('未找到生产工单')
  if (!['SCHEDULED', 'RUNNING', 'PAUSED'].includes(normalizeBusinessStatus(order.status))) {
    throw new Error('仅已派工、生产中或暂停工单允许报工')
  }
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error('产量必须是非负整数')
  if (!Number.isInteger(badQty) || badQty < 0) throw new Error('不良数量必须是非负整数')
  if (badQty > quantity) throw new Error('不良数量不能超过产量')
  if (!Number.isInteger(shots) || shots < 0) throw new Error('模次必须是非负整数')
  if (!Number(data?.machineId || order.machineId || 0)) throw new Error('请选择机台')
  await assertDailySalaryEditable(currentUserId, workDate)
  const piecePrices = await loadRowsByColumn('piece_price', 'product_id', [productId])
  const goodQty = Math.max(quantity - badQty, 0)
  const price = choosePiecePrice(piecePrices, productId, processName, reportTime)
  assertMobileReportPiecePrice(price, goodQty, order.productName || order.orderNo || '', processName, workDate)
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
  const nextStatus = nextCompletedQty >= toNumber(order.planQty) ? 'FINISHED' : 'RUNNING'
  const { error: orderUpdateError } = await supabase
    .from('prod_order')
    .update({
      completed_qty: nextCompletedQty,
      qualified_qty: nextQualifiedQty,
      bad_qty: nextBadQty,
      status: nextStatus,
      actual_start: order.actualStart || reportTime,
      actual_end: nextStatus === 'FINISHED' ? reportTime : order.actualEnd || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', prodOrderId)
  if (orderUpdateError) throw orderUpdateError

  await upsertDailySalarySummary(currentUserId, workDate, goodQty, totalAmount)
  return ok(toCamelDeep(created), 'created')
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
  const checkType = data?.checkType || data?.inspectionType || 'IPQC'
  const checkResult = normalizeQcResult(data?.checkResult || data?.result || 'PASS')
  const defectType = data?.defectType || ''
  const defectDesc = data?.defectDesc || ''
  const sampleQty = toNumber(data?.sampleQty || data?.sampleCount || 0)
  const imageUrls = normalizeQcImageUrls(data?.imageUrls ?? data?.images)
  const validationMessage = validateMobileQcRecordInput({
    workOrderId: prodOrderId,
    productId,
    inspectionType: checkType,
    result: checkResult,
    defectType,
    defectDesc,
    sampleCount: sampleQty,
    images: imageUrls,
  })
  if (validationMessage) throw new Error(validationMessage)
  const payload = {
    prod_order_id: prodOrderId,
    product_id: productId,
    check_type: checkType,
    check_result: checkResult,
    defect_type: defectType,
    defect_desc: defectDesc,
    defect_qty: toNumber(data?.defectQty || 0),
    sample_qty: sampleQty,
    checker_id: checkerId,
    check_time: data?.checkTime || new Date().toISOString(),
    image_urls: imageUrls.join(','),
    remark: data?.remark || '',
  }
  const { data: created, error } = await supabase.from('qc_record').insert(payload).select().single()
  if (error) throw error
  return ok(toCamelDeep(created), 'created')
}

async function buildMobileSalarySummary(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const currentUserId = Number(params?.userId || getCurrentUserId() || 0)
  if (!currentUserId) {
    return ok({ year: params?.year || new Date().getFullYear(), month: params?.month || new Date().getMonth() + 1, baseSalary: 0, pieceAmount: 0, overtimeAmount: 0, deduction: 0, totalAmount: 0 })
  }
  const now = new Date()
  const year = Number(params?.year || now.getFullYear())
  const month = Number(params?.month || now.getMonth() + 1)
  const bounds = monthBounds(year, month)
  const [salaryRowsRes, adjustRowsRes] = await Promise.all([
    supabase.from('salary_daily').select('total_piece_amount, subsidy, deduction, total_amount').eq('user_id', currentUserId).gte('work_date', bounds.startDate).lte('work_date', bounds.endDate),
    supabase.from('salary_adjust').select('adjust_type, amount').eq('user_id', currentUserId).gte('adjust_date', bounds.startDate).lte('adjust_date', bounds.endDate),
  ])
  if (salaryRowsRes.error) throw salaryRowsRes.error
  if (adjustRowsRes.error) throw adjustRowsRes.error
  const salaryRows = toCamelDeep(salaryRowsRes.data || [])
  const adjustRows = toCamelDeep(adjustRowsRes.data || [])
  const bonusAmount = adjustRows
    .filter((row: any) => String(row.adjustType || row.adjust_type || '').toLowerCase() === 'bonus')
    .reduce((sum: number, row: any) => sum + toNumber(row.amount), 0)
  const penaltyAmount = adjustRows
    .filter((row: any) => String(row.adjustType || row.adjust_type || '').toLowerCase() === 'penalty')
    .reduce((sum: number, row: any) => sum + toNumber(row.amount), 0)
  const pieceAmount = salaryRows.reduce((sum: number, row: any) => sum + toNumber(row.totalPieceAmount), 0)
  const overtimeAmount = salaryRows.reduce((sum: number, row: any) => sum + toNumber(row.subsidy), 0)
  const deduction = salaryRows.reduce((sum: number, row: any) => sum + toNumber(row.deduction), 0) + penaltyAmount
  const totalAmount = salaryRows.reduce((sum: number, row: any) => sum + toNumber(row.totalAmount), 0) + bonusAmount - penaltyAmount
  return ok({
    year,
    month,
    baseSalary: 0,
    pieceAmount,
    overtimeAmount,
    deduction,
    totalAmount,
  })
}

async function buildMobileDailySalaryDetails(params: { year?: number; month?: number; userId?: number } = {}) {
  const currentUserId = Number(params?.userId || getCurrentUserId() || 0)
  if (!currentUserId) return ok([])
  const bounds = monthBounds(Number(params?.year || new Date().getFullYear()), Number(params?.month || new Date().getMonth() + 1))
  const { data, error } = await getSupabaseClient()
    .from('prod_report')
    .select('*')
    .eq('user_id', currentUserId)
    .gte('start_time', `${bounds.startDate} 00:00:00`)
    .lte('start_time', `${bounds.endDate} 23:59:59`)
    .order('start_time', { ascending: false })
  if (error) throw error
  const reports = toCamelDeep(data || [])
  const orderMap = await loadRowsByIds('prod_order', reports.map((item: any) => item.prodOrderId))
  const productMap = await loadRowsByIds(
    'product',
    Array.from(orderMap.values()).map((item: any) => item.productId)
  )
  const piecePriceRows = await loadRowsByColumn(
    'piece_price',
    'product_id',
    Array.from(orderMap.values()).map((item: any) => item.productId)
  )
  const records = reports.map((item: any) => {
    const order = orderMap.get(item.prodOrderId)
    const product = order ? productMap.get(order.productId) : undefined
    const reportTime = item.startTime || item.createdAt || ''
    const price = choosePiecePrice(piecePriceRows, order?.productId, item.processName, reportTime)
    const unitPrice = toNumber(price?.price)
    const goodQty = Math.max(toNumber(item.qty) - toNumber(item.badQty), 0)
    return {
      date: reportTime.slice(0, 10),
      workHours: Number(((toNumber(item.workMinutes) || 0) / 60).toFixed(2)),
      pieceCount: goodQty,
      pieceAmount: Number((goodQty * unitPrice).toFixed(2)),
      overtimeHours: 0,
      overtimeAmount: 0,
      dailyTotal: Number((goodQty * unitPrice).toFixed(2)),
      productName: product?.name || '-',
      processName: item.processName || price?.processName || '注塑',
      workOrderNo: order?.orderNo || '-',
    }
  })
  return ok(records)
}

async function submitInventoryCheck(data: any) {
  const supabase = getSupabaseClient()
  const currentUserId = Number(getCurrentUserId() || 0)
  const inputValidation = validateMobileInventoryCheckInput(data)
  if (inputValidation) throw new Error(inputValidation)

  const { data: stockRowsRaw, error: stockError } = await supabase
    .from('stock')
    .select('*')
    .eq('warehouse_id', Number(data?.warehouseId || 0))
    .eq('location_id', Number(data?.locationId || 0))
    .eq('product_id', Number(data?.productId || 0))
    .limit(2)
  if (stockError) throw stockError
  const stockRows = toCamelDeep(stockRowsRaw || [])
  if (!stockRows.length) throw new Error('未查询到账面库存，不能提交盘点')
  if (stockRows.length > 1) throw new Error('当前产品库位存在多个批次，请在管理端按批次盘点')
  const stock = stockRows[0]
  const normalizedPayload = buildMobileInventoryCheckPayload(data, stock)
  const inventoryPayload = {
    inventory_no: `MC-${Date.now()}`,
    warehouse_id: normalizedPayload.warehouseId,
    inventory_type: 'MOBILE_CHECK',
    status: 'PENDING_APPROVE',
    freeze_stock: 1,
    operator_id: currentUserId || null,
    remark: normalizedPayload.reason || '',
  }
  const { data: inventoryRow, error: inventoryError } = await supabase.from('stock_inventory').insert(inventoryPayload).select().single()
  if (inventoryError) throw inventoryError
  const itemPayload = {
    inventory_id: inventoryRow.id,
    product_id: getInventoryProductId(stock),
    location_id: normalizedPayload.locationId,
    batch_id: normalizedPayload.batchId || null,
    book_qty: getInventoryBookQty(stock),
    actual_qty: normalizedPayload.actualQuantity,
    diff_qty: getInventoryDiffQty(normalizedPayload, stock),
    diff_amount: 0,
    reason: normalizedPayload.reason || '',
  }
  const { error: itemError } = await supabase.from('stock_inventory_item').insert(itemPayload)
  if (itemError) {
    await supabase.from('stock_inventory').delete().eq('id', inventoryRow.id)
    throw itemError
  }
  return ok(
    {
      inventoryId: inventoryRow.id,
      inventoryNo: inventoryRow.inventory_no,
      status: inventoryPayload.status,
      bookQty: itemPayload.book_qty,
      actualQty: itemPayload.actual_qty,
      diffQty: itemPayload.diff_qty,
    },
    'created'
  )
}

async function buildMobileStockRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  const { data, error } = await supabase.from('stock').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  const rows = toCamelDeep(data || [])
  const productMap = await loadRowsByIds('product', rows.map((item: any) => item.productId))
  const warehouseMap = await loadRowsByIds('warehouse', rows.map((item: any) => item.warehouseId))
  const locationMap = await loadRowsByIds('warehouse_location', rows.map((item: any) => item.locationId))
  const batchMap = await loadRowsByIds('material_batch', rows.map((item: any) => item.batchId))
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
      const lockedQty = toNumber(item.lockedQty)
      const batchStatus = resolveMobileBatchStatus(batch, qty)
      const row = {
        id: item.id,
        productId: item.productId,
        productCode: product?.code || '-',
        productName: product?.name || '-',
        unit: product?.unit || '',
        safeStock: toNumber(product?.safeStock),
        warehouseId: item.warehouseId,
        warehouseName: warehouse?.name || '-',
        locationId: item.locationId,
        locationCode: location?.code || '-',
        batchId: item.batchId,
        batchNo: batch?.batchNo || '-',
        supplierId: batch?.supplierId || null,
        supplierCode: supplier?.code || '',
        supplierName: supplier?.name || '',
        batchStatus,
        batchProductionDate: normalizeMobileDateOnly(batch?.productionDate),
        batchExpiryDate: normalizeMobileDateOnly(batch?.expiryDate),
        qty,
        lockedQty,
        availableQty: getStockAvailableQty({ qty, lockedQty }),
        updateTime: item.updatedAt || item.updated_at || '',
      }
      const risk = getStockRisk(row)
      return {
        ...row,
        riskLevel: risk.level,
        riskText: risk.text,
      }
    })
    .filter((item: any) => {
      if (!keyword) return true
      return stockSearchText(item).includes(keyword)
    })

  const keywordWarehouseId = Number(params?.warehouseId || 0)
  const keywordLocationId = Number(params?.locationId || 0)
  const keywordProductId = Number(params?.productId || 0)
  const scoped = filtered.filter((item: any) => {
    if (keywordWarehouseId && Number(item.warehouseId) !== keywordWarehouseId) return false
    if (keywordLocationId && Number(item.locationId) !== keywordLocationId) return false
    if (keywordProductId && Number(item.productId) !== keywordProductId) return false
    return true
  })
  const records = scoped.slice(from, to + 1)
  return ok({ records, list: records, total: scoped.length })
}

function groupRowsByKey(rows: any[], key: string) {
  const map = new Map<number, any[]>()
  for (const row of rows) {
    const id = Number(row[key] || 0)
    if (!id) continue
    const list = map.get(id) || []
    list.push(row)
    map.set(id, list)
  }
  return map
}

async function buildMobileTransferItems(transferIds: number[]) {
  const ids = Array.from(new Set(transferIds.filter((id) => Number.isFinite(id) && id > 0)))
  if (!ids.length) return new Map<number, any[]>()
  const { data, error } = await getSupabaseClient()
    .from('stock_transfer_item')
    .select('*')
    .in('transfer_id', ids)
    .order('id', { ascending: true })
  if (error) throw error

  const rows = toCamelDeep(data || [])
  const productMap = await loadRowsByIds('product', rows.map((item: any) => item.productId), 'id, code, name, unit')
  const locationMap = await loadRowsByIds(
    'warehouse_location',
    rows.flatMap((item: any) => [item.fromLocationId, item.toLocationId]),
    'id, code, name'
  )
  const batchMap = await loadRowsByIds(
    'material_batch',
    rows.map((item: any) => item.fromBatchId),
    'id, batch_no, supplier_id'
  )
  const supplierMap = await loadRowsByIds(
    'supplier',
    Array.from(batchMap.values()).map((item: any) => item.supplierId),
    'id, code, name'
  )

  const items = rows.map((item: any) => {
    const product = productMap.get(Number(item.productId || 0))
    const fromLocation = locationMap.get(Number(item.fromLocationId || 0))
    const toLocation = locationMap.get(Number(item.toLocationId || 0))
    const batch = batchMap.get(Number(item.fromBatchId || 0))
    const supplier = supplierMap.get(Number(batch?.supplierId || 0))
    const qty = toNumber(item.qty)
    const receivedQty = toNumber(item.receivedQty)
    return {
      ...item,
      productCode: product?.code || '-',
      productName: product?.name || '-',
      unit: product?.unit || '',
      fromLocationCode: fromLocation?.code || '-',
      toLocationCode: toLocation?.code || '-',
      batchNo: batch?.batchNo || '-',
      supplierId: batch?.supplierId || null,
      supplierCode: supplier?.code || '',
      supplierName: supplier?.name || '',
      qty,
      receivedQty,
      remainingQty: Math.max(qty - receivedQty, 0),
    }
  })
  return groupRowsByKey(items, 'transferId')
}

async function enrichMobileTransferRows(rows: any[]) {
  const transferIds = rows.map((item: any) => Number(item.id || 0)).filter(Boolean)
  const warehouseIds = rows.flatMap((item: any) => [item.fromWarehouseId, item.toWarehouseId])
  const warehouseMap = await loadRowsByIds('warehouse', warehouseIds, 'id, code, name')
  const itemMap = await buildMobileTransferItems(transferIds)

  return rows.map((item: any) => {
    const items = itemMap.get(Number(item.id || 0)) || []
    const fromWarehouse = warehouseMap.get(Number(item.fromWarehouseId || 0))
    const toWarehouse = warehouseMap.get(Number(item.toWarehouseId || 0))
    return {
      ...item,
      transferNo: item.transferNo || item.transfer_no || '-',
      fromWarehouseName: fromWarehouse?.name || '-',
      toWarehouseName: toWarehouse?.name || '-',
      statusText: getStockTransferStatusText(item.status),
      totalQty: getTransferTotalQty(items),
      receivedQty: getTransferReceivedQty(items),
      remainingQty: getTransferRemainingQty(items),
      items,
    }
  })
}

async function buildMobileTransferRows(params?: Record<string, any>) {
  const supabase = getSupabaseClient()
  const { from, to } = pageParams(params)
  const keyword = String(params?.keyword || '').trim()
  const status = String(params?.status || '').trim().toUpperCase()
  let query: any = supabase.from('stock_transfer').select('*', { count: 'exact' })
  if (keyword) {
    const escapedKeyword = keyword.replace(/[%_]/g, '\\$&')
    query = query.or(`transfer_no.ilike.%${escapedKeyword}%,remark.ilike.%${escapedKeyword}%`)
  }
  if (status) query = query.eq('status', status)
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw error
  const records = await enrichMobileTransferRows(toCamelDeep(data || []))
  return ok({ records, list: records, total: count || records.length })
}

async function loadMobileTransferDetail(id: number) {
  const { data, error } = await getSupabaseClient().from('stock_transfer').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  const rows = await enrichMobileTransferRows([toCamelDeep(data)])
  return rows[0] || null
}

async function receiveMobileTransfer(id: number) {
  const supabase = getSupabaseClient()
  const transfer = await loadMobileTransferDetail(id)
  const validationMessage = validateStockTransferReceive(transfer)
  if (validationMessage) throw new Error(validationMessage)

  const now = new Date().toISOString()
  const previousStatus = transfer?.status || 'SHIPPED'
  const previousReceiveTime = transfer?.receiveTime || null
  const itemSnapshots = (transfer?.items || []).map((item: any) => ({
    id: Number(item.id || 0),
    receivedQty: toNumber(item.receivedQty),
  }))
  let transferUpdated = false

  try {
    const { data: updatedTransfer, error: transferError } = await supabase
      .from('stock_transfer')
      .update({
        status: 'RECEIVED',
        receive_time: now,
        operator_id: Number(getCurrentUserId() || 0) || null,
      })
      .eq('id', id)
      .eq('status', 'SHIPPED')
      .select('id')
      .maybeSingle()
    if (transferError) throw transferError
    if (!updatedTransfer?.id) throw new Error('调拨单状态已变化，请刷新后重试')
    transferUpdated = true

    for (const item of transfer?.items || []) {
      const { error: itemError } = await supabase
        .from('stock_transfer_item')
        .update({ received_qty: toNumber(item.qty) })
        .eq('id', Number(item.id))
      if (itemError) throw itemError
    }
  } catch (error) {
    if (transferUpdated) {
      try {
        await supabase
          .from('stock_transfer')
          .update({ status: previousStatus, receive_time: previousReceiveTime })
          .eq('id', id)
      } catch {
        // best effort rollback; surface the original receive failure
      }
    }
    for (const item of itemSnapshots) {
      try {
        await supabase.from('stock_transfer_item').update({ received_qty: item.receivedQty }).eq('id', item.id)
      } catch {
        // best effort rollback; surface the original receive failure
      }
    }
    throw error
  }

  return ok(await loadMobileTransferDetail(id), 'updated')
}

async function settleMonthlySalary(data: any) {
  const supabase = getSupabaseClient()
  const currentUserId = Number(getCurrentUserId() || 0)
  const monthValue = String(data?.month || '').trim()
  const now = new Date()
  const year = Number(data?.year || now.getFullYear())
  const month = Number(monthValue ? Number(monthValue.split('-')[1]) || now.getMonth() + 1 : data?.monthNumber || now.getMonth() + 1)
  const bounds = monthBounds(year, month)
  let query = supabase
    .from('salary_daily')
    .update({
      status: 'SETTLED',
      confirmed_by: currentUserId || null,
      confirmed_at: new Date().toISOString(),
    })
    .gte('work_date', bounds.startDate)
    .lte('work_date', bounds.endDate)
  if (data?.userId) {
    query = query.eq('user_id', Number(data.userId))
  }
  const { error } = await query
  if (error) throw error
  return ok(true, 'updated')
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

async function insertTable(route: RouteConfig, payload: any) {
  const { data, error } = await getSupabaseClient()
    .from(route.table)
    .insert(toSnakePayload(payload))
    .select()
    .single()
  if (error) throw error
  return ok(toCamelDeep(data), 'created')
}

async function updateTable(route: RouteConfig, id: number, payload: any) {
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
  const { error } = await getSupabaseClient().from(route.table).delete().eq('id', id)
  if (error) throw error
  return ok(true, 'deleted')
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

async function configObject() {
  const route = resolveResourceRoute('/system/config')!
  const result = await listTable(route, { page: 1, size: 500 })
  const rows = result.data.records || []
  return ok(
    rows.reduce((acc: Record<string, any>, row: any) => {
      acc[row.configKey] = row.configValue
      return acc
    }, {})
  )
}

async function updateConfig(payload: Record<string, any>) {
  const supabase = getSupabaseClient()
  const rows = Object.entries(payload).map(([key, value]) => ({
    config_key: key,
    config_value: String(value ?? ''),
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('sys_config').upsert(rows, { onConflict: 'config_key' })
  if (error) throw error
  return ok(true, 'updated')
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

async function productionBoard() {
  const supabase = getSupabaseClient()
  const [machines, orders, reports, defects] = await Promise.all([
    supabase.from('machine').select('id, name, status'),
    supabase.from('prod_order').select('id, order_no, product_id, machine_id, plan_qty, completed_qty, status').limit(100),
    supabase.from('prod_report').select('shift, qty, bad_qty').limit(500),
    supabase.from('qc_record').select('defect_type, defect_qty').limit(200),
  ])
  const machineStatuses = (machines.data || []).map((item: any) => ({
    machineId: item.id,
    machineName: item.name,
    status: item.status,
  }))
  const orderProgresses = (orders.data || []).map((item: any) => ({
    orderId: item.id,
    orderNo: item.order_no,
    planQty: item.plan_qty,
    completedQty: item.completed_qty,
    completionRate: item.plan_qty ? (Number(item.completed_qty || 0) / Number(item.plan_qty)) * 100 : 0,
    status: item.status,
  }))
  const shiftMap = (reports.data || []).reduce((acc: Record<string, any>, item: any) => {
    const key = item.shift || '未分班'
    acc[key] ||= { shift: key, qty: 0, badQty: 0 }
    acc[key].qty += Number(item.qty || 0)
    acc[key].badQty += Number(item.bad_qty || 0)
    return acc
  }, {})
  const defectMap = (defects.data || []).reduce((acc: Record<string, number>, item: any) => {
    const key = item.defect_type || '未分类'
    acc[key] = (acc[key] || 0) + Number(item.defect_qty || 0)
    return acc
  }, {})
  return ok({
    machineStatuses,
    orderProgresses,
    shiftOutputs: Object.values(shiftMap),
    topDefects: Object.entries(defectMap).map(([defectType, qty]) => ({ defectType, qty })).slice(0, 5),
  })
}

function configRowsToObject(rows: any[]) {
  return rows.reduce((config: Record<string, any>, row: any) => {
    const key = row.configKey || row.config_key
    if (key) config[key] = row.configValue ?? row.config_value ?? ''
    return config
  }, {})
}

function normalizeMobileDateOnly(value?: any) {
  const text = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  return Number.isNaN(new Date(`${text}T00:00:00`).getTime()) ? '' : text
}

function resolveMobileBatchStatus(batch?: any, qty?: any) {
  if (!batch) return ''
  const remainingQty = toNumber(qty ?? batch.remainingQty)
  if (remainingQty <= 0) return 'DEPLETED'
  const expiryDate = normalizeMobileDateOnly(batch.expiryDate)
  if (!expiryDate) return normalizeBusinessStatus(batch.status) || 'NORMAL'
  const today = formatLocalDate(new Date())
  if (expiryDate < today) return 'EXPIRED'
  const expiryTime = new Date(`${expiryDate}T00:00:00`).getTime()
  const todayTime = new Date(`${today}T00:00:00`).getTime()
  const daysToExpiry = Math.ceil((expiryTime - todayTime) / 86400000)
  return daysToExpiry <= 30 ? 'EXPIRING' : normalizeBusinessStatus(batch.status) || 'NORMAL'
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
        batchStatus: resolveMobileBatchStatus(batch, qty),
        batchExpiryDate: normalizeMobileDateOnly(batch?.expiryDate),
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

async function financeStatements(params?: Record<string, any>) {
  return listTable(resolveResourceRoute('/payments')!, params)
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
  return updateTable(route, id, statusMap[action || ''] || {})
}

function createMovePayload(url: string, data: any) {
  const path = normalizePath(url)
  const moveType = path.includes('in-') ? 'IN' : path.includes('out-') ? 'OUT' : 'TRANSFER'
  const rows = data?.items || data?.products || [data]
  const first = Array.isArray(rows) ? rows[0] || data : data
  return {
    moveNo: data?.moveNo || data?.orderNo || `SM-${Date.now()}`,
    productId: first.productId,
    warehouseId: first.warehouseId || data?.warehouseId,
    locationId: first.locationId || data?.locationId,
    batchId: first.batchId || data?.batchId,
    moveType,
    moveReason: path.split('/').pop()?.toUpperCase().replace(/-/g, '_') || moveType,
    qty: first.qty || first.quantity || data?.qty || data?.quantity || 0,
    relatedOrderId: data?.relatedOrderId,
    relatedOrderType: data?.relatedOrderType,
    operatorId: data?.operatorId,
    operateTime: new Date().toISOString(),
    remark: data?.remark,
  }
}

async function get(url: string, config?: RequestConfig) {
  const { path, route, id } = parseRoute(url)
  if (path === 'auth/userinfo' || path === 'auth/user-info') return currentUser()
  if (path === 'dashboard' || path === 'dashboard/home') return dashboardHome()
  if (path === 'dashboard/boss') return dashboardHome()
  if (path === 'dashboard/production' || path === 'dashboard/quality') return productionBoard()
  if (path === 'warnings') return warningList()
  if (path === 'warnings/summary') return warningSummary()
  if (path === 'reports/oee') return oeeStats()
  if (path === 'finance/statements') return financeStatements(config?.params)
  if (path === 'notifications/unread-count') return unreadCount()
  if (path === 'system/config') return configObject()
  if (path === 'qc-records/pending-orders') return buildMobileWorkOrderRows({ status: 'SCHEDULED', page: 1, pageSize: 100 })
  if (path === 'prod-reports/current-shift-tasks' || path === 'prod-reports/work-orders') {
    return buildMobileWorkOrderRows({ page: 1, pageSize: 100, ...(config?.params || {}) })
  }
  if (path === 'prod-reports/my-output-stats') return buildMobileOutputStats(config?.params)
  if (path === 'prod-reports/my-reports') return buildMobileProdReportRows({ ...(config?.params || {}), page: config?.params?.page || 1, pageSize: config?.params?.pageSize || 20 }, true)
  if (path === 'salary/summary') return buildMobileSalarySummary(config?.params)
  if (path === 'salary/daily-details') return buildMobileDailySalaryDetails(config?.params || {})
  if (path === 'stock') return buildMobileStockRows(config?.params)
  if (path === 'stock/ledger') return buildMobileStockRows(config?.params)
  if (path === 'stock/warnings') return stockWarningList()
  if (route?.table === 'stock_transfer') {
    if (id) return ok(await loadMobileTransferDetail(id))
    return buildMobileTransferRows(config?.params)
  }
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
  if (path === 'qc-records/upload') return uploadFormData(data, 'qc')
  if (path === 'prod-reports') return submitProdReport(data)
  if (path === 'qc-records') return submitQcRecord(data)
  if (path.startsWith('import/')) return uploadFormData(data, `imports/${path.split('/')[1]}`)
  if (path.startsWith('integrations/')) return ok({ accepted: true, payload: data })
  if (path.startsWith('stock/') && path !== 'stock') {
    return insertTable({ resource: 'stock-moves', table: 'stock_move' }, createMovePayload(path, data))
  }
  if (path === 'stock-inventories/mobile-check') {
    return submitInventoryCheck(data)
  }
  if (!route) throw new Error(`未配置 Supabase 路由：/${path}`)
  if (id && action) return actionUpdate(route, id, action)
  return insertTable(route, data || config?.params || {})
}

async function put(url: string, data?: any) {
  const { path, route, id, action } = parseRoute(url)
  if (path === 'system/config') return updateConfig(data || {})
  if (path === 'salary/monthly/settle') return settleMonthlySalary(data || {})
  if (route?.table === 'stock_transfer' && id && action === 'receive') return receiveMobileTransfer(id)
  if (!route || !id) throw new Error(`未配置 Supabase 路由：/${path}`)
  if (action) return actionUpdate(route, id, action)
  return updateTable(route, id, data || {})
}

async function remove(url: string) {
  const { path, route, id } = parseRoute(url)
  if (!route || !id) throw new Error(`未配置 Supabase 路由：/${path}`)
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
