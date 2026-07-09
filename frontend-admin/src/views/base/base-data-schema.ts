import type { Component } from 'vue'
import type { FormRules } from 'element-plus'
import {
  CircleCheck,
  CircleClose,
  Download,
  Link,
  Notebook,
  Plus,
  Refresh,
  Upload,
} from '@element-plus/icons-vue'
import { formatDateTime, formatMoney } from '@/utils'
import {
  buildCustomerMasterSummary,
  buildCustomerPayload,
  buildCustomerQuery,
  getCustomerCreditLabel,
  normalizeCustomerMaster,
  validateCustomerMaster,
} from '@/utils/customer-master'
import {
  buildSupplierMasterSummary,
  buildSupplierPayload,
  buildSupplierQuery,
  getSupplierDataRisk,
  normalizeSupplierMaster,
  validateSupplierMaster,
} from '@/utils/supplier-master'
import {
  buildProductMasterSummary,
  buildProductPayload,
  buildProductQuery,
  isProductImageUrlAllowed,
  normalizeProductMaster,
  productImageAlt,
  validateProductMaster,
} from '@/utils/product-master'

export type TagType = 'success' | 'info' | 'warning' | 'danger' | 'primary'

export type SelectOption = {
  label: string
  value: string | number
}

export type TagMeta = {
  label: string
  type: TagType
}

export type ToolbarAction = {
  key: string
  label: string
  icon?: Component
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  plain?: boolean
  requiresSelection?: boolean
}

export type RowAction = {
  key: string
  label: string | ((row: any) => string)
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  link?: boolean
}

export type SearchField = {
  prop: string
  label: string
  type: 'input' | 'select'
  placeholder?: string
  width?: string
  filterable?: boolean
  options?: SelectOption[]
}

export type TableColumn = {
  prop: string
  label: string
  width?: number | string
  minWidth?: number | string
  fixed?: 'left' | 'right' | boolean
  align?: 'left' | 'center' | 'right'
  kind?: 'text' | 'tag' | 'progress' | 'image'
  tagMap?: Record<string, TagMeta>
  formatter?: (value: any, row: any) => string
  progress?: (row: any) => number
  imageAlt?: (row: any) => string
}

export type DetailItem = {
  prop: string
  label: string
  formatter?: (value: any, row: any) => string
}

export type FormField = {
  prop: string
  label: string
  type: 'input' | 'textarea' | 'number' | 'select' | 'date'
  span?: number
  placeholder?: string
  options?: SelectOption[]
  width?: string
  min?: number
  precision?: number
  rows?: number
  disabledOnEdit?: boolean
  filterable?: boolean
  optionsSource?: 'products'
}

export type FormSection = {
  title: string
  rows: FormField[][]
}

export type MetricSpec = {
  label: string
  resolve: (rows: any[], total: number) => string | number
}

export type BasePageConfig<TSearch extends Record<string, any>, TForm extends Record<string, any>> = {
  title: string
  subtitle: string
  entityName: string
  detailTitle: string
  emptyText: string
  emptyDetailText: string
  dialogWidth: string
  formLabelWidth: string
  actionWidth: number
  logKeyword: string
  searchFields: SearchField[]
  toolbarActions: ToolbarAction[]
  rowActions: RowAction[]
  tableColumns: TableColumn[]
  detailItems: DetailItem[]
  formRows: FormField[][]
  formSections?: FormSection[]
  metrics: MetricSpec[]
  createSearchState: () => TSearch
  createFormState: () => TForm
  mapFormFromRow: (row: any) => TForm
  buildQuery: (payload: {
    page: number
    pageSize: number
    keyword: string
    search: TSearch
  }) => Record<string, any>
  buildPayload: (form: TForm) => Record<string, any>
  formRules: FormRules | ((context: { isEditing: boolean; model: TForm }) => FormRules)
}

export const baseStatusOptions: SelectOption[] = [
  { label: '启用', value: '1' },
  { label: '禁用', value: '0' },
]

export const baseStatusSearchField: SearchField = {
  prop: 'status',
  label: '状态',
  type: 'select',
  width: '140px',
  options: baseStatusOptions,
}

export function baseSearchState<T extends Record<string, any>>(state: T): T {
  return state
}

export function baseCreateStatusFormField(label = '状态'): FormField {
  return {
    prop: 'status',
    label,
    type: 'select',
    span: 12,
    options: baseStatusOptions,
  }
}

export function baseCreateStatusDetailItem(label = '状态'): DetailItem {
  return {
    prop: 'status',
    label,
    formatter: (value) => resolveTagMeta(baseStatusMap, value).label,
  }
}

export function formatText(value: any, fallback = '-') {
  return value === null || value === undefined || value === '' ? fallback : String(value)
}

export function formatMoneyText(value: any) {
  return formatMoney(Number(value || 0))
}

export function resolveTagMeta(map: Record<string, TagMeta>, value: any): TagMeta {
  const key = String(value ?? '')
  return map[key] || { label: formatText(value), type: 'info' }
}

export function clampPercent(value: any) {
  return Math.max(0, Math.min(100, Number(value || 0)))
}

export function buildMetricCards(rows: any[], total: number, specs: MetricSpec[]) {
  return specs.map((item) => ({ label: item.label, value: item.resolve(rows, total) }))
}

export function makeToolbarActions() {
  return {
    add: { key: 'add', label: '新增', icon: Plus, type: 'primary' as const },
    refresh: { key: 'refresh', label: '刷新', icon: Refresh, plain: true },
    batchEnable: { key: 'batch-enable', label: '批量启用', icon: CircleCheck, plain: true, requiresSelection: true },
    batchDisable: { key: 'batch-disable', label: '批量禁用', icon: CircleClose, plain: true, requiresSelection: true },
    batchStop: { key: 'batch-stop', label: '批量停机', icon: CircleClose, plain: true, requiresSelection: true },
    import: { key: 'import', label: '导入', icon: Upload, plain: true },
    export: { key: 'export', label: '导出', icon: Download, plain: true },
    logs: { key: 'logs', label: '日志', icon: Notebook, plain: true },
    maintenanceRecords: { key: 'maintenance-records', label: '保养记录', icon: Notebook, type: 'success' as const, plain: true },
    qrcode: { key: 'qrcode', label: '二维码', icon: Link, plain: true },
  }
}

const toolbar = makeToolbarActions()

function normalizeStatus(value: any) {
  return String(value ?? '').trim()
}

function isEnabledStatus(value: any) {
  const status = normalizeStatus(value).toUpperCase()
  return status === '1' || status === '启用' || status === 'TRUE' || status === 'ENABLED'
}

function hasText(value: any) {
  return String(value ?? '').trim() !== ''
}

function hasPositiveNumber(value: any) {
  return Number(value || 0) > 0
}

function getMachineDataRisk(row: any) {
  if (!hasText(row.code) || !hasText(row.name) || !hasText(row.workshop)) return '基础信息缺失'
  if (!hasPositiveNumber(row.tonnage)) return '吨位待补全'
  if (String(row.status || '').toUpperCase() === 'STOPPED') return '停机异常'
  return ''
}

