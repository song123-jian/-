export interface AppLeafRoute {
  path: string
  name: string
  title: string
  icon: string
  view: string
}

export interface AppRouteGroup {
  path: string
  title: string
  icon: string
  children: AppLeafRoute[]
}

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

const injectionRoutes = {
  processCard: { path: '/injection/process-card', name: 'InjectionProcessCard', title: '工艺卡管理', icon: 'Document', view: 'injection/module.vue' },
  trialMold: { path: '/injection/trial-mold', name: 'InjectionTrialMold', title: '试模首件', icon: 'Checked', view: 'injection/module.vue' },
  materialMix: { path: '/injection/material-mix', name: 'InjectionMaterialMix', title: '配料烘料', icon: 'Box', view: 'injection/module.vue' },
  batchTrace: { path: '/injection/batch-trace', name: 'InjectionBatchTrace', title: '批次追溯', icon: 'DataLine', view: 'injection/module.vue' },
  startupCheck: { path: '/injection/startup-check', name: 'InjectionStartupCheck', title: '齐套检查', icon: 'CircleCheck', view: 'injection/module.vue' },
  maintenanceOrder: { path: '/injection/maintenance-order', name: 'InjectionMaintenanceOrder', title: '设备维修', icon: 'Tools', view: 'injection/module.vue' },
  moldMaintenancePlan: { path: '/injection/mold-maintenance-plan', name: 'InjectionMoldMaintenancePlan', title: '模具保养看板', icon: 'DataBoard', view: 'injection/module.vue' },
  andonEvent: { path: '/injection/andon-event', name: 'InjectionAndonEvent', title: '安灯异常', icon: 'WarningFilled', view: 'injection/module.vue' },
  labelTemplate: { path: '/injection/label-template', name: 'InjectionLabelTemplate', title: '包装标签', icon: 'Tickets', view: 'injection/module.vue' },
  customerComplaint: { path: '/injection/customer-complaint', name: 'InjectionCustomerComplaint', title: '客诉8D', icon: 'DocumentChecked', view: 'injection/module.vue' },
  oeeRecord: { path: '/injection/oee-record', name: 'InjectionOeeRecord', title: 'OEE分析', icon: 'TrendCharts', view: 'injection/module.vue' },
  processChange: { path: '/injection/process-change', name: 'InjectionProcessChange', title: '工艺变更', icon: 'Operation', view: 'injection/module.vue' },
  purchaseRequisition: { path: '/injection/purchase-requisition', name: 'InjectionPurchaseRequisition', title: '采购请购', icon: 'ShoppingCart', view: 'injection/module.vue' },
} satisfies Record<string, AppLeafRoute>

const equipmentRoutes = {
  spareParts: { path: '/equipment/spare-parts', name: 'SpareParts', title: '备件库存', icon: 'Box', view: 'equipment/spare-parts.vue' },
} satisfies Record<string, AppLeafRoute>

const workbenchRoutes = {
  todos: { path: '/workbench/todos', name: 'WorkbenchTodos', title: '我的待办中心', icon: 'Memo', view: 'workbench/todos.vue' },
} satisfies Record<string, AppLeafRoute>

const purchaseRoutes = {
  orders: { path: '/purchase/orders', name: 'PurchaseOrders', title: '采购订单', icon: 'DocumentChecked', view: 'purchase/orders.vue' },
} satisfies Record<string, AppLeafRoute>

const qualityRoutes = {
  processInspection: { path: '/qc/process-inspection', name: 'ProcessInspection', title: '过程巡检', icon: 'Checked', view: 'qc/process-inspection.vue' },
  defectDisposal: { path: '/qc/defect-disposal', name: 'DefectDisposal', title: '不良品处置', icon: 'WarningFilled', view: 'qc/defect-disposal.vue' },
} satisfies Record<string, AppLeafRoute>

const unmatchedInjectionRoutes: AppLeafRoute[] = []

