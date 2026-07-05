import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

// 路由配置（严格按技术文档10.2节）
const routes: RouteRecordRaw[] = [
  {
    path: '/m/login',
    name: 'Login',
    component: () => import('../views/login/index.vue'),
    meta: { title: '登录', requireAuth: false },
  },
  {
    path: '/m/home',
    name: 'Home',
    component: () => import('../views/home/index.vue'),
    meta: { title: '首页', requireAuth: true },
  },
  {
    path: '/m/report',
    name: 'Report',
    component: () => import('../views/report/index.vue'),
    meta: { title: '扫码报工', requireAuth: true },
  },
  {
    path: '/m/my-output',
    name: 'MyOutput',
    component: () => import('../views/my-output/index.vue'),
    meta: { title: '我的产量', requireAuth: true },
  },
  {
    path: '/m/my-salary',
    name: 'MySalary',
    component: () => import('../views/my-salary/index.vue'),
    meta: { title: '我的工资', requireAuth: true },
  },
  {
    path: '/m/qc',
    name: 'Qc',
    component: () => import('../views/qc/index.vue'),
    meta: { title: '质检录入', requireAuth: true },
  },
  {
    path: '/m/stock',
    name: 'Stock',
    component: () => import('../views/stock/index.vue'),
    meta: { title: '库存查询', requireAuth: true },
  },
  {
    path: '/m/inventory',
    name: 'Inventory',
    component: () => import('../views/inventory/index.vue'),
    meta: { title: '盘点录入', requireAuth: true },
  },
  {
    path: '/m/transfer',
    name: 'Transfer',
    component: () => import('../views/transfer/index.vue'),
    meta: { title: '调拨扫码', requireAuth: true },
  },
  {
    path: '/m/notifications',
    name: 'Notifications',
    component: () => import('../views/notifications/index.vue'),
    meta: { title: '消息通知', requireAuth: true },
  },
  {
    path: '/m/todo',
    name: 'Todo',
    component: () => import('../views/todo/index.vue'),
    meta: { title: '待办中心', requireAuth: true },
  },
  {
    path: '/m/offline-tasks',
    name: 'OfflineTasks',
    component: () => import('../views/offline-tasks/index.vue'),
    meta: { title: '离线任务', requireAuth: true },
  },
  // 默认重定向到首页
  {
    path: '/m/injection/:moduleKey?',
    name: 'MobileInjection',
    component: () => import('../views/injection/index.vue'),
    meta: { title: '注塑专业', requireAuth: true },
  },
  {
    path: '/',
    redirect: '/m/home',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 路由守卫：未登录跳转到登录页
router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.requireAuth && !token) {
    next('/m/login')
  } else if (to.path === '/m/login' && token) {
    // 已登录访问登录页，重定向到首页
    next('/m/home')
  } else {
    next()
  }
})

export default router
