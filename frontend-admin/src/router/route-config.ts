export interface AppLeafRoute {
  path: string
  name: string
  title: string
  icon: string
  view: string
  roles?: string[]
}

export interface AppRouteGroup {
  path: string
  title: string
  icon: string
  children: AppLeafRoute[]
}

export interface AppRouteRedirect {
  path: string
  redirect: string
}

const managementRoles = ['admin', 'boss']
const fieldRoles = ['admin', 'boss', 'operator']

export const dashboardRoute: AppLeafRoute = {
  path: '/dashboard',
  name: 'Dashboard',
  title: '工作台',
  icon: 'HomeFilled',
  view: 'dashboard/index.vue',
}

export const loginRoute: AppLeafRoute = {
  path: '/login',
  name: 'Login',
  title: '登录',
  icon: 'User',
  view: 'login/index.vue',
}

export const legacyRouteRedirects: AppRouteRedirect[] = [
  { path: '/report/finance-dashboard', redirect: '/finance/dashboard' },
]

const injectionRoutes = {
  processCard: { path: '/injection/process-card', name: 'InjectionProcessCard', title: '工艺卡管理', icon: 'Document', view: 'injection/module.vue', roles: fieldRoles },
  trialMold: { path: '/injection/trial-mold', name: 'InjectionTrialMold', title: '试模首件', icon: 'Checked', view: 'injection/module.vue', roles: fieldRoles },
  materialMix: { path: '/injection/material-mix', name: 'InjectionMaterialMix', title: '配料烘料', icon: 'Box', view: 'injection/module.vue', roles: fieldRoles },
  batchTrace: { path: '/injection/batch-trace', name: 'InjectionBatchTrace', title: '批次追溯', icon: 'DataLine', view: 'injection/module.vue', roles: fieldRoles },
  startupCheck: { path: '/injection/startup-check', name: 'InjectionStartupCheck', title: '齐套检查', icon: 'CircleCheck', view: 'injection/module.vue', roles: fieldRoles },
  maintenanceOrder: { path: '/injection/maintenance-order', name: 'InjectionMaintenanceOrder', title: '设备维修', icon: 'Tools', view: 'injection/module.vue', roles: fieldRoles },
  moldMaintenancePlan: { path: '/injection/mold-maintenance-plan', name: 'InjectionMoldMaintenancePlan', title: '模具保养看板', icon: 'DataBoard', view: 'injection/module.vue', roles: fieldRoles },
  andonEvent: { path: '/injection/andon-event', name: 'InjectionAndonEvent', title: '安灯异常', icon: 'WarningFilled', view: 'injection/module.vue', roles: fieldRoles },
  labelTemplate: { path: '/injection/label-template', name: 'InjectionLabelTemplate', title: '包装标签', icon: 'Tickets', view: 'injection/module.vue', roles: fieldRoles },
  customerComplaint: { path: '/injection/customer-complaint', name: 'InjectionCustomerComplaint', title: '客诉8D', icon: 'DocumentChecked', view: 'injection/module.vue', roles: fieldRoles },
  oeeRecord: { path: '/injection/oee-record', name: 'InjectionOeeRecord', title: 'OEE分析', icon: 'TrendCharts', view: 'injection/module.vue', roles: fieldRoles },
  processChange: { path: '/injection/process-change', name: 'InjectionProcessChange', title: '工艺变更', icon: 'Operation', view: 'injection/module.vue', roles: fieldRoles },
  moldDevelopment: { path: '/prod/mold-development', name: 'MoldDevelopment', title: '模具开发中心', icon: 'Box', view: 'prod/mold-development.vue', roles: fieldRoles },
  purchaseRequisition: { path: '/injection/purchase-requisition', name: 'InjectionPurchaseRequisition', title: '采购请购', icon: 'ShoppingCart', view: 'injection/module.vue', roles: managementRoles },
} satisfies Record<string, AppLeafRoute>