function getMoldDataRisk(row: any) {
  if (!hasText(row.code) || !hasText(row.name) || !hasPositiveNumber(row.productId)) return '基础信息缺失'
  if (!hasPositiveNumber(row.lifetime)) return '寿命待补全'
  if (!hasPositiveNumber(row.maintenanceCycle)) return '保养周期待补全'
  if (Number(row.maintenanceRate || 0) >= 80) return '临近保养'
  if (String(row.status || '').toUpperCase() === 'SCRAP') return '已报废'
  return ''
}

function getWarehouseDataRisk(row: any) {
  if (!hasText(row.code) || !hasText(row.name) || !hasText(row.type)) return '基础信息缺失'
  if (!hasText(row.factoryCode) && !hasText(row.workshop)) return '组织归属待补全'
  if (!hasPositiveNumber(row.managerId)) return '负责人待补全'
  return ''
}

function getUserDataRisk(row: any) {
  if (!hasText(row.username) || !hasText(row.realName)) return '基础信息缺失'
  if (!hasText(row.role)) return '角色权限待补全'
  if (!isEnabledStatus(row.status)) return '账号已禁用'
  return ''
}

export const baseStatusMap: Record<string, TagMeta> = {
  '1': { label: '启用', type: 'success' },
  '0': { label: '禁用', type: 'info' },
}

export const productTypeOptions: SelectOption[] = [
  { label: '原料', value: 'RAW' },
  { label: '半成品', value: 'SEMI' },
  { label: '成品', value: 'FINISH' },
]

export const productTypeMap: Record<string, TagMeta> = {
  RAW: { label: '原料', type: 'info' },
  SEMI: { label: '半成品', type: 'warning' },
  FINISH: { label: '成品', type: 'success' },
}

export const customerCreditOptions: SelectOption[] = [
  { label: 'A级', value: 'A' },
  { label: 'B级', value: 'B' },
  { label: 'C级', value: 'C' },
  { label: 'D级', value: 'D' },
  { label: '现结', value: 'CASH' },
]

export const customerCreditMap: Record<string, TagMeta> = {
  A: { label: 'A级', type: 'success' },
  B: { label: 'B级', type: 'primary' },
  C: { label: 'C级', type: 'warning' },
  D: { label: 'D级', type: 'danger' },
  CASH: { label: '现结', type: 'info' },
}

export const machineStatusMap: Record<string, TagMeta> = {
  RUNNING: { label: '运行中', type: 'success' },
  IDLE: { label: '空闲', type: 'info' },
  MAINTENANCE: { label: '维护中', type: 'warning' },
  STOPPED: { label: '停机', type: 'danger' },
}

export const machineStatusOptions: SelectOption[] = [
  { label: '运行中', value: 'RUNNING' },
  { label: '空闲', value: 'IDLE' },
  { label: '维护中', value: 'MAINTENANCE' },
  { label: '停机', value: 'STOPPED' },
]

export const moldStatusMap: Record<string, TagMeta> = {
  NORMAL: { label: '正常', type: 'success' },
  REPAIR: { label: '维护中', type: 'warning' },
  SCRAP: { label: '报废', type: 'danger' },
}

export const moldStatusOptions: SelectOption[] = [
  { label: '正常', value: 'NORMAL' },
  { label: '维护中', value: 'REPAIR' },
  { label: '报废', value: 'SCRAP' },
]

export const productPageConfig: BasePageConfig<
  { type: string; status: string },
  {
    id: number
    code: string
    name: string
    type: string
    spec: string
    unit: string
    piecePrice: number
    safeStock: number
    weightG: number
    rawMaterialUsage: number
    rawMaterialId: number | null
    cavityYield: number
    cycleTimeSec: number
    customerId: number | null
    imageUrl: string
    color: string
    status: string
  }
