import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { describe, it } from 'node:test'

// The application uses extensionless TypeScript imports. Keep this test on the
// same Node test runner by resolving those local imports before loading the module.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../'))
      && !/\.(?:[cm]?js|ts|tsx|vue)$/.test(specifier)
    ) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const { routeGroups } = await import('../frontend-admin/src/router/route-config.ts')
const { canAccessRoles } = await import('../frontend-admin/src/utils/role-access.ts')
const {
  REQUIRED_ROLE_MENU_ITEMS,
  ROLE_MENU_CONFIG_KEY,
  ROLE_MENU_ROLES,
  ROLE_MENU_UPDATED_EVENT,
  buildDefaultRoleMenuConfig,
  buildRoleMenuConfigRow,
  filterRouteGroupsByRoleMenu,
  getRoleAccessibleRouteGroups,
  normalizeRoleMenuConfig,
  parseRoleMenuConfig,
  saveRoleMenuCache,
  serializeRoleMenuConfig,
} = await import('../frontend-admin/src/utils/role-menu.ts')

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function routeNames(groups) {
  return groups.flatMap((group) => group.children.map((item) => item.name))
}

function expectedRoleMenu(role) {
  return routeGroups.flatMap((group) =>
    group.children
      .filter((item) => canAccessRoles([role], item.roles))
      .map((item) => item.name),
  )
}

function managementOnlyRouteNames() {
  return routeGroups.flatMap((group) =>
    group.children
      .filter((item) => !canAccessRoles(['operator'], item.roles))
      .map((item) => item.name),
  )
}

describe('role menu configuration', () => {
  it('builds the complete default menu for admin, boss, and operator from route access rules', () => {
    const defaults = buildDefaultRoleMenuConfig(routeGroups)

    assert.deepEqual(Object.keys(defaults), ROLE_MENU_ROLES.map((item) => item.value))
    for (const { value: role } of ROLE_MENU_ROLES) {
      assert.deepEqual(defaults[role], expectedRoleMenu(role))
      assert.equal(defaults[role].length, new Set(defaults[role]).size)
    }

    assert.deepEqual(defaults.admin, defaults.boss)
    assert.ok(defaults.admin.includes('SystemConfig'))
    assert.ok(defaults.boss.includes('SystemConfig'))
    assert.equal(defaults.operator.includes('SystemConfig'), false)
    assert.ok(defaults.operator.length < defaults.admin.length)
  })

  it('honors explicit menu hiding while retaining only selected accessible items', () => {
    const config = normalizeRoleMenuConfig({
      admin: ['WorkbenchTodos'],
      boss: ['SystemIntegration'],
      operator: ['ProdReports'],
    }, routeGroups)

    assert.deepEqual(config, {
      admin: ['WorkbenchTodos', 'SystemConfig'],
      boss: ['SystemConfig', 'SystemIntegration'],
      operator: ['ProdReports'],
    })

    const visibleForAdmin = routeNames(filterRouteGroupsByRoleMenu(routeGroups, ['admin'], config))
    assert.deepEqual(visibleForAdmin, ['WorkbenchTodos', 'SystemConfig'])
    assert.equal(visibleForAdmin.includes('SaleOrders'), false)
    assert.equal(visibleForAdmin.includes('SystemIntegration'), false)
  })

  it('drops unknown and path-shaped menu identifiers during normalization', () => {
    const normalized = normalizeRoleMenuConfig({
      admin: ['SaleOrders', 'UnknownMenu', '/not-a-route', 'SaleOrders', ' '],
      boss: ['UnknownMenu', '/system/config'],
      operator: ['ProdReports', 'UnknownMenu', '/system/config'],
      unexpected: ['SystemConfig'],
    }, routeGroups)

    assert.deepEqual(normalized.admin, ['SaleOrders', 'SystemConfig'])
    assert.deepEqual(normalized.boss, ['SystemConfig'])
    assert.deepEqual(normalized.operator, ['ProdReports'])
    assert.deepEqual(Object.keys(normalized), ['admin', 'boss', 'operator'])
    assert.deepEqual(parseRoleMenuConfig('{not-json', routeGroups), buildDefaultRoleMenuConfig(routeGroups))
  })

  it('prevents operator configuration from exposing management-only pages', () => {
    const defaults = buildDefaultRoleMenuConfig(routeGroups)
    const normalized = normalizeRoleMenuConfig({
      admin: [],
      boss: [],
      operator: routeNames(routeGroups),
    }, routeGroups)
    const managementRoutes = managementOnlyRouteNames()

    assert.ok(managementRoutes.includes('SystemConfig'))
    assert.deepEqual(normalized.operator, defaults.operator)
    assert.deepEqual(routeNames(getRoleAccessibleRouteGroups(routeGroups, 'operator')), defaults.operator)
    for (const name of managementRoutes) {
      assert.equal(normalized.operator.includes(name), false, `${name} must not be configurable for operator`)
    }
  })

  it('keeps SystemConfig fixed for admin and boss even when every menu is explicitly hidden', () => {
    const normalized = normalizeRoleMenuConfig({
      admin: [],
      boss: [],
      operator: [],
    }, routeGroups)

    assert.deepEqual(REQUIRED_ROLE_MENU_ITEMS, {
      admin: ['SystemConfig'],
      boss: ['SystemConfig'],
      operator: [],
    })
    assert.deepEqual(normalized, {
      admin: ['SystemConfig'],
      boss: ['SystemConfig'],
      operator: [],
    })
  })

  it('uses the union of every assigned role menu without leaking menus from unassigned roles', () => {
    const config = normalizeRoleMenuConfig({
      admin: ['Users'],
      boss: ['StockQuery'],
      operator: ['ProdReports'],
    }, routeGroups)
    const visible = routeNames(filterRouteGroupsByRoleMenu(routeGroups, [' OPERATOR ', 'boss', 'unknown'], config))

    assert.deepEqual(visible, ['ProdReports', 'StockQuery', 'SystemConfig'])
    assert.equal(visible.includes('Users'), false)
  })

  it('serializes a normalized role menu with deterministic role and route ordering', () => {
    const first = serializeRoleMenuConfig({
      operator: ['QualityBoard', 'ProdReports', 'QualityBoard', '/not-a-route'],
      boss: ['SystemConfig', 'Users', 'UnknownMenu'],
      admin: ['SystemConfig', 'Users', 'UnknownMenu'],
    }, routeGroups)
    const second = serializeRoleMenuConfig({
      admin: ['Users', 'SystemConfig'],
      boss: ['Users', 'SystemConfig'],
      operator: ['ProdReports', 'QualityBoard'],
    }, routeGroups)

    assert.equal(first, second)
    assert.equal(
      first,
      '{"admin":["Users","SystemConfig"],"boss":["Users","SystemConfig"],"operator":["ProdReports","QualityBoard"]}',
    )
    assert.deepEqual(parseRoleMenuConfig(first, routeGroups), JSON.parse(first))

    const row = buildRoleMenuConfigRow(JSON.parse(first), routeGroups, '2026-07-11T00:00:00.000Z')
    assert.equal(row.config_key, ROLE_MENU_CONFIG_KEY)
    assert.equal(row.config_value, first)
    assert.equal(row.updated_at, '2026-07-11T00:00:00.000Z')
  })

  it('notifies the current window even when local storage is unavailable', () => {
    const originalWindow = globalThis.window
    let dispatchedEvent
    globalThis.window = {
      localStorage: {
        setItem() {
          throw new Error('storage disabled')
        },
      },
      dispatchEvent(event) {
        dispatchedEvent = event
        return true
      },
    }

    try {
      const saved = saveRoleMenuCache({ admin: ['Users'], boss: [], operator: [] }, routeGroups)
      assert.equal(dispatchedEvent?.type, ROLE_MENU_UPDATED_EVENT)
      assert.deepEqual(dispatchedEvent?.detail, saved)
    } finally {
      if (originalWindow === undefined) delete globalThis.window
      else globalThis.window = originalWindow
    }
  })
})

