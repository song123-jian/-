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

export const routeGroups: AppRouteGroup[] = [
  {
    path: '/base',
    title: '基础资料',
    icon: 'FolderOpened',
    children: [
      { path: 'users', name: 'Users', title: '用户管理', icon: 'User', view: 'base/users.vue' },
      { path: 'machines', name: 'Machines', title: '机台管理', icon: 'Monitor', view: 'base/machines.vue' },
      { path: 'warehouses', name: 'Warehouses', title: '仓库管理', icon: 'House', view: 'base/warehouses.vue' },
      { path: 'molds', name: 'Molds', title: '模具管理', icon: 'Box', view: 'base/molds.vue' },
      { path: 'products', name: 'Products', title: '产品管理', icon: 'Goods', view: 'base/products.vue' },
      { path: 'customers', name: 'Customers', title: '客户管理', icon: 'UserFilled', view: 'base/customers.vue' },
      { path: 'suppliers', name: 'Suppliers', title: '供应商管理', icon: 'Van', view: 'base/suppliers.vue' },
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
      { path: 'reports', name: 'ProdReports', title: '报工记录', icon: 'EditPen', view: 'prod/reports.vue' },
      { path: 'downtime', name: 'Downtime', title: '停机记录', icon: 'WarningFilled', view: 'prod/downtime.vue' },
      { path: 'mount-records', name: 'MountRecords', title: '上下模记录', icon: 'Stamp', view: 'prod/mount-records.vue' },
      {
        path: 'mold-maintenance-records',
        name: 'MoldMaintenanceRecords',
        title: '模具保养记录',
        icon: 'Notebook',
        view: 'prod/mold-maintenance-records.vue',
      },
      {
        path: 'machine-inspection-records',
        name: 'MachineInspectionRecords',
        title: '设备点检记录',
        icon: 'Checked',
        view: 'prod/machine-inspection-records.vue',
      },
      { path: 'warnings', name: 'WarningCenter', title: '预警中心', icon: 'Bell', view: 'prod/warnings.vue' },
    ],
  },
  {
    path: '/qc',
    title: '质量管理',
    icon: 'CircleCheck',
    children: [
      { path: 'records', name: 'QcRecords', title: '质检记录', icon: 'DocumentChecked', view: 'qc/records.vue' },
      { path: 'defect-analysis', name: 'DefectAnalysis', title: '不良分析', icon: 'DataAnalysis', view: 'qc/defect-analysis.vue' },
    ],
  },
  {
    path: '/stock',
    title: '仓库管理',
    icon: 'House',
    children: [
      { path: 'query', name: 'StockQuery', title: '库存查询', icon: 'Search', view: 'stock/query.vue' },
      { path: 'ledger', name: 'StockLedger', title: '库存台账', icon: 'Notebook', view: 'stock/ledger.vue' },
      { path: 'in-purchase', name: 'InPurchase', title: '采购入库', icon: 'Bottom', view: 'stock/in-purchase.vue' },
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
      { path: 'backup', name: 'SystemBackup', title: '数据备份', icon: 'FolderChecked', view: 'system/backup.vue' },
      { path: 'notifications', name: 'Notifications', title: '消息中心', icon: 'Bell', view: 'system/notifications.vue' },
    ],
  },
]

export function buildRoutePath(parentPath: string, childPath: string) {
  return `${parentPath}/${childPath}`
}