> = {
  title: '产品管理',
  subtitle: '维护产品编码、规格、类型、单价和图片资料，支撑销售、库存和工资核算。',
  entityName: '产品',
  detailTitle: '产品关联信息',
  emptyText: '暂无产品',
  emptyDetailText: '请选择一条产品查看详情',
  dialogWidth: '720px',
  formLabelWidth: '96px',
  actionWidth: 180,
  logKeyword: '产品管理',
  searchFields: [
    { prop: 'type', label: '类型', type: 'select', width: '140px', options: productTypeOptions },
    baseStatusSearchField,
  ],
  toolbarActions: [
    toolbar.add,
    toolbar.refresh,
    toolbar.batchEnable,
    toolbar.batchDisable,
    toolbar.import,
    toolbar.export,
    toolbar.logs,
  ],
  rowActions: [
    { key: 'inspect', label: '详情', type: 'primary', link: true },
    { key: 'edit', label: '编辑', type: 'primary', link: true },
    { key: 'delete', label: '删除', type: 'danger', link: true },
  ],
  tableColumns: [
    {
      prop: 'imageUrl',
      label: '图片',
      width: 86,
      kind: 'image',
      formatter: (value) => isProductImageUrlAllowed(value) ? String(value || '').trim() : '-',
      imageAlt: (row) => productImageAlt(normalizeProductMaster(row)),
    },
    { prop: 'code', label: '编码', width: 120, fixed: 'left' },
    { prop: 'name', label: '名称', minWidth: 140, fixed: 'left' },
    { prop: 'type', label: '类型', width: 100, kind: 'tag', tagMap: productTypeMap },
    { prop: 'spec', label: '规格', width: 140 },
    { prop: 'unit', label: '单位', width: 90 },
    { prop: 'piecePrice', label: '单价', width: 110, align: 'right', formatter: (_value, row) => formatMoneyText(row.piecePrice) },
    { prop: 'safeStock', label: '安全库存', width: 100, align: 'right' },
    { prop: 'rawMaterialUsage', label: '原料用量', width: 110, align: 'right' },
    { prop: 'cavityYield', label: '单模产出', width: 100, align: 'right' },
    { prop: 'cycleTimeSec', label: '周期(s)', width: 100, align: 'right' },
    { prop: 'status', label: '状态', width: 90, kind: 'tag', tagMap: baseStatusMap },
  ],
  detailItems: [
    { prop: 'code', label: '编码' },
    { prop: 'name', label: '名称' },
    { prop: 'type', label: '类型', formatter: (value) => resolveTagMeta(productTypeMap, value).label },
    { prop: 'spec', label: '规格' },
    { prop: 'unit', label: '单位' },
    { prop: 'piecePrice', label: '单价', formatter: (_value, row) => formatMoneyText(row.piecePrice) },
    { prop: 'safeStock', label: '安全库存' },
    { prop: 'weightG', label: '重量(g)' },
    { prop: 'rawMaterialId', label: '原料产品ID' },
    { prop: 'rawMaterialUsage', label: '原料用量' },
    { prop: 'cavityYield', label: '单模产出' },
    { prop: 'cycleTimeSec', label: '周期(s)' },
    { prop: 'customerId', label: '客户ID' },
    { prop: 'imageUrl', label: '图片地址' },
    { prop: 'color', label: '颜色' },
    baseCreateStatusDetailItem(),
    { prop: 'updatedAt', label: '更新时间', formatter: (_value, row) => formatDateTime(row.updatedAt || row.createdAt) },
  ],
  formRows: [
    [
      { prop: 'code', label: '编码', type: 'input', span: 12, placeholder: '产品编码', disabledOnEdit: true },
      { prop: 'name', label: '名称', type: 'input', span: 12, placeholder: '产品名称' },
    ],
    [
      { prop: 'type', label: '类型', type: 'select', span: 12, options: productTypeOptions },
      { prop: 'unit', label: '单位', type: 'input', span: 12, placeholder: '单位' },
    ],
    [
      { prop: 'spec', label: '规格', type: 'input', span: 24, placeholder: '规格、型号或包装信息' },
    ],
    [
      { prop: 'piecePrice', label: '单价', type: 'number', span: 12, min: 0, precision: 2 },
      { prop: 'safeStock', label: '安全库存', type: 'number', span: 12, min: 0 },
    ],
    [
      { prop: 'weightG', label: '重量(g)', type: 'number', span: 12, min: 0, precision: 2 },
      { prop: 'rawMaterialUsage', label: '原料用量', type: 'number', span: 12, min: 0, precision: 2 },
    ],
    [
      { prop: 'rawMaterialId', label: '原料ID', type: 'number', span: 12, min: 0 },
      { prop: 'cavityYield', label: '单模产出', type: 'number', span: 12, min: 0 },
    ],
    [
      { prop: 'cycleTimeSec', label: '周期(s)', type: 'number', span: 12, min: 0 },
      { prop: 'customerId', label: '客户ID', type: 'number', span: 12, min: 0 },
    ],
    [
      { prop: 'imageUrl', label: '图片地址', type: 'input', span: 24, placeholder: 'https://... 或 /assets/...' },
    ],
    [
      { prop: 'color', label: '颜色', type: 'input', span: 12, placeholder: '例如：红色' },
      baseCreateStatusFormField(),
    ],
  ],
  metrics: [
    { label: '产品总数', resolve: (_rows, total) => total },
    { label: '原料', resolve: (rows) => buildProductMasterSummary(rows.map(normalizeProductMaster)).raw },
    { label: '半成品/成品', resolve: (rows) => {
      const summary = buildProductMasterSummary(rows.map(normalizeProductMaster))
      return summary.semi + summary.finish
    } },
    { label: '图片完整', resolve: (rows) => buildProductMasterSummary(rows.map(normalizeProductMaster)).withImage },
    { label: '工艺参数', resolve: (rows) => buildProductMasterSummary(rows.map(normalizeProductMaster)).withProcessParams },
    { label: '原料规则', resolve: (rows) => buildProductMasterSummary(rows.map(normalizeProductMaster)).withMaterialRule },
    { label: '安全库存', resolve: (rows) => buildProductMasterSummary(rows.map(normalizeProductMaster)).withSafeStock },
    { label: '数据风险', resolve: (rows) => buildProductMasterSummary(rows.map(normalizeProductMaster)).dataRisks },
  ],
  createSearchState: () => ({ type: '', status: '' }),
  createFormState: () => ({
    id: 0,
    code: '',
    name: '',
    type: 'FINISH',
    spec: '',
    unit: '个',
    piecePrice: 0,
    safeStock: 0,
    weightG: 0,
    rawMaterialId: null,
    rawMaterialUsage: 0,
    cavityYield: 0,
    cycleTimeSec: 0,
    customerId: null,
    imageUrl: '',
    color: '',
    status: '1',
  }),
  mapFormFromRow: (row: any) => ({
    id: row.id || 0,
    code: row.code || '',
    name: row.name || '',
    type: row.type || 'FINISH',
    spec: row.spec || '',
    unit: row.unit || '个',
    piecePrice: Number(row.piecePrice || 0),
    safeStock: Number(row.safeStock || 0),
    weightG: Number(row.weightG || 0),
    rawMaterialId: row.rawMaterialId ? Number(row.rawMaterialId) : null,
    rawMaterialUsage: Number(row.rawMaterialUsage || 0),
    cavityYield: Number(row.cavityYield || 0),
    cycleTimeSec: Number(row.cycleTimeSec || 0),
    customerId: row.customerId ? Number(row.customerId) : null,
    imageUrl: row.imageUrl || '',
    color: row.color || '',
    status: String(row.status ?? '1'),
  }),
  buildQuery: ({ page, pageSize, keyword, search }) => buildProductQuery({
    page,
    pageSize,
    keyword,
    type: search.type,
    status: search.status,
  }),
  buildPayload: (form) => buildProductPayload(form),
  formRules: ({ isEditing, model }) => {
    const fieldRule = (prop: string, trigger: 'blur' | 'change' = 'blur') => ({
      validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) => {
        const message = validateProductMaster({ [prop]: value }, { isEditing: true })
        callback(message ? new Error(message) : undefined)
      },
      trigger,
    })
    const relationRule = {
      validator: (_rule: unknown, _value: unknown, callback: (error?: Error) => void) => {
        const message = validateProductMaster({
          id: model.id,
          rawMaterialId: model.rawMaterialId,
          rawMaterialUsage: model.rawMaterialUsage,
        }, { isEditing: true })
        callback(message ? new Error(message) : undefined)
      },
      trigger: 'blur',
    }
    return {
      code: [
        { required: true, message: '请输入产品编码', trigger: 'blur' },
        fieldRule('code'),
      ],
      name: [
        { required: true, message: '请输入产品名称', trigger: 'blur' },
        fieldRule('name'),
      ],
      type: [
        { required: true, message: '请选择产品类型', trigger: 'change' },
        fieldRule('type', 'change'),
      ],
      spec: [fieldRule('spec')],
      unit: [
        { required: true, message: '请输入产品单位', trigger: 'blur' },
        fieldRule('unit'),
      ],
      piecePrice: [fieldRule('piecePrice')],
      safeStock: [fieldRule('safeStock')],
      weightG: [fieldRule('weightG')],
      rawMaterialId: [relationRule],
      rawMaterialUsage: [relationRule],
      cavityYield: [fieldRule('cavityYield')],
      cycleTimeSec: [fieldRule('cycleTimeSec')],
      customerId: [fieldRule('customerId')],
      imageUrl: [
        {
          validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) => {
            const message = isProductImageUrlAllowed(value)
              ? ''
              : '产品图片地址必须是 HTTPS 地址或站内路径，且不超过 500 个字符'
            callback(message ? new Error(message) : undefined)
          },
          trigger: 'blur',
        },
      ],
      color: [fieldRule('color')],
      status: [fieldRule('status', 'change')],
    }
  },
}

export const machinePageConfig: BasePageConfig<
  { status: string; workshop: string },
  {
    id: number
    code: string
    name: string
    model: string
    tonnage: number
    location: string
    factoryCode: string
    workshop: string
    status: string
    purchaseDate: string
    remark: string
  }
