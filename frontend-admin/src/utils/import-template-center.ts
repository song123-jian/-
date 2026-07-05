export type ImportTemplateColumn = {
  key: string
  label: string
  required?: boolean
  example?: string | number
  note?: string
}

export type ImportTemplateDefinition = {
  code: string
  name: string
  category: '主数据' | '期初库存' | '价格' | '订单' | '生产'
  description: string
  columns: ImportTemplateColumn[]
}

export const IMPORT_TEMPLATE_DEFINITIONS: ImportTemplateDefinition[] = [
  {
    code: 'product-master',
    name: '产品主数据模板',
    category: '主数据',
    description: '产品编码、名称、规格、单位、安全库存统一导入。',
    columns: [
      { key: 'product_code', label: '产品编码', required: true, example: 'P-1001' },
      { key: 'product_name', label: '产品名称', required: true, example: '透明外壳' },
      { key: 'spec', label: '规格型号', example: 'ABS-01' },
      { key: 'unit', label: '单位', required: true, example: '个' },
      { key: 'safe_stock', label: '安全库存', example: 200 },
    ],
  },
  {
    code: 'initial-stock',
    name: '期初库存模板',
    category: '期初库存',
    description: '仓库、库位、批次、供应商和数量一次性初始化。',
    columns: [
      { key: 'warehouse_code', label: '仓库编码', required: true, example: 'WH-01' },
      { key: 'location_code', label: '库位编码', required: true, example: 'A-01-01' },
      { key: 'product_code', label: '产品/原料编码', required: true, example: 'M-ABS' },
      { key: 'batch_no', label: '批次号', example: 'B20260704' },
      { key: 'supplier_code', label: '供应商编码', example: 'S-001' },
      { key: 'qty', label: '期初数量', required: true, example: 1000 },
    ],
  },
  {
    code: 'piece-price',
    name: '计件价格模板',
    category: '价格',
    description: '按产品、工序、生效日期维护计件单价。',
    columns: [
      { key: 'product_code', label: '产品编码', required: true, example: 'P-1001' },
      { key: 'process_name', label: '工序', required: true, example: '注塑' },
      { key: 'price', label: '计件单价', required: true, example: 0.12 },
      { key: 'effective_date', label: '生效日期', required: true, example: '2026-07-01' },
      { key: 'expire_date', label: '失效日期', example: '2026-12-31' },
    ],
  },
  {
    code: 'sale-order',
    name: '销售订单模板',
    category: '订单',
    description: '客户订单、交期、产品和数量统一导入。',
    columns: [
      { key: 'order_no', label: '销售订单号', required: true, example: 'SO-20260704-001' },
      { key: 'customer_code', label: '客户编码', required: true, example: 'C-001' },
      { key: 'product_code', label: '产品编码', required: true, example: 'P-1001' },
      { key: 'qty', label: '订单数量', required: true, example: 5000 },
      { key: 'delivery_date', label: '交货日期', required: true, example: '2026-07-20' },
    ],
  },
  {
    code: 'bom-basic',
    name: 'BOM基础模板',
    category: '生产',
    description: '产品与原料用量、损耗率维护后用于基础 MRP 缺料提示。',
    columns: [
      { key: 'product_code', label: '成品编码', required: true, example: 'P-1001' },
      { key: 'material_code', label: '原料编码', required: true, example: 'M-ABS' },
      { key: 'qty_per_parent', label: '单位用量', required: true, example: 0.025 },
      { key: 'loss_rate', label: '损耗率', example: '3%' },
      { key: 'unit', label: '单位', example: 'kg' },
    ],
  },
  {
    code: 'production-schedule',
    name: '生产排程模板',
    category: '生产',
    description: '工单、机台、模具、计划时间和交期导入后用于冲突检查。',
    columns: [
      { key: 'order_no', label: '工单编号', required: true, example: 'MO-001' },
      { key: 'machine_code', label: '机台编码', required: true, example: 'A-01' },
      { key: 'mold_code', label: '模具编码', required: true, example: 'MOLD-01' },
      { key: 'start_time', label: '计划开始', required: true, example: '2026-07-04 08:00' },
      { key: 'end_time', label: '计划结束', required: true, example: '2026-07-04 16:00' },
      { key: 'due_time', label: '交期', required: true, example: '2026-07-05 18:00' },
    ],
  },
]

function csvEscape(value: unknown) {
  const text = value === undefined || value === null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function listImportTemplates(keyword = '') {
  const text = keyword.trim().toLowerCase()
  if (!text) return [...IMPORT_TEMPLATE_DEFINITIONS]
  return IMPORT_TEMPLATE_DEFINITIONS.filter((item) => {
    return [item.code, item.name, item.category, item.description]
      .some((value) => String(value).toLowerCase().includes(text))
  })
}

export function findImportTemplate(code: string) {
  return IMPORT_TEMPLATE_DEFINITIONS.find((item) => item.code === code)
}

export function buildImportTemplateCsv(code: string) {
  const template = findImportTemplate(code)
  if (!template) throw new Error('未找到导入模板')
  const headers = template.columns.map((column) => column.label)
  const keys = template.columns.map((column) => column.key)
  const examples = template.columns.map((column) => column.example ?? '')
  return [
    keys.map(csvEscape).join(','),
    headers.map(csvEscape).join(','),
    examples.map(csvEscape).join(','),
  ].join('\n')
}

export function summarizeImportTemplates(templates: ImportTemplateDefinition[] = IMPORT_TEMPLATE_DEFINITIONS) {
  return templates.reduce(
    (summary, item) => {
      summary.total += 1
      summary.requiredColumnCount += item.columns.filter((column) => column.required).length
      summary.categories[item.category] = (summary.categories[item.category] || 0) + 1
      return summary
    },
    { total: 0, requiredColumnCount: 0, categories: {} as Record<string, number> },
  )
}