const equipmentRoutes = {
  spareParts: { path: '/equipment/spare-parts', name: 'SpareParts', title: '备件库存', icon: 'Box', view: 'equipment/spare-parts.vue', roles: fieldRoles },
} satisfies Record<string, AppLeafRoute>

const workbenchRoutes = {
  todos: { path: '/workbench/todos', name: 'WorkbenchTodos', title: '我的待办中心', icon: 'Memo', view: 'workbench/todos.vue', roles: fieldRoles },
  abnormalCenter: { path: '/workbench/abnormal-center', name: 'AbnormalCenter', title: '异常闭环中心', icon: 'WarningFilled', view: 'workbench/abnormal-center.vue', roles: fieldRoles },
  warnings: { path: '/prod/warnings', name: 'ProdWarnings', title: '预警中心', icon: 'Bell', view: 'prod/warnings.vue', roles: fieldRoles },
} satisfies Record<string, AppLeafRoute>

const baseRoutes = {
  warehouses: { path: 'warehouses', name: 'Warehouses', title: '仓库档案', icon: 'House', view: 'base/warehouses.vue', roles: managementRoles },
  products: { path: 'products', name: 'Products', title: '产品档案', icon: 'Goods', view: 'base/products.vue', roles: managementRoles },
  customers: { path: 'customers', name: 'Customers', title: '客户档案', icon: 'UserFilled', view: 'base/customers.vue', roles: managementRoles },
  suppliers: { path: 'suppliers', name: 'Suppliers', title: '供应商档案', icon: 'Van', view: 'base/suppliers.vue', roles: managementRoles },
  machines: { path: 'machines', name: 'Machines', title: '机台档案', icon: 'Monitor', view: 'base/machines.vue', roles: fieldRoles },
  molds: { path: 'molds', name: 'Molds', title: '模具档案', icon: 'Box', view: 'base/molds.vue', roles: fieldRoles },
} satisfies Record<string, AppLeafRoute>

const systemRoutes = {
  users: { path: '/base/users', name: 'Users', title: '用户管理', icon: 'User', view: 'base/users.vue', roles: managementRoles },
  notifications: { path: '/system/notifications', name: 'Notifications', title: '消息中心', icon: 'Bell', view: 'system/notifications.vue', roles: fieldRoles },
} satisfies Record<string, AppLeafRoute>

const purchaseRoutes = {
  orders: { path: '/purchase/orders', name: 'PurchaseOrders', title: '采购订单', icon: 'DocumentChecked', view: 'purchase/orders.vue', roles: managementRoles },
} satisfies Record<string, AppLeafRoute>

const qualityRoutes = {
  processInspection: { path: '/qc/process-inspection', name: 'ProcessInspection', title: '过程巡检', icon: 'Checked', view: 'qc/process-inspection.vue', roles: fieldRoles },
  defectDisposal: { path: '/qc/defect-disposal', name: 'DefectDisposal', title: '不良品处置', icon: 'WarningFilled', view: 'qc/defect-disposal.vue', roles: fieldRoles },
} satisfies Record<string, AppLeafRoute>