> = {
  title: '机台管理',
  subtitle: '维护设备状态、吨位、位置和点检属性，支撑现场执行与设备看板。',
  entityName: '机台',
  detailTitle: '机台关联信息',
  emptyText: '暂无机台',
  emptyDetailText: '请选择一台机台查看详情',
  dialogWidth: '720px',
  formLabelWidth: '96px',
  actionWidth: 220,
  logKeyword: '机台管理',
  searchFields: [
    { prop: 'status', label: '状态', type: 'select', width: '160px', options: machineStatusOptions },
    { prop: 'workshop', label: '车间', type: 'input', width: '180px', placeholder: '车间关键词' },
  ],
  toolbarActions: [
    toolbar.add,
    toolbar.refresh,
    toolbar.batchEnable,
    toolbar.batchStop,
    toolbar.import,
    toolbar.export,
    toolbar.logs,
  ],
  rowActions: [
    { key: 'inspect', label: '详情', type: 'primary', link: true },
    { key: 'toggle', label: (row) => (row.status === 'RUNNING' ? '停机' : '启用'), type: 'success', link: true },
    { key: 'qrcode', label: '二维码', type: 'primary', link: true },
    { key: 'edit', label: '编辑', type: 'primary', link: true },
    { key: 'delete', label: '删除', type: 'danger', link: true },
  ],
  tableColumns: [
    { prop: 'code', label: '编码', width: 120, fixed: 'left' },
    { prop: 'name', label: '名称', minWidth: 140, fixed: 'left' },
    { prop: 'model', label: '型号', width: 120 },
    { prop: 'tonnage', label: '吨位', width: 90, align: 'right' },
    { prop: 'factoryCode', label: '工厂', width: 110 },
    { prop: 'workshop', label: '车间', width: 120 },
    { prop: 'location', label: '位置', minWidth: 120 },
    { prop: 'status', label: '状态', width: 90, kind: 'tag', tagMap: machineStatusMap },
  ],
  detailItems: [
    { prop: 'code', label: '编码' },
    { prop: 'name', label: '名称' },
    { prop: 'status', label: '状态', formatter: (value) => resolveTagMeta(machineStatusMap, value).label },
    { prop: 'model', label: '型号' },
    { prop: 'tonnage', label: '吨位' },
    { prop: 'qrCode', label: '二维码' },
    { prop: 'purchaseDate', label: '购买日期', formatter: (_value, row) => formatDateTime(row.purchaseDate) },
    { prop: 'createdAt', label: '更新时间', formatter: (_value, row) => formatDateTime(row.createdAt) },
  ],
  formRows: [
    [
      { prop: 'code', label: '编码', type: 'input', span: 12, placeholder: '机台编码', disabledOnEdit: true },
      { prop: 'name', label: '名称', type: 'input', span: 12, placeholder: '机台名称' },
    ],
    [
      { prop: 'model', label: '型号', type: 'input', span: 12, placeholder: '机台型号' },
      { prop: 'tonnage', label: '吨位', type: 'number', span: 12, min: 1 },
    ],
    [
      { prop: 'factoryCode', label: '工厂', type: 'input', span: 12, placeholder: '工厂编码' },
      { prop: 'workshop', label: '车间', type: 'input', span: 12, placeholder: '车间' },
    ],
    [
      { prop: 'location', label: '位置', type: 'input', span: 12, placeholder: '机台位置' },
      { prop: 'status', label: '状态', type: 'select', span: 12, options: machineStatusOptions },
    ],
    [
      { prop: 'purchaseDate', label: '购买日期', type: 'date', span: 12 },
      { prop: 'remark', label: '备注', type: 'textarea', span: 12, rows: 3, placeholder: '备注' },
    ],
  ],
  metrics: [
    { label: '机台总数', resolve: (_rows, total) => total },
    { label: '运行状态', resolve: (rows) => rows.filter((item) => item.status === 'RUNNING').length },
    { label: '保养状态', resolve: (rows) => rows.filter((item) => item.status === 'MAINTENANCE').length },
    { label: '寿命参数', resolve: (rows) => rows.filter((item) => hasPositiveNumber(item.tonnage) && hasText(item.purchaseDate)).length },
    { label: '异常风险', resolve: (rows) => rows.filter((item) => getMachineDataRisk(item)).length },
  ],
  createSearchState: () => ({ status: '', workshop: '' }),
  createFormState: () => ({
    id: 0,
    code: '',
    name: '',
    model: '',
    tonnage: 100,
    location: '',
    factoryCode: '',
    workshop: '',
    status: 'IDLE',
    purchaseDate: '',
    remark: '',
  }),
  mapFormFromRow: (row: any) => ({
    id: row.id || 0,
    code: row.code || '',
    name: row.name || '',
    model: row.model || '',
    tonnage: Number(row.tonnage || 100),
    location: row.location || '',
    factoryCode: row.factoryCode || '',
    workshop: row.workshop || '',
    status: row.status || 'IDLE',
    purchaseDate: row.purchaseDate || '',
    remark: row.remark || '',
  }),
  buildQuery: ({ page, pageSize, keyword, search }) => ({
    page,
    pageSize,
    keyword: keyword || undefined,
    status: search.status || undefined,
    workshop: search.workshop || undefined,
  }),
  buildPayload: (form) => ({
    code: form.code,
    name: form.name,
    model: form.model,
    tonnage: form.tonnage,
    location: form.location,
    factoryCode: form.factoryCode,
    workshop: form.workshop,
    status: form.status,
    purchaseDate: form.purchaseDate || undefined,
    remark: form.remark,
  }),
  formRules: {
    code: [{ required: true, message: '请输入机台编码', trigger: 'blur' }],
    name: [{ required: true, message: '请输入机台名称', trigger: 'blur' }],
    factoryCode: [{ required: true, message: '请输入工厂编码', trigger: 'blur' }],
    workshop: [{ required: true, message: '请输入车间', trigger: 'blur' }],
  },
}

export const moldPageConfig: BasePageConfig<
  { status: string },
  {
    id: number
    code: string
    name: string
    productId: number | null
    cavities: number
    lifetime: number
    maintenanceCycle: number
    status: string
    remark: string
  }
