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
  kind?: 'text' | 'tag' | 'progress'
  tagMap?: Record<string, TagMeta>
  formatter?: (value: any, row: any) => string
  progress?: (row: any) => number
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

export type MetricSpec = {
  label: string
  resolve: (rows: any[], total: number) => string | number
}

export type BasePageConfig<TSearch extends Record<string, any>, TForm extends Record<string, any>> = {
  title: string
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
  formRules: FormRules
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
    color: string
    status: string
  }
> = {
  title: '产品管理',
  entityName: '产品',
  detailTitle: '产品关联系息',
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
    { prop: 'code', label: '编码', width: 120 },
    { prop: 'name', label: '名称', minWidth: 140 },
    { prop: 'type', label: '类型', width: 100, kind: 'tag', tagMap: productTypeMap },
    { prop: 'spec', label: '规格', width: 140 },
    { prop: 'unit', label: '单位', width: 90 },
    { prop: 'piecePrice', label: '单价', width: 110, formatter: (_value, row) => formatMoneyText(row.piecePrice) },
    { prop: 'safeStock', label: '安全库存', width: 100 },
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
    { prop: 'rawMaterialUsage', label: '原料用量' },
    { prop: 'color', label: '备注' },
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
      { prop: 'piecePrice', label: '单价', type: 'number', span: 12, min: 0, precision: 2 },
      { prop: 'safeStock', label: '安全库存', type: 'number', span: 12, min: 0 },
    ],
    [
      { prop: 'weightG', label: '重量(g)', type: 'number', span: 12, min: 0, precision: 2 },
      { prop: 'rawMaterialUsage', label: '原料用量', type: 'number', span: 12, min: 0, precision: 2 },
    ],
    [
      { prop: 'color', label: '备注', type: 'input', span: 24, placeholder: '颜色 / 备注标签' },
      baseCreateStatusFormField(),
    ],
  ],
  metrics: [
    { label: '产品总数', resolve: (_rows, total) => total },
    { label: '原料', resolve: (rows) => rows.filter((item) => item.type === 'RAW').length },
    { label: '半成品', resolve: (rows) => rows.filter((item) => item.type === 'SEMI').length },
    { label: '成品', resolve: (rows) => rows.filter((item) => item.type === 'FINISH').length },
    { label: '低库存', resolve: (rows) => rows.filter((item) => Number(item.safeStock || 0) > 0 && Number(item.safeStock || 0) <= 100).length },
  ],
  createSearchState: () => ({ type: '', status: '' }),
  createFormState: () => ({
    id: 0,
    code: '',
    name: '',
    type: 'FINISH',
    spec: '',
    unit: 'PCS',
    piecePrice: 0,
    safeStock: 0,
    weightG: 0,
    rawMaterialUsage: 0,
    color: '',
    status: '1',
  }),
  mapFormFromRow: (row: any) => ({
    id: row.id || 0,
    code: row.code || '',
    name: row.name || '',
    type: row.type || 'FINISH',
    spec: row.spec || '',
    unit: row.unit || 'PCS',
    piecePrice: Number(row.piecePrice || 0),
    safeStock: Number(row.safeStock || 0),
    weightG: Number(row.weightG || 0),
    rawMaterialUsage: Number(row.rawMaterialUsage || 0),
    color: row.color || '',
    status: String(row.status ?? '1'),
  }),
  buildQuery: ({ page, pageSize, keyword, search }) => ({
    page,
    pageSize,
    keyword: keyword || undefined,
    type: search.type || undefined,
    status: search.status || undefined,
  }),
  buildPayload: (form) => ({
    code: form.code,
    name: form.name,
    type: form.type,
    spec: form.spec,
    unit: form.unit,
    piecePrice: form.piecePrice,
    safeStock: form.safeStock,
    weightG: form.weightG,
    rawMaterialUsage: form.rawMaterialUsage,
    color: form.color,
    status: form.status,
  }),
  formRules: {
    code: [{ required: true, message: '请输入产品编码', trigger: 'blur' }],
    name: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
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
  entityName: '机台',
  detailTitle: '机台关联系息',
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
    { prop: 'code', label: '编码', width: 120 },
    { prop: 'name', label: '名称', minWidth: 140 },
    { prop: 'model', label: '型号', width: 120 },
    { prop: 'tonnage', label: '吨位', width: 90 },
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
    { label: '运行中', resolve: (rows) => rows.filter((item) => item.status === 'RUNNING').length },
    { label: '空闲', resolve: (rows) => rows.filter((item) => item.status === 'IDLE').length },
    { label: '维护中', resolve: (rows) => rows.filter((item) => item.status === 'MAINTENANCE').length },
    { label: '停机', resolve: (rows) => rows.filter((item) => item.status === 'STOPPED').length },
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
  entityName: '模具',
  detailTitle: '模具关联系息',
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
    { prop: 'code', label: '编码', width: 130 },
    { prop: 'name', label: '名称', minWidth: 140 },
    { prop: 'productName', label: '产品', minWidth: 140 },
    { prop: 'cavities', label: '穴数', width: 80 },
    { prop: 'usedShots', label: '累计模次', width: 100 },
    { prop: 'shotsSinceMaintenance', label: '距保养', width: 90 },
    { prop: 'maintenanceCycle', label: '周期', width: 90 },
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
      baseCreateStatusFormField(),
    ],
    [
      { prop: 'remark', label: '备注', type: 'textarea', span: 24, rows: 3, placeholder: '备注' },
    ],
  ],
  metrics: [
    { label: '模具总数', resolve: (_rows, total) => total },
    { label: '正常', resolve: (rows) => rows.filter((item) => item.status === 'NORMAL').length },
    { label: '维护中', resolve: (rows) => rows.filter((item) => item.status === 'REPAIR').length },
    { label: '报废', resolve: (rows) => rows.filter((item) => item.status === 'SCRAP').length },
    { label: '临近保养', resolve: (rows) => rows.filter((item) => Number(item.maintenanceRate || 0) >= 80).length },
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
  { status: string },
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
    salesUserId: number
    status: string
  }
