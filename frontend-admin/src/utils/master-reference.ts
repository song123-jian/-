export type MasterResource =
  | 'users'
  | 'warehouses'
  | 'products'
  | 'customers'
  | 'suppliers'
  | 'machines'
  | 'molds'

export type MasterReferenceRule = {
  table: string
  column: string
  label: string
  domain: string
}

export type MasterReferenceHit = MasterReferenceRule & {
  count: number
}

type MasterResourceMeta = {
  table: string
  label: string
  aliases: string[]
}

export const MASTER_RESOURCE_META: Record<MasterResource, MasterResourceMeta> = {
  users: {
    table: 'sys_user',
    label: '用户',
    aliases: ['user', 'sys_user'],
  },
  warehouses: {
    table: 'warehouse',
    label: '仓库',
    aliases: ['warehouse'],
  },
  products: {
    table: 'product',
    label: '产品',
    aliases: ['product'],
  },
  customers: {
    table: 'customer',
    label: '客户',
    aliases: ['customer'],
  },
  suppliers: {
    table: 'supplier',
    label: '供应商',
    aliases: ['supplier'],
  },
  machines: {
    table: 'machine',
    label: '机台',
    aliases: ['machine'],
  },
  molds: {
    table: 'mold',
    label: '模具',
    aliases: ['mold'],
  },
}

export const MASTER_REFERENCE_RULES: Record<MasterResource, MasterReferenceRule[]> = {
  users: [
    { table: 'sale_order', column: 'sales_user_id', label: '销售订单', domain: '销售' },
    { table: 'sale_order', column: 'created_by', label: '销售订单创建人', domain: '销售' },
    { table: 'prod_order', column: 'created_by', label: '生产订单创建人', domain: '生产' },
    { table: 'prod_report', column: 'user_id', label: '报工记录', domain: '生产' },
    { table: 'qc_record', column: 'checker_id', label: '质检记录', domain: '质量' },
    { table: 'salary_daily', column: 'user_id', label: '日工资', domain: '工资' },
    { table: 'salary_adjust', column: 'user_id', label: '工资调整', domain: '工资' },
    { table: 'notification', column: 'user_id', label: '消息通知', domain: '系统' },
  ],
  warehouses: [
    { table: 'stock', column: 'warehouse_id', label: '库存余额', domain: '库存' },
    { table: 'stock_move', column: 'warehouse_id', label: '库存流水', domain: '库存' },
    { table: 'stock_move', column: 'to_warehouse_id', label: '调入流水', domain: '库存' },
    { table: 'stock_inventory', column: 'warehouse_id', label: '盘点单', domain: '库存' },
    { table: 'stock_transfer', column: 'from_warehouse_id', label: '调出单', domain: '库存' },
    { table: 'stock_transfer', column: 'to_warehouse_id', label: '调入单', domain: '库存' },
    { table: 'warehouse_location', column: 'warehouse_id', label: '库位', domain: '库存' },
  ],
  products: [
    { table: 'product', column: 'raw_material_id', label: '原料规则', domain: '生产' },
    { table: 'prod_order', column: 'product_id', label: '生产订单', domain: '生产' },
    { table: 'stock', column: 'product_id', label: '库存余额', domain: '库存' },
    { table: 'stock_move', column: 'product_id', label: '库存流水', domain: '库存' },
    { table: 'stock_inventory_item', column: 'product_id', label: '盘点明细', domain: '库存' },
    { table: 'sale_order_item', column: 'product_id', label: '销售明细', domain: '销售' },
    { table: 'piece_price', column: 'product_id', label: '计件工资价格', domain: '工资' },
    { table: 'qc_record', column: 'product_id', label: '质检记录', domain: '质量' },
    { table: 'mold', column: 'product_id', label: '模具档案', domain: '模具' },
    { table: 'process_card', column: 'product_id', label: '工艺卡', domain: '工艺' },
    { table: 'process_card', column: 'material_id', label: '工艺卡原料', domain: '工艺' },
    { table: 'material_mix_order', column: 'product_id', label: '拌料单', domain: '生产' },
    { table: 'customer_complaint', column: 'product_id', label: '客诉记录', domain: '质量' },
    { table: 'purchase_requisition', column: 'material_id', label: '采购申请', domain: '采购' },
  ],
  customers: [
    { table: 'product', column: 'customer_id', label: '产品档案', domain: '基础资料' },
    { table: 'sale_order', column: 'customer_id', label: '销售订单', domain: '销售' },
    { table: 'delivery_order', column: 'customer_id', label: '发货单', domain: '发货' },
    { table: 'payment_record', column: 'customer_id', label: '回款记录', domain: '回款' },
    { table: 'customer_complaint', column: 'customer_id', label: '客诉记录', domain: '质量' },
  ],
  suppliers: [
    { table: 'material_batch', column: 'supplier_id', label: '物料批次', domain: '批次' },
    { table: 'purchase_requisition', column: 'supplier_id', label: '采购申请', domain: '采购' },
  ],
  machines: [
    { table: 'prod_order', column: 'machine_id', label: '生产订单', domain: '排产' },
    { table: 'prod_report', column: 'machine_id', label: '报工记录', domain: '报工' },
    { table: 'oee_record', column: 'machine_id', label: 'OEE记录', domain: 'OEE' },
    { table: 'downtime_record', column: 'machine_id', label: '停机记录', domain: '异常' },
    { table: 'machine_inspection_record', column: 'machine_id', label: '点检记录', domain: '保养' },
    { table: 'mold_mount_record', column: 'machine_id', label: '上下模记录', domain: '排产' },
    { table: 'process_card', column: 'machine_id', label: '工艺卡', domain: '工艺' },
    { table: 'trial_mold_record', column: 'machine_id', label: '试模记录', domain: '工艺' },
    { table: 'maintenance_order', column: 'machine_id', label: '维修工单', domain: '保养' },
  ],
  molds: [
    { table: 'prod_order', column: 'mold_id', label: '生产订单', domain: '排产' },
    { table: 'prod_report', column: 'mold_id', label: '报工记录', domain: '报工' },
    { table: 'mold_mount_record', column: 'mold_id', label: '上下模记录', domain: '排产' },
    { table: 'mold_maintenance_record', column: 'mold_id', label: '模具保养记录', domain: '保养' },
    { table: 'mold_maintenance_plan', column: 'mold_id', label: '模具保养计划', domain: '保养' },
    { table: 'process_card', column: 'mold_id', label: '工艺卡', domain: '工艺' },
    { table: 'trial_mold_record', column: 'mold_id', label: '试模记录', domain: '工艺' },
  ],
}