> = {
  title: '模具管理',
  subtitle: '维护模具寿命、穴数、适配产品和保养状态，支撑上下模与生产排程。',
  entityName: '模具',
  detailTitle: '模具关联信息',
  emptyText: '暂无模具',
  emptyDetailText: '请选择一条模具查看详情',
  dialogWidth: '720px',
  formLabelWidth: '96px',
  actionWidth: 260,
  logKeyword: '模具管理',
  searchFields: [
    { prop: 'status', label: '状态', type: 'select', width: '160px', options: moldStatusOptions },
  ],
  toolbarActions: [
    toolbar.add,
    toolbar.refresh,
    toolbar.batchEnable,
    toolbar.batchDisable,
    toolbar.maintenanceRecords,
    toolbar.import,
    toolbar.export,
    toolbar.logs,
  ],
  rowActions: [
    { key: 'inspect', label: '详情', type: 'primary', link: true },
    { key: 'stats', label: '统计', type: 'primary', link: true },
    { key: 'maintain', label: '保养', type: 'success', link: true },
    { key: 'toggle', label: (row) => (row.status === 'SCRAP' ? '恢复' : '报废'), type: 'primary', link: true },
    { key: 'edit', label: '编辑', type: 'primary', link: true },
    { key: 'delete', label: '删除', type: 'danger', link: true },
  ],
  tableColumns: [
    { prop: 'code', label: '编码', width: 130, fixed: 'left' },
    { prop: 'name', label: '名称', minWidth: 140, fixed: 'left' },
    { prop: 'productName', label: '产品', minWidth: 140 },
    { prop: 'cavities', label: '穴数', width: 80, align: 'right' },
    { prop: 'usedShots', label: '累计模次', width: 100, align: 'right' },
    { prop: 'shotsSinceMaintenance', label: '距保养', width: 90, align: 'right' },
    { prop: 'maintenanceCycle', label: '周期', width: 90, align: 'right' },
    {
      prop: 'maintenanceRate',
      label: '进度',
      minWidth: 180,
      kind: 'progress',
      progress: (row) => clampPercent(row.maintenanceRate),
    },
    { prop: 'status', label: '状态', width: 90, kind: 'tag', tagMap: moldStatusMap },
  ],
  detailItems: [
    { prop: 'code', label: '编码' },
    { prop: 'name', label: '名称' },
    { prop: 'productName', label: '产品', formatter: (_value, row) => formatText(row.productName || row.productId) },
    { prop: 'lifetime', label: '寿命' },
    { prop: 'usedShots', label: '当前模次' },
    { prop: 'maintenanceCycle', label: '保养周期' },
    { prop: 'status', label: '状态', formatter: (value) => resolveTagMeta(moldStatusMap, value).label },
    { prop: 'createdAt', label: '更新时间', formatter: (_value, row) => formatDateTime(row.createdAt) },
  ],
  formRows: [
    [
      { prop: 'code', label: '编码', type: 'input', span: 12, placeholder: '模具编码', disabledOnEdit: true },
      { prop: 'name', label: '名称', type: 'input', span: 12, placeholder: '模具名称' },
    ],
    [
      { prop: 'productId', label: '产品', type: 'select', span: 12, placeholder: '请选择产品', filterable: true, optionsSource: 'products' },
      { prop: 'cavities', label: '穴数', type: 'number', span: 12, min: 1 },
    ],
    [
      { prop: 'lifetime', label: '寿命', type: 'number', span: 12, min: 1 },
      { prop: 'maintenanceCycle', label: '保养周期', type: 'number', span: 12, min: 1 },
    ],
    [
      { prop: 'status', label: '状态', type: 'select', span: 12, options: moldStatusOptions },
    ],
    [
      { prop: 'remark', label: '备注', type: 'textarea', span: 24, rows: 3, placeholder: '备注' },
    ],
  ],
  metrics: [
    { label: '模具总数', resolve: (_rows, total) => total },
    { label: '运行状态', resolve: (rows) => rows.filter((item) => item.status === 'NORMAL').length },
    { label: '保养状态', resolve: (rows) => rows.filter((item) => item.status === 'REPAIR' || Number(item.maintenanceRate || 0) >= 80).length },
    { label: '寿命参数', resolve: (rows) => rows.filter((item) => hasPositiveNumber(item.lifetime) && hasPositiveNumber(item.maintenanceCycle)).length },
    { label: '异常风险', resolve: (rows) => rows.filter((item) => getMoldDataRisk(item)).length },
  ],
  createSearchState: () => ({ status: '' }),
  createFormState: () => ({
    id: 0,
    code: '',
    name: '',
    productId: null,
    cavities: 1,
    lifetime: 500000,
    maintenanceCycle: 50000,
    status: 'NORMAL',
    remark: '',
  }),
  mapFormFromRow: (row: any) => ({
    id: row.id || 0,
    code: row.code || '',
    name: row.name || '',
    productId: row.productId ?? null,
    cavities: Number(row.cavities || 1),
    lifetime: Number(row.lifetime || 500000),
    maintenanceCycle: Number(row.maintenanceCycle || 50000),
    status: row.status || 'NORMAL',
    remark: row.remark || '',
  }),
  buildQuery: ({ page, pageSize, keyword, search }) => ({
    page,
    pageSize,
    keyword: keyword || undefined,
    status: search.status || undefined,
  }),
  buildPayload: (form) => ({
    code: form.code,
    name: form.name,
    productId: form.productId,
    cavities: form.cavities,
    lifetime: form.lifetime,
    maintenanceCycle: form.maintenanceCycle,
    remark: form.remark,
    status: form.status,
  }),
  formRules: {
    code: [{ required: true, message: '请输入模具编码', trigger: 'blur' }],
    name: [{ required: true, message: '请输入模具名称', trigger: 'blur' }],
    productId: [{ required: true, message: '请选择关联产品', trigger: 'change' }],
    cavities: [{ required: true, message: '请输入穴数', trigger: 'blur' }],
  },
}

export const customerPageConfig: BasePageConfig<
  { status: string; creditLevel: string },
  {
    id: number
    code: string
    name: string
    shortName: string
    contact: string
    phone: string
    address: string
    taxNo: string
    invoiceTitle: string
    creditLevel: string
    paymentDays: number
    salesUserId: number | null
    status: string
  }