> = {
  title: '客户管理',
  entityName: '客户',
  detailTitle: '客户信息',
  emptyText: '暂无客户',
  emptyDetailText: '请选择一条客户查看详情',
  dialogWidth: '720px',
  formLabelWidth: '96px',
  actionWidth: 160,
  logKeyword: '客户管理',
  searchFields: [baseStatusSearchField],
  toolbarActions: [toolbar.add, toolbar.refresh],
  rowActions: [
    { key: 'inspect', label: '详情', type: 'primary', link: true },
    { key: 'edit', label: '编辑', type: 'primary', link: true },
    { key: 'delete', label: '删除', type: 'danger', link: true },
  ],
  tableColumns: [
    { prop: 'code', label: '编号', width: 120 },
    { prop: 'name', label: '名称', minWidth: 140 },
    { prop: 'shortName', label: '简称', width: 120 },
    { prop: 'contact', label: '联系人', width: 100 },
    { prop: 'phone', label: '电话', width: 130 },
    { prop: 'creditLevel', label: '信用', width: 90 },
    { prop: 'paymentDays', label: '账期', width: 90 },
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
    { prop: 'creditLevel', label: '信用等级' },
    { prop: 'paymentDays', label: '账期' },
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
      { prop: 'creditLevel', label: '信用', type: 'input', span: 12, placeholder: '信用等级' },
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
    { label: '启用', resolve: (rows) => rows.filter((item) => String(item.status) === '1').length },
    { label: '禁用', resolve: (rows) => rows.filter((item) => String(item.status) === '0').length },
    { label: '含税信息', resolve: (rows) => rows.filter((item) => item.taxNo || item.invoiceTitle).length },
    { label: '有账期', resolve: (rows) => rows.filter((item) => Number(item.paymentDays || 0) > 0).length },
  ],
  createSearchState: () => ({ status: '' }),
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
    creditLevel: '',
    paymentDays: 0,
    salesUserId: 0,
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
    creditLevel: row.creditLevel || '',
    paymentDays: Number(row.paymentDays || 0),
    salesUserId: Number(row.salesUserId || 0),
    status: String(row.status ?? '1'),
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
    shortName: form.shortName,
    contact: form.contact,
    phone: form.phone,
    address: form.address,
    taxNo: form.taxNo,
    invoiceTitle: form.invoiceTitle,
    creditLevel: form.creditLevel,
    paymentDays: form.paymentDays || undefined,
    salesUserId: form.salesUserId || undefined,
    status: form.status,
  }),
  formRules: {
    code: [{ required: true, message: '请输入客户编号', trigger: 'blur' }],
    name: [{ required: true, message: '请输入客户名称', trigger: 'blur' }],
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
    { prop: 'code', label: '编号', width: 120 },
    { prop: 'name', label: '名称', minWidth: 140 },
    { prop: 'contact', label: '联系人', width: 100 },
    { prop: 'phone', label: '电话', width: 130 },
    { prop: 'mainMaterial', label: '主营材料', minWidth: 150 },
    { prop: 'status', label: '状态', width: 90, kind: 'tag', tagMap: baseStatusMap },
  ],
  detailItems: [
    { prop: 'code', label: '编号' },
    { prop: 'name', label: '名称' },
    { prop: 'contact', label: '联系人' },
    { prop: 'phone', label: '电话' },
    { prop: 'address', label: '地址' },
    { prop: 'mainMaterial', label: '主营材料' },
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
    { label: '启用', resolve: (rows) => rows.filter((item) => String(item.status) === '1').length },
    { label: '禁用', resolve: (rows) => rows.filter((item) => String(item.status) === '0').length },
    { label: '主营材料', resolve: (rows) => rows.filter((item) => item.mainMaterial).length },
    { label: '有联系人', resolve: (rows) => rows.filter((item) => item.contact || item.phone).length },
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
  buildQuery: ({ page, pageSize, keyword, search }) => ({
    page,
    pageSize,
    keyword: keyword || undefined,
    status: search.status || undefined,
  }),
  buildPayload: (form) => ({
    code: form.code,
    name: form.name,
    contact: form.contact,
    phone: form.phone,
    address: form.address,
    mainMaterial: form.mainMaterial,
    status: form.status,
  }),
  formRules: {
    code: [{ required: true, message: '请输入供应商编号', trigger: 'blur' }],
    name: [{ required: true, message: '请输入供应商名称', trigger: 'blur' }],
  },
}

