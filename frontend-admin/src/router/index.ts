import { createRouter, createWebHistory } from 'vue-router'
import { createAppRoutes } from './build-routes'
import { getStoredToken } from '@/utils/auth-storage'
import { buildLoginUrl, resolvePostLoginPath } from '@/utils/auth-route'

const viewModules = import.meta.glob('../views/**/*.vue') as Record<string, () => Promise<unknown>>

const router = createRouter({
  history: createWebHistory(),
  routes: createAppRoutes(viewModules),
})

router.beforeEach((to, _from, next) => {
  const token = getStoredToken()
  const redirectQuery = Array.isArray(to.query.redirect) ? to.query.redirect[0] : to.query.redirect
  if (to.path === '/login') {
    if (token) {
      next(resolvePostLoginPath(typeof redirectQuery === 'string' ? redirectQuery : null))
      return
    }
    next()
  } else if (!token) {
    next(buildLoginUrl(to.fullPath))
  } else {
    next()
  }
})

export default router