> = {
  title: '客户管理',
  subtitle: '维护客户档案、联系人、账期和信用等级，支撑销售订单与应收回款。',
  entityName: '客户',
  detailTitle: '客户信息',
  emptyText: '暂无客户',
  emptyDetailText: '请选择一条客户查看详情',
  dialogWidth: '720px',
  formLabelWidth: '96px',
  actionWidth: 210,
  logKeyword: '客户管理',
  searchFields: [
    baseStatusSearchField,
    { prop: 'creditLevel', label: '信用', type: 'select', width: '140px', options: customerCreditOptions },
  ],
  toolbarActions: [toolbar.add, toolbar.refresh, toolbar.export],
  rowActions: [
    { key: 'inspect', label: '详情', type: 'primary', link: true },
    { key: 'edit', label: '编辑', type: 'primary', link: true },
    { key: 'approve', label: '审核', type: 'success', link: true },
    { key: 'delete', label: '删除', type: 'danger', link: true },
  ],
  tableColumns: [
    { prop: 'code', label: '编号', width: 120, fixed: 'left' },
    { prop: 'name', label: '名称', minWidth: 140, fixed: 'left' },
    { prop: 'shortName', label: '简称', width: 120 },
    { prop: 'contact', label: '联系人', width: 100 },
    { prop: 'phone', label: '电话', width: 130 },
    { prop: 'creditLevel', label: '信用', width: 90, kind: 'tag', tagMap: customerCreditMap },
    { prop: 'paymentDays', label: '账期', width: 90, align: 'right', formatter: (value) => `${Number(value || 0)}天` },
    { prop: 'status', label: '状态', width: 90, kind: 'tag', tagMap: baseStatusMap },
  ],
  detailItems: [
    { prop: 'code', label: '编号' },
    { prop: 'name', label: '名称' },
    { prop: 'shortName', label: '简称' },
    { prop: 'contact', label: '联系人' },
    { prop: 'phone', label: '电话' },
    { prop: 'address', label: '地址' },
    { prop: 'taxNo', label: '税号' },
    { prop: 'invoiceTitle', label: '发票抬头' },
    { prop: 'creditLevel', label: '信用等级', formatter: (value) => getCustomerCreditLabel(value) },
    { prop: 'paymentDays', label: '账期', formatter: (value) => `${Number(value || 0)}天` },
    { prop: 'salesUserId', label: '销售员ID' },
    baseCreateStatusDetailItem(),
    { prop: 'updatedAt', label: '更新时间', formatter: (_value, row) => formatDateTime(row.updatedAt || row.createdAt) },
  ],
  formRows: [
    [
      { prop: 'code', label: '编号', type: 'input', span: 12, placeholder: '客户编号', disabledOnEdit: true },
      { prop: 'name', label: '名称', type: 'input', span: 12, placeholder: '客户名称' },
    ],
    [
      { prop: 'shortName', label: '简称', type: 'input', span: 12, placeholder: '简称' },
      { prop: 'contact', label: '联系人', type: 'input', span: 12, placeholder: '联系人' },
    ],
    [
      { prop: 'phone', label: '电话', type: 'input', span: 12, placeholder: '联系电话' },
      { prop: 'creditLevel', label: '信用', type: 'select', span: 12, options: customerCreditOptions },
    ],
    [
      { prop: 'paymentDays', label: '账期', type: 'number', span: 12, min: 0 },
      { prop: 'salesUserId', label: '销售员ID', type: 'number', span: 12, min: 0 },
    ],
    [
      { prop: 'taxNo', label: '税号', type: 'input', span: 24, placeholder: '税号' },
      { prop: 'invoiceTitle', label: '发票抬头', type: 'input', span: 24, placeholder: '发票抬头' },
    ],
    [
      { prop: 'address', label: '地址', type: 'textarea', span: 24, rows: 3, placeholder: '地址' },
      baseCreateStatusFormField(),
    ],
  ],
  metrics: [
    { label: '客户总数', resolve: (_rows, total) => total },
    { label: '联系人', resolve: (rows) => buildCustomerMasterSummary(rows.map(normalizeCustomerMaster)).withContact },
    { label: '税票信息', resolve: (rows) => buildCustomerMasterSummary(rows.map(normalizeCustomerMaster)).withTaxInfo },
    { label: '账期', resolve: (rows) => rows.filter((item) => Number(item.paymentDays || 0) >= 0).length },
    { label: '销售归属', resolve: (rows) => buildCustomerMasterSummary(rows.map(normalizeCustomerMaster)).assignedSales },
    { label: '数据风险', resolve: (rows) => buildCustomerMasterSummary(rows.map(normalizeCustomerMaster)).dataRisks },
  ],
  createSearchState: () => ({ status: '', creditLevel: '' }),
  createFormState: () => ({
    id: 0,
    code: '',
    name: '',
    shortName: '',
    contact: '',
    phone: '',
    address: '',
    taxNo: '',
    invoiceTitle: '',
    creditLevel: 'B',
    paymentDays: 30,
    salesUserId: null,
    status: '1',
  }),
  mapFormFromRow: (row: any) => ({
    id: row.id || 0,
    code: row.code || '',
    name: row.name || '',
    shortName: row.shortName || '',
    contact: row.contact || '',
    phone: row.phone || '',
    address: row.address || '',
    taxNo: row.taxNo || '',
    invoiceTitle: row.invoiceTitle || '',
    creditLevel: row.creditLevel || 'B',
    paymentDays: Number(row.paymentDays ?? 30),
    salesUserId: row.salesUserId ? Number(row.salesUserId) : null,
    status: String(row.status ?? '1'),
  }),
  buildQuery: ({ page, pageSize, keyword, search }) => buildCustomerQuery({
    page,
    pageSize,
    keyword,
    status: search.status,
    creditLevel: search.creditLevel,
  }),
  buildPayload: (form) => buildCustomerPayload(form),
  formRules: ({ isEditing, model }) => {
    const fieldRule = (prop: string, trigger: 'blur' | 'change' = 'blur') => ({
      validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) => {
        const message = validateCustomerMaster({ [prop]: value }, { isEditing: true })
        callback(message ? new Error(message) : undefined)
      },
      trigger,
    })
    const invoiceRule = {
      validator: (_rule: unknown, _value: unknown, callback: (error?: Error) => void) => {
        const message = validateCustomerMaster({
          taxNo: model.taxNo,
          invoiceTitle: model.invoiceTitle,
        }, { isEditing: true })
        callback(message ? new Error(message) : undefined)
      },
      trigger: 'blur',
    }
    const creditRule = {
      validator: (_rule: unknown, _value: unknown, callback: (error?: Error) => void) => {
        const message = validateCustomerMaster({
          creditLevel: model.creditLevel,
          paymentDays: model.paymentDays,
        }, { isEditing: true })
        callback(message ? new Error(message) : undefined)
      },
      trigger: 'change',
    }
    return {
      code: [
        { required: true, message: '请输入客户编号', trigger: 'blur' },
        fieldRule('code'),
      ],
      name: [
        { required: true, message: '请输入客户名称', trigger: 'blur' },
        fieldRule('name'),
      ],
      shortName: [fieldRule('shortName')],
      contact: [fieldRule('contact')],
      phone: [fieldRule('phone')],
      creditLevel: [creditRule],
      paymentDays: [creditRule],
      salesUserId: [fieldRule('salesUserId')],
      taxNo: [invoiceRule],
      invoiceTitle: [invoiceRule],
      address: [fieldRule('address')],
      status: [fieldRule('status', 'change')],
    }
  },
}

export const supplierPageConfig: BasePageConfig<
  { status: string },
  {
    id: number
    code: string
    name: string
    contact: string
    phone: string
    address: string
    mainMaterial: string
    status: string
  }
