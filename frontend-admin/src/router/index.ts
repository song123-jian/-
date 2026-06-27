import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import Layout from '@/layout/index.vue'

// 静态路由
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/',
    component: Layout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '工作台', icon: 'HomeFilled' },
      },
    ],
  },
  // 基础资料
  {
    path: '/base',
    component: Layout,
    meta: { title: '基础资料', icon: 'FolderOpened' },
    children: [
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/base/users.vue'),
        meta: { title: '用户管理', icon: 'User' },
      },
      {
        path: 'machines',
        name: 'Machines',
        component: () => import('@/views/base/machines.vue'),
        meta: { title: '机台管理', icon: 'Monitor' },
      },
      {
        path: 'warehouses',
        name: 'Warehouses',
        component: () => import('@/views/base/warehouses.vue'),
        meta: { title: '仓库管理', icon: 'House' },
      },
      {
        path: 'molds',
        name: 'Molds',
        component: () => import('@/views/base/molds.vue'),
        meta: { title: '模具管理', icon: 'Box' },
      },
      {
        path: 'products',
        name: 'Products',
        component: () => import('@/views/base/products.vue'),
        meta: { title: '产品管理', icon: 'Goods' },
      },
      {
        path: 'customers',
        name: 'Customers',
        component: () => import('@/views/base/customers.vue'),
        meta: { title: '客户管理', icon: 'UserFilled' },
      },
      {
        path: 'suppliers',
        name: 'Suppliers',
        component: () => import('@/views/base/suppliers.vue'),
        meta: { title: '供应商管理', icon: 'Van' },
      },
    ],
  },
  // 销售管理
  {
    path: '/sale',
    component: Layout,
    meta: { title: '销售管理', icon: 'ShoppingCart' },
    children: [
      {
        path: 'orders',
        name: 'SaleOrders',
        component: () => import('@/views/sale/orders.vue'),
        meta: { title: '销售订单', icon: 'Document' },
      },
      {
        path: 'deliveries',
        name: 'Deliveries',
        component: () => import('@/views/sale/deliveries.vue'),
        meta: { title: '发货管理', icon: 'Promotion' },
      },
      {
        path: 'payments',
        name: 'Payments',
        component: () => import('@/views/sale/payments.vue'),
        meta: { title: '回款登记', icon: 'Money' },
      },
    ],
  },
  // 生产管理
  {
    path: '/prod',
    component: Layout,
    meta: { title: '生产管理', icon: 'SetUp' },
    children: [
      {
        path: 'orders',
        name: 'ProdOrders',
        component: () => import('@/views/prod/orders.vue'),
        meta: { title: '生产订单', icon: 'List' },
      },
      {
        path: 'reports',
        name: 'ProdReports',
        component: () => import('@/views/prod/reports.vue'),
        meta: { title: '报工记录', icon: 'EditPen' },
      },
      {
        path: 'downtime',
        name: 'Downtime',
        component: () => import('@/views/prod/downtime.vue'),
        meta: { title: '停机记录', icon: 'WarningFilled' },
      },
      {
        path: 'mount-records',
        name: 'MountRecords',
        component: () => import('@/views/prod/mount-records.vue'),
        meta: { title: '上下模记录', icon: 'Stamp' },
      },
      {
        path: 'mold-maintenance-records',
        name: 'MoldMaintenanceRecords',
        component: () => import('@/views/prod/mold-maintenance-records.vue'),
        meta: { title: '模具保养记录', icon: 'Notebook' },
      },
      {
        path: 'warnings',
        name: 'WarningCenter',
        component: () => import('@/views/prod/warnings.vue'),
        meta: { title: '预警中心', icon: 'Bell' },
      },
      {
        path: 'machine-inspection-records',
        name: 'MachineInspectionRecords',
        component: () => import('@/views/prod/machine-inspection-records.vue'),
        meta: { title: '设备点检记录', icon: 'Checklist' },
      },
    ],
  },
  {
    path: '/qc',
    component: Layout,
    meta: { title: '品质管理', icon: 'CircleCheck' },
    children: [
      {
        path: 'records',
        name: 'QcRecords',
        component: () => import('@/views/qc/records.vue'),
        meta: { title: '质检记录', icon: 'DocumentChecked' },
      },
      {
        path: 'defect-analysis',
        name: 'DefectAnalysis',
        component: () => import('@/views/qc/defect-analysis.vue'),
        meta: { title: '不良分析', icon: 'DataAnalysis' },
      },
    ],
  },
  // 仓库管理
  {
    path: '/stock',
    component: Layout,
    meta: { title: '仓库管理', icon: 'House' },
    children: [
      {
        path: 'query',
        name: 'StockQuery',
        component: () => import('@/views/stock/query.vue'),
        meta: { title: '库存查询', icon: 'Search' },
      },
      {
        path: 'ledger',
        name: 'StockLedger',
        component: () => import('@/views/stock/ledger.vue'),
        meta: { title: '库存台账', icon: 'Notebook' },
      },
      {
        path: 'in-purchase',
        name: 'InPurchase',
        component: () => import('@/views/stock/in-purchase.vue'),
        meta: { title: '采购入库', icon: 'Bottom' },
      },
      {
        path: 'out-picking',
        name: 'OutPicking',
        component: () => import('@/views/stock/out-picking.vue'),
        meta: { title: '生产领料', icon: 'Top' },
      },
      {
        path: 'in-produce',
        name: 'InProduce',
        component: () => import('@/views/stock/in-produce.vue'),
        meta: { title: '成品入库', icon: 'BottomLeft' },
      },
      {
        path: 'out-sale',
        name: 'OutSale',
        component: () => import('@/views/stock/out-sale.vue'),
        meta: { title: '销售出库', icon: 'TopRight' },
      },
      {
        path: 'transfer',
        name: 'StockTransfer',
        component: () => import('@/views/stock/transfer.vue'),
        meta: { title: '仓库调拨', icon: 'Sort' },
      },
      {
        path: 'inventory',
        name: 'StockInventory',
        component: () => import('@/views/stock/inventory.vue'),
        meta: { title: '盘点单', icon: 'Tickets' },
      },
    ],
  },
  // 工资管理
  {
    path: '/salary',
    component: Layout,
    meta: { title: '工资管理', icon: 'Wallet' },
    children: [
      {
        path: 'prices',
        name: 'SalaryPrices',
        component: () => import('@/views/salary/prices.vue'),
        meta: { title: '计件单价', icon: 'PriceTag' },
      },
      {
        path: 'daily',
        name: 'SalaryDaily',
        component: () => import('@/views/salary/daily.vue'),
        meta: { title: '日工资', icon: 'Calendar' },
      },
      {
        path: 'monthly',
        name: 'SalaryMonthly',
        component: () => import('@/views/salary/monthly.vue'),
        meta: { title: '月工资汇总', icon: 'DataBoard' },
      },
      {
        path: 'adjust',
        name: 'SalaryAdjust',
        component: () => import('@/views/salary/adjust.vue'),
        meta: { title: '奖惩管理', icon: 'Medal' },
      },
    ],
  },
  // 财务管理
  {
    path: '/finance',
    component: Layout,
    meta: { title: '财务管理', icon: 'Coin' },
    children: [
      {
        path: 'expenses',
        name: 'Expenses',
        component: () => import('@/views/finance/expenses.vue'),
        meta: { title: '费用支出', icon: 'Refund' },
      },
      {
        path: 'statements',
        name: 'Statements',
        component: () => import('@/views/finance/statements.vue'),
        meta: { title: '对账单', icon: 'DocumentCopy' },
      },
    ],
  },
  {
    path: '/report',
    component: Layout,
    meta: { title: '报表中心', icon: 'TrendCharts' },
    children: [
      {
        path: 'boss-dashboard',
        name: 'BossDashboard',
        component: () => import('@/views/report/boss-dashboard.vue'),
        meta: { title: '老板驾驶舱', icon: 'Odometer' },
      },
      {
        path: 'production-board',
        name: 'ProductionBoard',
        component: () => import('@/views/report/production-board.vue'),
        meta: { title: '生产看板', icon: 'DataLine' },
      },
      {
        path: 'quality-board',
        name: 'QualityBoard',
        component: () => import('@/views/report/quality-board.vue'),
        meta: { title: '品质看板', icon: 'PieChart' },
      },
    ],
  },
  {
    path: '/system',
    component: Layout,
    meta: { title: '系统管理', icon: 'Setting' },
    children: [
      {
        path: 'logs',
        name: 'SystemLogs',
        component: () => import('@/views/system/logs.vue'),
        meta: { title: '操作日志', icon: 'Memo' },
      },
      {
        path: 'config',
        name: 'SystemConfig',
        component: () => import('@/views/system/config.vue'),
        meta: { title: '系统配置', icon: 'Tools' },
      },
      {
        path: 'integration',
        name: 'SystemIntegration',
        component: () => import('@/views/system/integration.vue'),
        meta: { title: '集成中心', icon: 'Link' },
      },
      {
        path: 'backup',
        name: 'SystemBackup',
        component: () => import('@/views/system/backup.vue'),
        meta: { title: '数据备份', icon: 'FolderChecked' },
      },
      {
        path: 'notifications',
        name: 'Notifications',
        component: () => import('@/views/system/notifications.vue'),
        meta: { title: '消息中心', icon: 'Bell' },
      },
    ],
  },
  // 404 页面
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 导航守卫：未登录跳转到登录页
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  if (to.path === '/login') {
    next()
  } else if (!token) {
    next('/login')
  } else {
    next()
  }
})

export default router