export function resolveMasterResource(input: string): MasterResource | undefined {
  const normalized = String(input || '').replace(/^\/+|\/+$/g, '').replace(/-/g, '_')
  return (Object.keys(MASTER_RESOURCE_META) as MasterResource[]).find((key) => {
    const meta = MASTER_RESOURCE_META[key]
    return key === normalized || meta.table === normalized || meta.aliases.includes(normalized)
  })
}

export function getMasterResourceLabel(input: string) {
  const resource = resolveMasterResource(input)
  return resource ? MASTER_RESOURCE_META[resource].label : '主数据'
}

export function getMasterReferenceRules(input: string) {
  const resource = resolveMasterResource(input)
  return resource ? MASTER_REFERENCE_RULES[resource] : []
}

export function buildMasterReferenceMessage(input: string, hits: MasterReferenceHit[]) {
  const label = getMasterResourceLabel(input)
  const domains = Array.from(new Set(hits.map((item) => item.domain))).join('、')
  const references = hits
    .slice(0, 4)
    .map((item) => `${item.label}${item.count > 0 ? `(${item.count})` : ''}`)
    .join('、')
  const suffix = hits.length > 4 ? `等 ${hits.length} 类业务数据` : '业务数据'
  return `${label}已被${domains || '业务'}引用：${references}${hits.length > 4 ? '等' : ''}，不能删除。请先停用该${label}，或解除相关${suffix}后再删除。`
}
