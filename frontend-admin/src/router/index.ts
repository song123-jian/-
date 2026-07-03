import { createRouter, createWebHistory } from 'vue-router'
import { createAppRoutes } from './build-routes'
import { getStoredToken } from '@/utils/auth-storage'

const viewModules = import.meta.glob('../views/**/*.vue') as Record<string, () => Promise<unknown>>

const router = createRouter({
  history: createWebHistory(),
  routes: createAppRoutes(viewModules),
})

router.beforeEach((to, _from, next) => {
  const token = getStoredToken()
  if (to.path === '/login') {
    next()
  } else if (!token) {
    next(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  } else {
    next()
  }
})

export default router
