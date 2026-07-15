import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import { createAppRoutes } from './build-routes'
import { synchronizeSupabaseAuthSession } from '@/utils/auth-session'
import { buildLoginUrl, resolvePostLoginPath } from '@/utils/auth-route'
import { canAccessRoles, getStoredUserRoles } from '@/utils/role-access'

const viewModules = import.meta.glob('../views/**/*.vue') as Record<string, () => Promise<unknown>>

const router = createRouter({
  history: window.location.protocol === 'file:' ? createWebHashHistory() : createWebHistory(),
  routes: createAppRoutes(viewModules),
})

router.beforeEach(async (to, _from, next) => {
  const authenticated = await synchronizeSupabaseAuthSession()
  const redirectQuery = Array.isArray(to.query.redirect) ? to.query.redirect[0] : to.query.redirect
  if (to.path === '/login') {
    if (authenticated) {
      next(resolvePostLoginPath(typeof redirectQuery === 'string' ? redirectQuery : null))
      return
    }
    next()
  } else if (!authenticated) {
    next(buildLoginUrl(to.fullPath))
  } else if (!canAccessRoles(getStoredUserRoles(), to.meta.roles as string[] | undefined)) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
