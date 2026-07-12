import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRoutePath,
  dashboardRoute,
  findRouteGroupByPath,
  legacyRouteRedirects,
  loginRoute,
  routeGroups,
} from '../frontend-admin/src/router/route-config.ts'

function getGroup(path) {
  const group = routeGroups.find((item) => item.path === path)
  assert.ok(group, `missing route group: ${path}`)
  return group
}

function getRoute(group, name) {
  const route = group.children.find((item) => item.name === name)
  assert.ok(route, `missing ${name} in ${group.path}`)
  return route
}

function allFinalRoutes() {
  return [
    loginRoute,
    dashboardRoute,
    ...routeGroups.flatMap((group) => group.children.map((route) => ({
      ...route,
      path: buildRoutePath(group.path, route.path),
    }))),
  ]
}

function duplicates(values) {
  const seen = new Set()
  const repeated = new Set()

  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }

  return [...repeated].sort()
}

describe('菜单信息架构回归', () => {
  it('将用户管理归入系统管理，并从基础资料移除', () => {
    const systemGroup = getGroup('/system')
    const baseGroup = getGroup('/base')
    const users = getRoute(systemGroup, 'Users')

    assert.equal(users.title, '用户管理')
    assert.equal(users.view, 'base/users.vue')
    assert.equal(baseGroup.children.some((item) => item.name === 'Users'), false)
  })

  it('将消息中心归入待办中心，并从系统管理移除', () => {
    const workbenchGroup = getGroup('/workbench')
    const systemGroup = getGroup('/system')
    const notifications = getRoute(workbenchGroup, 'Notifications')

    assert.equal(notifications.title, '消息中心')
    assert.equal(notifications.view, 'system/notifications.vue')
    assert.equal(systemGroup.children.some((item) => item.name === 'Notifications'), false)
  })

  it('将跨库存和模具的预警中心归入待办中心', () => {
    const workbenchGroup = getGroup('/workbench')
    const productionGroup = getGroup('/prod')
    const warnings = getRoute(workbenchGroup, 'ProdWarnings')

    assert.equal(warnings.title, '预警中心')
    assert.equal(warnings.path, '/prod/warnings')
    assert.equal(productionGroup.children.some((item) => item.name === 'ProdWarnings'), false)
  })

  it('将模具开发中心归入设备模具，并从生产管理移除', () => {
    const equipmentGroup = getGroup('/equipment')
    const productionGroup = getGroup('/prod')
    const moldDevelopment = getRoute(equipmentGroup, 'MoldDevelopment')

    assert.equal(moldDevelopment.title, '模具开发中心')
    assert.equal(moldDevelopment.view, 'prod/mold-development.vue')
    assert.equal(productionGroup.children.some((item) => item.name === 'MoldDevelopment'), false)
  })

  it('不在报表中心重复挂载财务总览视图', () => {
    const reportGroup = getGroup('/report')
    const financeDashboardRoutes = allFinalRoutes().filter((route) => route.view === 'finance/dashboard.vue')

    assert.equal(reportGroup.children.some((item) => item.view === 'finance/dashboard.vue'), false)
    assert.equal(financeDashboardRoutes.length, 1)
    assert.equal(financeDashboardRoutes[0].name, 'FinanceDashboard')
  })

  it('将旧财务报表地址静默重定向到唯一财务总览入口', () => {
    assert.deepEqual(legacyRouteRedirects, [
      { path: '/report/finance-dashboard', redirect: '/finance/dashboard' },
    ])
  })

  it('保持所有最终路由名称和路径唯一', () => {
    const routes = allFinalRoutes()

    assert.deepEqual(duplicates(routes.map((route) => route.name)), [])
    assert.deepEqual(duplicates(routes.map((route) => route.path)), [])
  })

  it('保留旧地址并按当前业务归属解析模块标题', () => {
    assert.equal(findRouteGroupByPath('/base/users')?.title, '系统管理')
    assert.equal(findRouteGroupByPath('/system/notifications')?.title, '待办中心')
    assert.equal(findRouteGroupByPath('/prod/warnings')?.title, '待办中心')
    assert.equal(findRouteGroupByPath('/prod/mold-development')?.title, '设备模具')
    assert.equal(findRouteGroupByPath('/base/products')?.title, '基础资料')
  })

  it('为基础资料主数据使用档案化名称', () => {
    const baseGroup = getGroup('/base')
    const archiveTitles = {
      Warehouses: '仓库档案',
      Products: '产品档案',
      Customers: '客户档案',
      Suppliers: '供应商档案',
      Machines: '机台档案',
      Molds: '模具档案',
    }

    for (const [name, title] of Object.entries(archiveTitles)) {
      assert.equal(getRoute(baseGroup, name).title, title)
    }
  })
})