describe('role menu configuration integration markers', () => {
  const systemConfigPage = read('../frontend-admin/src/views/system/config.vue')
  const configurator = read('../frontend-admin/src/components/RoleMenuConfigurator.vue')
  const systemApi = read('../frontend-admin/src/api/system.ts')
  const requestAdapter = read('../frontend-admin/src/api/supabaseRequest.ts')
  const layout = read('../frontend-admin/src/layout/index.vue')

  it('mounts a role menu editor in the system configuration page', () => {
    assert.match(systemConfigPage, /import RoleMenuConfigurator from ['"]@\/components\/RoleMenuConfigurator\.vue['"]/)
    assert.match(systemConfigPage, /<RoleMenuConfigurator\s*\/>/)
    assert.match(configurator, /ROLE_MENU_ROLES/)
    assert.match(configurator, /getRoleAccessibleRouteGroups\(routeGroups, activeRole\.value\)/)
    assert.match(configurator, /REQUIRED_ROLE_MENU_ITEMS/)
    assert.match(configurator, /getRoleMenuConfig/)
    assert.match(configurator, /updateRoleMenuConfig/)
  })

  it('provides role menu read and update API routes backed by sys_config', () => {
    assert.match(systemApi, /export const getRoleMenuConfig\s*=\s*\(\)\s*=>\s*request\.get\(['"]\/system\/role-menus['"],\s*\{\s*notifyOnError:\s*false\s*\}\)/)
    assert.match(systemApi, /export const updateRoleMenuConfig\s*=\s*\(data: RoleMenuConfig\)\s*=>\s*request\.put\(['"]\/system\/role-menus['"], data\)/)
    assert.match(requestAdapter, /ROLE_MENU_CONFIG_KEY/)
    assert.match(requestAdapter, /async function roleMenuConfigObject\(\)/)
    assert.match(requestAdapter, /async function updateRoleMenuConfig\(payload:/)
    assert.match(requestAdapter, /currentUserIsManager\(\)/)
    assert.match(requestAdapter, /path === 'system\/role-menus'\) return roleMenuConfigObject\(\)/)
    assert.match(requestAdapter, /path === 'system\/role-menus'\) return updateRoleMenuConfig\(data \|\| \{\}\)/)
  })

  it('refreshes the layout from local and cloud role menu configuration', () => {
    assert.match(layout, /getRoleMenuConfig/)
    assert.match(layout, /loadRoleMenuCache\(routeGroups\)/)
    assert.match(layout, /filterRouteGroupsByRoleMenu\(routeGroups, accessRoles\.value, roleMenuConfig\.value\)/)
    assert.match(layout, /saveRoleMenuCache\(res\.data\.menus, routeGroups\)/)
    assert.match(layout, /window\.addEventListener\(ROLE_MENU_UPDATED_EVENT/)
    assert.match(layout, /window\.removeEventListener\(ROLE_MENU_UPDATED_EVENT/)
  })
})