> = {
  title: '供应商管理',
  subtitle: '维护供应商资质、联系人、账期和风险状态，支撑采购闭环与来料追溯。',
  entityName: '供应商',
  detailTitle: '供应商信息',
  emptyText: '暂无供应商',
  emptyDetailText: '请选择一条供应商查看详情',
  dialogWidth: '680px',
  formLabelWidth: '96px',
  actionWidth: 160,
  logKeyword: '供应商管理',
  searchFields: [baseStatusSearchField],
  toolbarActions: [toolbar.add, toolbar.refresh],
  rowActions: [
    { key: 'inspect', label: '详情', type: 'primary', link: true },
    { key: 'edit', label: '编辑', type: 'primary', link: true },
    { key: 'delete', label: '删除', type: 'danger', link: true },
  ],
  tableColumns: [
    { prop: 'code', label: '编号', width: 120, fixed: 'left' },
    { prop: 'name', label: '名称', minWidth: 140, fixed: 'left' },
    { prop: 'contact', label: '联系人', width: 100 },
    { prop: 'phone', label: '电话', width: 130 },
    { prop: 'mainMaterial', label: '主营材料', minWidth: 150 },
    { prop: 'dataRisk', label: '数据风险', minWidth: 120, formatter: (_value, row) => getSupplierDataRisk(normalizeSupplierMaster(row)) || '-' },
    { prop: 'status', label: '状态', width: 90, kind: 'tag', tagMap: baseStatusMap },
  ],
  detailItems: [
    { prop: 'code', label: '编号' },
    { prop: 'name', label: '名称' },
    { prop: 'contact', label: '联系人' },
    { prop: 'phone', label: '电话' },
    { prop: 'address', label: '地址' },
    { prop: 'mainMaterial', label: '主营材料' },
    { prop: 'dataRisk', label: '数据风险', formatter: (_value, row) => getSupplierDataRisk(normalizeSupplierMaster(row)) || '-' },
    baseCreateStatusDetailItem(),
    { prop: 'updatedAt', label: '更新时间', formatter: (_value, row) => formatDateTime(row.updatedAt || row.createdAt) },
  ],
  formRows: [
    [
      { prop: 'code', label: '编号', type: 'input', span: 12, placeholder: '供应商编号', disabledOnEdit: true },
      { prop: 'name', label: '名称', type: 'input', span: 12, placeholder: '供应商名称' },
    ],
    [
      { prop: 'contact', label: '联系人', type: 'input', span: 12, placeholder: '联系人' },
      { prop: 'phone', label: '电话', type: 'input', span: 12, placeholder: '联系电话' },
    ],
    [
      { prop: 'mainMaterial', label: '主营材料', type: 'input', span: 24, placeholder: '主营材料' },
      { prop: 'address', label: '地址', type: 'textarea', span: 24, rows: 3, placeholder: '地址' },
    ],
    [
      baseCreateStatusFormField(),
    ],
  ],
  metrics: [
    { label: '供应商总数', resolve: (_rows, total) => total },
    { label: '联系人', resolve: (rows) => buildSupplierMasterSummary(rows.map(normalizeSupplierMaster)).withContact },
    { label: '电话', resolve: (rows) => buildSupplierMasterSummary(rows.map(normalizeSupplierMaster)).withPhone },
    { label: '主营材料', resolve: (rows) => buildSupplierMasterSummary(rows.map(normalizeSupplierMaster)).withMainMaterial },
    { label: '数据风险', resolve: (rows) => buildSupplierMasterSummary(rows.map(normalizeSupplierMaster)).dataRisks },
  ],
  createSearchState: () => ({ status: '' }),
  createFormState: () => ({
    id: 0,
    code: '',
    name: '',
    contact: '',
    phone: '',
    address: '',
    mainMaterial: '',
    status: '1',
  }),
  mapFormFromRow: (row: any) => ({
    id: row.id || 0,
    code: row.code || '',
    name: row.name || '',
    contact: row.contact || '',
    phone: row.phone || '',
    address: row.address || '',
    mainMaterial: row.mainMaterial || '',
    status: String(row.status ?? '1'),
  }),
  buildQuery: ({ page, pageSize, keyword, search }) => buildSupplierQuery({
    page,
    pageSize,
    keyword,
    status: search.status,
  }),
  buildPayload: (form) => buildSupplierPayload(form),
  formRules: () => {
    const fieldRule = (prop: string, trigger: 'blur' | 'change' = 'blur') => ({
      validator: (_rule: unknown, value: unknown, callback: (error?: Error) => void) => {
        const message = validateSupplierMaster({ [prop]: value }, { isEditing: true })
        callback(message ? new Error(message) : undefined)
      },
      trigger,
    })
    return {
      code: [
        { required: true, message: '请输入供应商编号', trigger: 'blur' },
        fieldRule('code'),
      ],
      name: [
        { required: true, message: '请输入供应商名称', trigger: 'blur' },
        fieldRule('name'),
      ],
      contact: [fieldRule('contact')],
      phone: [fieldRule('phone')],
      mainMaterial: [fieldRule('mainMaterial')],
      address: [fieldRule('address')],
      status: [fieldRule('status', 'change')],
    }
  },
}

export const userPageConfig: BasePageConfig<
  { status: string; role: string },
  {
    id: number
    username: string
    realName: string
    phone: string
    role: string
    password: string
    status: number
  }
> = {
  title: '用户管理',
  subtitle: '维护管理端账号、角色和启用状态，支撑权限菜单与审计追踪。',
  entityName: '用户',
  detailTitle: '用户信息',
  emptyText: '暂无用户',
  emptyDetailText: '请选择一条用户查看详情',
  dialogWidth: '620px',
  formLabelWidth: '96px',
  actionWidth: 220,
  logKeyword: '用户管理',
  searchFields: [
    baseStatusSearchField,
    { prop: 'role', label: '角色', type: 'select', width: '160px', options: [
      { label: '管理员', value: 'admin' },
      { label: '操作员', value: 'operator' },
      { label: '老板', value: 'boss' },
    ] },
  ],
  toolbarActions: [toolbar.add, toolbar.refresh],
  rowActions: [
    { key: 'inspect', label: '详情', type: 'primary', link: true },
    { key: 'edit', label: '编辑', type: 'primary', link: true },
    { key: 'reset', label: '重置密码', type: 'warning', link: true },
    { key: 'delete', label: '删除', type: 'danger', link: true },
  ],
  tableColumns: [
    { prop: 'username', label: '用户名', width: 140, fixed: 'left' },
    { prop: 'realName', label: '姓名', width: 120, fixed: 'left' },
    { prop: 'phone', label: '手机号', width: 140 },
    { prop: 'role', label: '角色', width: 120 },
    { prop: 'status', label: '状态', width: 90, kind: 'tag', tagMap: baseStatusMap },
    { prop: 'lastLoginAt', label: '最后登录', width: 180, formatter: (_value, row) => formatDateTime(row.lastLoginAt) },
    { prop: 'createdAt', label: '创建时间', width: 180, formatter: (_value, row) => formatDateTime(row.createdAt) },
  ],
  detailItems: [
    { prop: 'username', label: '用户名' },
    { prop: 'realName', label: '姓名' },
    { prop: 'phone', label: '手机号' },
    { prop: 'role', label: '角色' },
    baseCreateStatusDetailItem(),
    { prop: 'lastLoginAt', label: '最后登录', formatter: (_value, row) => formatDateTime(row.lastLoginAt) },
    { prop: 'createdAt', label: '创建时间', formatter: (_value, row) => formatDateTime(row.createdAt) },
  ],
  formRows: [
    [
      { prop: 'username', label: '用户名', type: 'input', span: 12, placeholder: '用户名', disabledOnEdit: true },
      { prop: 'realName', label: '姓名', type: 'input', span: 12, placeholder: '姓名' },
    ],
    [
      { prop: 'phone', label: '手机号', type: 'input', span: 12, placeholder: '手机号' },
      { prop: 'role', label: '角色', type: 'select', span: 12, options: [
        { label: '管理员', value: 'admin' },
        { label: '操作员', value: 'operator' },
        { label: '老板', value: 'boss' },
      ] },
    ],
    [
      { prop: 'password', label: '密码', type: 'input', span: 24, placeholder: '新建必填，编辑留空不修改' },
      { prop: 'status', label: '状态', type: 'select', span: 12, options: [
        { label: '启用', value: 1 },
        { label: '禁用', value: 0 },
      ] },
    ],
  ],
  metrics: [
    { label: '用户总数', resolve: (_rows, total) => total },
    { label: '启用状态', resolve: (rows) => rows.filter((item) => isEnabledStatus(item.status)).length },
    { label: '角色/权限', resolve: (rows) => rows.filter((item) => hasText(item.role)).length },
    { label: '基础完整性', resolve: (rows) => rows.filter((item) => !getUserDataRisk(item)).length },
    { label: '数据风险', resolve: (rows) => rows.filter((item) => getUserDataRisk(item)).length },
  ],
  createSearchState: () => ({ status: '', role: '' }),
  createFormState: () => ({
    id: 0,
    username: '',
    realName: '',
    phone: '',
    role: '',
    password: '',
    status: 1,
  }),
  mapFormFromRow: (row: any) => ({
    id: row.id || 0,
    username: row.username || '',
    realName: row.realName || '',
    phone: row.phone || '',
    role: row.role || '',
    password: '',
    status: Number(row.status ?? 1),
  }),
  buildQuery: ({ page, pageSize, keyword, search }) => ({
    page,
    pageSize,
    keyword: keyword || undefined,
    status: search.status || undefined,
    role: search.role || undefined,
  }),
  buildPayload: (form) => ({
    username: form.username,
    realName: form.realName,
    phone: form.phone,
    role: form.role,
    password: form.password,
    status: String(form.status),
  }),
  formRules: ({ isEditing }) => ({
    username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
    realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
    role: [{ required: true, message: '请选择角色', trigger: 'change' }],
    password: [
      {
        validator: (_rule, value, callback) => {
          const text = String(value ?? '').trim()
          if (!text) {
            if (isEditing) {
              callback()
              return
            }
            callback(new Error('请输入密码'))
            return
          }
          if (text.length < 6) {
            callback(new Error('密码至少 6 位'))
            return
          }
          callback()
        },
        trigger: 'blur',
      },
    ],
  }),
}