export const userPageConfig: BasePageConfig<
  { status: string },
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
  entityName: '用户',
  detailTitle: '用户信息',
  emptyText: '暂无用户',
  emptyDetailText: '请选择一条用户查看详情',
  dialogWidth: '620px',
  formLabelWidth: '96px',
  actionWidth: 220,
  logKeyword: '用户管理',
  searchFields: [baseStatusSearchField],
  toolbarActions: [toolbar.add, toolbar.refresh],
  rowActions: [
    { key: 'inspect', label: '详情', type: 'primary', link: true },
    { key: 'edit', label: '编辑', type: 'primary', link: true },
    { key: 'reset', label: '重置密码', type: 'warning', link: true },
    { key: 'delete', label: '删除', type: 'danger', link: true },
  ],
  tableColumns: [
    { prop: 'username', label: '用户名', width: 140 },
    { prop: 'realName', label: '姓名', width: 120 },
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
      { prop: 'password', label: '密码', type: 'input', span: 24, placeholder: '初始密码' },
      { prop: 'status', label: '状态', type: 'select', span: 12, options: [
        { label: '启用', value: 1 },
        { label: '禁用', value: 0 },
      ] },
    ],
  ],
  metrics: [
    { label: '用户总数', resolve: (_rows, total) => total },
    { label: '启用', resolve: (rows) => rows.filter((item) => String(item.status) === '1').length },
    { label: '禁用', resolve: (rows) => rows.filter((item) => String(item.status) === '0').length },
    { label: '管理员', resolve: (rows) => rows.filter((item) => item.role === 'admin').length },
    { label: '操作员', resolve: (rows) => rows.filter((item) => item.role === 'operator').length },
  ],
  createSearchState: () => ({ status: '' }),
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
  }),
  buildPayload: (form) => ({
    username: form.username,
    realName: form.realName,
    phone: form.phone,
    role: form.role,
    password: form.password,
    status: String(form.status),
  }),
  formRules: {
    username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
    realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
    role: [{ required: true, message: '请选择角色', trigger: 'change' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  },
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
  }
> = {
  title: '仓库管理',
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
    { prop: 'code', label: '编号', width: 120 },
    { prop: 'name', label: '名称', minWidth: 140 },
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
    { label: '启用', resolve: (rows) => rows.filter((item) => String(item.status) === '1' || String(item.status) === '启用').length },
    { label: '禁用', resolve: (rows) => rows.filter((item) => String(item.status) === '0' || String(item.status) === '禁用').length },
    { label: '成品仓', resolve: (rows) => rows.filter((item) => item.type === 'FINISH').length },
    { label: '有负责人', resolve: (rows) => rows.filter((item) => item.managerId).length },
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
  }),
  formRules: {
    code: [{ required: true, message: '请输入仓库编号', trigger: 'blur' }],
    name: [{ required: true, message: '请输入仓库名称', trigger: 'blur' }],
    type: [{ required: true, message: '请选择仓库类型', trigger: 'change' }],
  },
}