export const routeGroups: AppRouteGroup[] = [
  {
    path: '/workbench',
    title: '待办中心',
    icon: 'Odometer',
    children: [
      workbenchRoutes.todos,
      workbenchRoutes.abnormalCenter,
      workbenchRoutes.warnings,
      systemRoutes.notifications,
    ],
  },
  {
    path: '/base',
    title: '基础资料',
    icon: 'FolderOpened',
    children: [
      baseRoutes.products,
      baseRoutes.customers,
      baseRoutes.suppliers,
      baseRoutes.warehouses,
      baseRoutes.machines,
      baseRoutes.molds,
    ],
  },
  {
    path: '/sale',
    title: '销售管理',
    icon: 'ShoppingCart',
    children: [
      { path: 'orders', name: 'SaleOrders', title: '销售订单', icon: 'Document', view: 'sale/orders.vue', roles: managementRoles },
      { path: 'order-risks', name: 'SaleOrderRisks', title: '交期风险', icon: 'WarningFilled', view: 'sale/order-risks.vue', roles: managementRoles },
      { path: 'deliveries', name: 'Deliveries', title: '发货管理', icon: 'Promotion', view: 'sale/deliveries.vue', roles: managementRoles },
      { path: 'payments', name: 'Payments', title: '回款登记', icon: 'Coin', view: 'sale/payments.vue', roles: managementRoles },
    ],
  },
  {
    path: '/prod',
    title: '生产管理',
    icon: 'SetUp',
    children: [
      { path: 'orders', name: 'ProdOrders', title: '生产订单', icon: 'List', view: 'prod/orders.vue', roles: fieldRoles },
      injectionRoutes.processCard,
      injectionRoutes.processChange,
      { path: 'productization', name: 'ProductizationCenter', title: '产品化中心', icon: 'Operation', view: 'prod/productization.vue', roles: managementRoles },
    ],
  },
  {
    path: '/site',
    title: '现场执行',
    icon: 'EditPen',
    children: [
      { path: '/prod/reports', name: 'ProdReports', title: '扫码报工', icon: 'EditPen', view: 'prod/reports.vue', roles: fieldRoles },
      injectionRoutes.startupCheck,
      injectionRoutes.trialMold,
      injectionRoutes.materialMix,
      injectionRoutes.labelTemplate,
      injectionRoutes.andonEvent,
    ],
  },
  {
    path: '/equipment',
    title: '设备模具',
    icon: 'Tools',
    children: [
      {
        path: '/prod/machine-inspection-records',
        name: 'MachineInspectionRecords',
        title: '设备点检记录',
        icon: 'Checked',
        view: 'prod/machine-inspection-records.vue',
        roles: fieldRoles,
      },
      injectionRoutes.maintenanceOrder,
      { path: '/prod/downtime', name: 'Downtime', title: '停机记录', icon: 'WarningFilled', view: 'prod/downtime.vue', roles: fieldRoles },
      equipmentRoutes.spareParts,
      injectionRoutes.moldDevelopment,
      { path: '/prod/mount-records', name: 'MountRecords', title: '上下模记录', icon: 'Stamp', view: 'prod/mount-records.vue', roles: fieldRoles },
      injectionRoutes.moldMaintenancePlan,
      {
        path: '/prod/mold-maintenance-records',
        name: 'MoldMaintenanceRecords',
        title: '模具保养记录',
        icon: 'Notebook',
        view: 'prod/mold-maintenance-records.vue',
        roles: fieldRoles,
      },
    ],
  },
  {
    path: '/qc',
    title: '质量追溯',
    icon: 'CircleCheck',
    children: [
      { path: 'records', name: 'QcRecords', title: '质检记录', icon: 'DocumentChecked', view: 'qc/records.vue', roles: fieldRoles },
      qualityRoutes.processInspection,
      qualityRoutes.defectDisposal,
      { path: 'defect-analysis', name: 'DefectAnalysis', title: '不良分析', icon: 'DataAnalysis', view: 'qc/defect-analysis.vue', roles: fieldRoles },
      injectionRoutes.batchTrace,
      injectionRoutes.customerComplaint,
    ],
  },
  {
    path: '/purchase',
    title: '采购管理',
    icon: 'ShoppingCart',
    children: [
      injectionRoutes.purchaseRequisition,
      purchaseRoutes.orders,
      { path: '/stock/in-purchase', name: 'InPurchase', title: '采购入库', icon: 'Bottom', view: 'stock/in-purchase.vue', roles: managementRoles },
    ],
  },
  {
    path: '/stock',
    title: '仓库管理',
    icon: 'House',
    children: [
      { path: 'query', name: 'StockQuery', title: '库存查询', icon: 'Search', view: 'stock/query.vue', roles: managementRoles },
      { path: 'ledger', name: 'StockLedger', title: '库存台账', icon: 'Notebook', view: 'stock/ledger.vue', roles: managementRoles },
      { path: 'out-picking', name: 'OutPicking', title: '生产领料', icon: 'Top', view: 'stock/out-picking.vue', roles: fieldRoles },
      { path: 'in-produce', name: 'InProduce', title: '成品入库', icon: 'BottomLeft', view: 'stock/in-produce.vue', roles: fieldRoles },
      { path: 'out-sale', name: 'OutSale', title: '销售出库', icon: 'TopRight', view: 'stock/out-sale.vue', roles: managementRoles },
      { path: 'transfer', name: 'StockTransfer', title: '仓库调拨', icon: 'Sort', view: 'stock/transfer.vue', roles: managementRoles },
      { path: 'inventory', name: 'StockInventory', title: '盘点单', icon: 'Tickets', view: 'stock/inventory.vue', roles: managementRoles },
    ],
  },
  {
    path: '/salary',
    title: '工资管理',
    icon: 'Wallet',
    children: [
      { path: 'prices', name: 'SalaryPrices', title: '计件单价', icon: 'PriceTag', view: 'salary/prices.vue', roles: managementRoles },
      { path: 'daily', name: 'SalaryDaily', title: '日工资', icon: 'Calendar', view: 'salary/daily.vue', roles: managementRoles },
      { path: 'monthly', name: 'SalaryMonthly', title: '月工资汇总', icon: 'DataBoard', view: 'salary/monthly.vue', roles: managementRoles },
      { path: 'adjust', name: 'SalaryAdjust', title: '奖惩管理', icon: 'Medal', view: 'salary/adjust.vue', roles: managementRoles },
    ],
  },
  {
    path: '/finance',
    title: '财务管理',
    icon: 'Coin',
    children: [
      { path: 'dashboard', name: 'FinanceDashboard', title: '财务总览', icon: 'TrendCharts', view: 'finance/dashboard.vue', roles: managementRoles },
      { path: 'expenses', name: 'Expenses', title: '费用支出', icon: 'Money', view: 'finance/expenses.vue', roles: managementRoles },
      { path: 'statements', name: 'Statements', title: '对账单', icon: 'DocumentCopy', view: 'finance/statements.vue', roles: managementRoles },
    ],
  },
  {
    path: '/report',
    title: '报表中心',
    icon: 'TrendCharts',
    children: [
      { path: 'boss-dashboard', name: 'BossDashboard', title: '老板驾驶舱', icon: 'Odometer', view: 'report/boss-dashboard.vue', roles: managementRoles },
      { path: 'production-board', name: 'ProductionBoard', title: '生产看板', icon: 'DataLine', view: 'report/production-board.vue', roles: fieldRoles },
      injectionRoutes.oeeRecord,
      { path: 'quality-board', name: 'QualityBoard', title: '质量看板', icon: 'PieChart', view: 'report/quality-board.vue', roles: fieldRoles },
    ],
  },
  {
    path: '/system',
    title: '系统管理',
    icon: 'Setting',
    children: [
      systemRoutes.users,
      { path: 'config', name: 'SystemConfig', title: '系统配置', icon: 'Tools', view: 'system/config.vue', roles: managementRoles },
      { path: 'integration', name: 'SystemIntegration', title: '集成中心', icon: 'Link', view: 'system/integration.vue', roles: managementRoles },
      { path: 'backup', name: 'SystemBackup', title: '云库运维', icon: 'FolderChecked', view: 'system/backup.vue', roles: managementRoles },
      { path: 'logs', name: 'SystemLogs', title: '操作日志', icon: 'Memo', view: 'system/logs.vue', roles: managementRoles },
    ],
  },
]

export function buildRoutePath(parentPath: string, childPath: string) {
  if (childPath.startsWith('/')) return childPath
  return `${parentPath}/${childPath}`
}

export function findRouteGroupByPath(routePath: string) {
  const normalizedPath = routePath.split(/[?#]/, 1)[0]
  return routeGroups.find((group) =>
    group.children.some((item) => buildRoutePath(group.path, item.path) === normalizedPath),
  ) || routeGroups.find((group) => normalizedPath === group.path || normalizedPath.startsWith(`${group.path}/`))
}