export const warehousePageConfig: BasePageConfig<
  { type: string; status: string; workshop: string },
  {
    id: number
    code: string
    name: string
    type: string
    address: string
    factoryCode: string
    workshop: string
    managerId: number | null
    status: string
  }
> = {
  title: '仓库管理',
  subtitle: '维护仓库、库位和启用状态，支撑入库、出库、调拨和库存查询。',
  entityName: '仓库',
  detailTitle: '仓库信息',
  emptyText: '暂无仓库',
  emptyDetailText: '请选择一条仓库查看详情',
  dialogWidth: '720px',
  formLabelWidth: '96px',
  actionWidth: 160,
  logKeyword: '仓库管理',
  searchFields: [
    { prop: 'type', label: '类型', type: 'select', width: '140px', options: [
      { label: '原料仓', value: 'RAW' },
      { label: '半成品仓', value: 'SEMI' },
      { label: '成品仓', value: 'FINISH' },
      { label: '不良品仓', value: 'DEFECT' },
      { label: '报废仓', value: 'SCRAP' },
    ] },
    baseStatusSearchField,
    { prop: 'workshop', label: '车间', type: 'input', width: '180px', placeholder: '车间关键词' },
  ],
  toolbarActions: [toolbar.add, toolbar.refresh],
  rowActions: [
    { key: 'inspect', label: '详情', type: 'primary', link: true },
    { key: 'edit', label: '编辑', type: 'primary', link: true },
    { key: 'delete', label: '删除', type: 'danger', link: true },
  ],
  tableColumns: [
    { prop: 'code', label: '编号', width: 120, fixed: 'left' },
    { prop: 'name', label: '名称', minWidth: 140, fixed: 'left' },
    { prop: 'type', label: '类型', width: 100 },
    { prop: 'factoryCode', label: '工厂', width: 120 },
    { prop: 'workshop', label: '车间', width: 120 },
    { prop: 'managerName', label: '负责人', width: 120 },
    { prop: 'status', label: '状态', width: 90, kind: 'tag', tagMap: baseStatusMap },
  ],
  detailItems: [
    { prop: 'code', label: '编号' },
    { prop: 'name', label: '名称' },
    { prop: 'type', label: '类型' },
    { prop: 'factoryCode', label: '工厂' },
    { prop: 'workshop', label: '车间' },
    { prop: 'address', label: '地址' },
    { prop: 'managerName', label: '负责人', formatter: (_value, row) => formatText(row.managerName || row.managerId) },
    baseCreateStatusDetailItem(),
    { prop: 'updatedAt', label: '更新时间', formatter: (_value, row) => formatDateTime(row.updatedAt || row.createdAt) },
  ],
  formRows: [
    [
      { prop: 'code', label: '编号', type: 'input', span: 12, placeholder: '仓库编号', disabledOnEdit: true },
      { prop: 'name', label: '名称', type: 'input', span: 12, placeholder: '仓库名称' },
    ],
    [
      { prop: 'type', label: '类型', type: 'select', span: 12, options: [
        { label: '原料仓', value: 'RAW' },
        { label: '半成品仓', value: 'SEMI' },
        { label: '成品仓', value: 'FINISH' },
        { label: '不良品仓', value: 'DEFECT' },
        { label: '报废仓', value: 'SCRAP' },
      ] },
      { prop: 'factoryCode', label: '工厂', type: 'input', span: 12, placeholder: '工厂编码' },
    ],
    [
      { prop: 'workshop', label: '车间', type: 'input', span: 12, placeholder: '车间' },
      { prop: 'managerId', label: '负责人ID', type: 'number', span: 12, min: 0 },
    ],
    [
      { prop: 'address', label: '地址', type: 'textarea', span: 24, rows: 3, placeholder: '地址' },
      baseCreateStatusFormField(),
    ],
  ],
  metrics: [
    { label: '仓库总数', resolve: (_rows, total) => total },
    { label: '启用状态', resolve: (rows) => rows.filter((item) => isEnabledStatus(item.status)).length },
    { label: '基础完整性', resolve: (rows) => rows.filter((item) => !getWarehouseDataRisk(item)).length },
    { label: '仓库类型', resolve: (rows) => new Set(rows.map((item) => item.type).filter(Boolean)).size },
    { label: '数据风险', resolve: (rows) => rows.filter((item) => getWarehouseDataRisk(item)).length },
  ],
  createSearchState: () => ({ type: '', status: '', workshop: '' }),
  createFormState: () => ({
    id: 0,
    code: '',
    name: '',
    type: '',
    address: '',
    factoryCode: '',
    workshop: '',
    managerId: null,
    status: '1',
  }),
  mapFormFromRow: (row: any) => ({
    id: row.id || 0,
    code: row.code || '',
    name: row.name || '',
    type: row.type || '',
    address: row.address || '',
    factoryCode: row.factoryCode || '',
    workshop: row.workshop || '',
    managerId: row.managerId ?? null,
    status: String(row.status ?? '1'),
  }),
  buildQuery: ({ page, pageSize, keyword, search }) => ({
    page,
    pageSize,
    keyword: keyword || undefined,
    type: search.type || undefined,
    status: search.status || undefined,
    workshop: search.workshop || undefined,
  }),
  buildPayload: (form) => ({
    code: form.code,
    name: form.name,
    type: form.type,
    address: form.address,
    factoryCode: form.factoryCode,
    workshop: form.workshop,
    managerId: form.managerId ?? undefined,
    status: form.status,
  }),
  formRules: {
    code: [{ required: true, message: '请输入仓库编号', trigger: 'blur' }],
    name: [{ required: true, message: '请输入仓库名称', trigger: 'blur' }],
    type: [{ required: true, message: '请选择仓库类型', trigger: 'change' }],
  },
}