export const routeGroups: AppRouteGroup[] = [
  {
    path: '/workbench',
    title: '工作台',
    icon: 'Odometer',
    children: [
      workbenchRoutes.todos,
    ],
  },
  {
    path: '/base',
    title: '基础资料',
    icon: 'FolderOpened',
    children: [
      { path: 'users', name: 'Users', title: '用户管理', icon: 'User', view: 'base/users.vue' },
      { path: 'warehouses', name: 'Warehouses', title: '仓库管理', icon: 'House', view: 'base/warehouses.vue' },
      { path: 'products', name: 'Products', title: '产品管理', icon: 'Goods', view: 'base/products.vue' },
      { path: 'customers', name: 'Customers', title: '客户管理', icon: 'UserFilled', view: 'base/customers.vue' },
    ],
  },
  {
    path: '/sale',
    title: '销售管理',
    icon: 'ShoppingCart',
    children: [
      { path: 'orders', name: 'SaleOrders', title: '销售订单', icon: 'Document', view: 'sale/orders.vue' },
      { path: 'deliveries', name: 'Deliveries', title: '发货管理', icon: 'Promotion', view: 'sale/deliveries.vue' },
      { path: 'payments', name: 'Payments', title: '回款登记', icon: 'Coin', view: 'sale/payments.vue' },
    ],
  },
  {
    path: '/prod',
    title: '生产管理',
    icon: 'SetUp',
    children: [
      { path: 'orders', name: 'ProdOrders', title: '生产订单', icon: 'List', view: 'prod/orders.vue' },
      injectionRoutes.processCard,
      injectionRoutes.processChange,
      { path: 'productization', name: 'ProductizationCenter', title: '产品化中心', icon: 'Operation', view: 'prod/productization.vue' },
    ],
  },
  {
    path: '/site',
    title: '现场执行',
    icon: 'EditPen',
    children: [
      { path: '/prod/reports', name: 'ProdReports', title: '扫码报工', icon: 'EditPen', view: 'prod/reports.vue' },
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
      { path: '/base/machines', name: 'Machines', title: '机台管理', icon: 'Monitor', view: 'base/machines.vue' },
      { path: '/base/molds', name: 'Molds', title: '模具管理', icon: 'Box', view: 'base/molds.vue' },
      {
        path: '/prod/machine-inspection-records',
        name: 'MachineInspectionRecords',
        title: '设备点检记录',
        icon: 'Checked',
        view: 'prod/machine-inspection-records.vue',
      },
      injectionRoutes.maintenanceOrder,
      equipmentRoutes.spareParts,
      { path: '/prod/downtime', name: 'Downtime', title: '停机记录', icon: 'WarningFilled', view: 'prod/downtime.vue' },
      { path: '/prod/mount-records', name: 'MountRecords', title: '上下模记录', icon: 'Stamp', view: 'prod/mount-records.vue' },
      {
        path: '/prod/mold-maintenance-records',
        name: 'MoldMaintenanceRecords',
        title: '模具保养记录',
        icon: 'Notebook',
        view: 'prod/mold-maintenance-records.vue',
      },
      injectionRoutes.moldMaintenancePlan,
    ],
  },
  ...(unmatchedInjectionRoutes.length
    ? [{
        path: '/injection',
        title: '注塑专业',
        icon: 'SetUp',
        children: unmatchedInjectionRoutes,
      }]
    : []),
  {
    path: '/qc',
    title: '质量追溯',
    icon: 'CircleCheck',
    children: [
      { path: 'records', name: 'QcRecords', title: '质检记录', icon: 'DocumentChecked', view: 'qc/records.vue' },
      qualityRoutes.processInspection,
      qualityRoutes.defectDisposal,
      { path: 'defect-analysis', name: 'DefectAnalysis', title: '不良分析', icon: 'DataAnalysis', view: 'qc/defect-analysis.vue' },
      injectionRoutes.batchTrace,
      injectionRoutes.customerComplaint,
    ],
  },
  {
    path: '/purchase',
    title: '采购管理',
    icon: 'ShoppingCart',
    children: [
      { path: '/base/suppliers', name: 'Suppliers', title: '供应商管理', icon: 'Van', view: 'base/suppliers.vue' },
      injectionRoutes.purchaseRequisition,
      purchaseRoutes.orders,
      { path: '/stock/in-purchase', name: 'InPurchase', title: '采购入库', icon: 'Bottom', view: 'stock/in-purchase.vue' },
    ],
  },
  {
    path: '/stock',
    title: '仓库管理',
    icon: 'House',
    children: [
      { path: 'query', name: 'StockQuery', title: '库存查询', icon: 'Search', view: 'stock/query.vue' },
      { path: 'ledger', name: 'StockLedger', title: '库存台账', icon: 'Notebook', view: 'stock/ledger.vue' },
      { path: 'out-picking', name: 'OutPicking', title: '生产领料', icon: 'Top', view: 'stock/out-picking.vue' },
      { path: 'in-produce', name: 'InProduce', title: '成品入库', icon: 'BottomLeft', view: 'stock/in-produce.vue' },
      { path: 'out-sale', name: 'OutSale', title: '销售出库', icon: 'TopRight', view: 'stock/out-sale.vue' },
      { path: 'transfer', name: 'StockTransfer', title: '仓库调拨', icon: 'Sort', view: 'stock/transfer.vue' },
      { path: 'inventory', name: 'StockInventory', title: '盘点单', icon: 'Tickets', view: 'stock/inventory.vue' },
    ],
  },
  {
    path: '/salary',
    title: '工资管理',
    icon: 'Wallet',
    children: [
      { path: 'prices', name: 'SalaryPrices', title: '计件单价', icon: 'PriceTag', view: 'salary/prices.vue' },
      { path: 'daily', name: 'SalaryDaily', title: '日工资', icon: 'Calendar', view: 'salary/daily.vue' },
      { path: 'monthly', name: 'SalaryMonthly', title: '月工资汇总', icon: 'DataBoard', view: 'salary/monthly.vue' },
      { path: 'adjust', name: 'SalaryAdjust', title: '奖惩管理', icon: 'Medal', view: 'salary/adjust.vue' },
    ],
  },
  {
    path: '/finance',
    title: '财务管理',
    icon: 'Coin',
    children: [
      { path: 'expenses', name: 'Expenses', title: '费用支出', icon: 'Money', view: 'finance/expenses.vue' },
      { path: 'statements', name: 'Statements', title: '对账单', icon: 'DocumentCopy', view: 'finance/statements.vue' },
    ],
  },
  {
    path: '/report',
    title: '报表中心',
    icon: 'TrendCharts',
    children: [
      { path: 'boss-dashboard', name: 'BossDashboard', title: '老板驾驶舱', icon: 'Odometer', view: 'report/boss-dashboard.vue' },
      { path: 'production-board', name: 'ProductionBoard', title: '生产看板', icon: 'DataLine', view: 'report/production-board.vue' },
      injectionRoutes.oeeRecord,
      { path: 'quality-board', name: 'QualityBoard', title: '质量看板', icon: 'PieChart', view: 'report/quality-board.vue' },
    ],
  },
  {
    path: '/system',
    title: '系统管理',
    icon: 'Setting',
    children: [
      { path: 'logs', name: 'SystemLogs', title: '操作日志', icon: 'Memo', view: 'system/logs.vue' },
      { path: 'config', name: 'SystemConfig', title: '系统配置', icon: 'Tools', view: 'system/config.vue' },
      { path: 'integration', name: 'SystemIntegration', title: '集成中心', icon: 'Link', view: 'system/integration.vue' },
      { path: 'backup', name: 'SystemBackup', title: '云库运维', icon: 'FolderChecked', view: 'system/backup.vue' },
      { path: 'notifications', name: 'Notifications', title: '消息中心', icon: 'Bell', view: 'system/notifications.vue' },
    ],
  },
]

export function buildRoutePath(parentPath: string, childPath: string) {
  if (childPath.startsWith('/')) return childPath
  return `${parentPath}/${childPath}`
}
