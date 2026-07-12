import type { RouteRecordRaw } from 'vue-router'
import Layout from '@/layout/index.vue'
import { buildRoutePath, dashboardRoute, legacyRouteRedirects, loginRoute, routeGroups } from './route-config'

type ViewLoader = Record<string, () => Promise<unknown>>

function resolveView(loaderMap: ViewLoader, view: string) {
  const key = `../views/${view}`
  const loader = loaderMap[key]
  if (!loader) {
    throw new Error(`Missing view module: ${key}`)
  }
  return loader
}

export function createAppRoutes(loaderMap: ViewLoader): RouteRecordRaw[] {
  return [
    {
      path: loginRoute.path,
      name: loginRoute.name,
      component: resolveView(loaderMap, loginRoute.view),
      meta: { title: loginRoute.title },
    },
    {
      path: '/',
      component: Layout,
      redirect: dashboardRoute.path,
      children: [
        {
          path: dashboardRoute.path.replace(/^\//, ''),
          name: dashboardRoute.name,
          component: resolveView(loaderMap, dashboardRoute.view),
          meta: { title: dashboardRoute.title, icon: dashboardRoute.icon, roles: dashboardRoute.roles },
        },
      ],
    },
    ...routeGroups.map((group) => ({
      path: group.path,
      component: Layout,
      meta: { title: group.title, icon: group.icon },
      children: group.children.map((item) => ({
        path: item.path,
        name: item.name,
        component: resolveView(loaderMap, item.view),
        meta: { title: item.title, icon: item.icon, roles: item.roles },
      })),
    })),
    ...legacyRouteRedirects.map((item) => ({
      path: item.path,
      redirect: item.redirect,
    })),
    {
      path: '/:pathMatch(.*)*',
      redirect: dashboardRoute.path,
    },
  ]
}

export { buildRoutePath, dashboardRoute, routeGroups }
