import type { AppRouteGroup } from '../router/route-config.ts'
import { canAccessRoles, normalizeRoles } from './role-access.ts'

export const ROLE_MENU_CONFIG_KEY = 'role_menu_config'
export const ROLE_MENU_STORAGE_KEY = 'inject_erp_role_menu_config'
export const ROLE_MENU_UPDATED_EVENT = 'role-menu-updated'

export const ROLE_MENU_ROLES = [
  { value: 'admin', label: '管理员' },
  { value: 'boss', label: '老板' },
  { value: 'operator', label: '操作员' },
] as const

export type RoleMenuRole = (typeof ROLE_MENU_ROLES)[number]['value']
export type RoleMenuConfig = Record<RoleMenuRole, string[]>
export type RoleMenuConfigEnvelope = {
  configured: boolean
  menus: RoleMenuConfig
}

export const REQUIRED_ROLE_MENU_ITEMS: RoleMenuConfig = {
  admin: ['SystemConfig'],
  boss: ['SystemConfig'],
  operator: [],
}

function roleMenuSource(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
}

function accessibleMenuNames(groups: AppRouteGroup[], role: RoleMenuRole) {
  return groups.flatMap((group) =>
    group.children
      .filter((item) => canAccessRoles([role], item.roles))
      .map((item) => item.name),
  )
}

export function getRoleAccessibleRouteGroups(groups: AppRouteGroup[], role: RoleMenuRole) {
  return groups
    .map((group) => ({
      ...group,
      children: group.children.filter((item) => canAccessRoles([role], item.roles)),
    }))
    .filter((group) => group.children.length > 0)
}

export function buildDefaultRoleMenuConfig(groups: AppRouteGroup[]): RoleMenuConfig {
  return Object.fromEntries(
    ROLE_MENU_ROLES.map(({ value }) => [value, accessibleMenuNames(groups, value)]),
  ) as RoleMenuConfig
}

export function normalizeRoleMenuConfig(input: unknown, groups: AppRouteGroup[]): RoleMenuConfig {
  const source = roleMenuSource(input)
  const defaults = buildDefaultRoleMenuConfig(groups)

  return Object.fromEntries(ROLE_MENU_ROLES.map(({ value: role }) => {
    const orderedAllowed = defaults[role]
    const allowed = new Set(orderedAllowed)
    const raw = source[role]
    const requested = Array.isArray(raw) ? raw.map((item) => String(item || '').trim()) : orderedAllowed
    const selected = new Set(requested.filter((name) => allowed.has(name)))
    for (const requiredName of REQUIRED_ROLE_MENU_ITEMS[role]) {
      if (allowed.has(requiredName)) selected.add(requiredName)
    }
    return [role, orderedAllowed.filter((name) => selected.has(name))]
  })) as RoleMenuConfig
}

export function filterRouteGroupsByRoleMenu(
  groups: AppRouteGroup[],
  userRoles: string[],
  config: RoleMenuConfig,
) {
  const normalizedConfig = normalizeRoleMenuConfig(config, groups)
  const currentRoles = normalizeRoles(userRoles).filter((role): role is RoleMenuRole =>
    ROLE_MENU_ROLES.some((item) => item.value === role),
  )
  const visibleNames = new Set(currentRoles.flatMap((role) => normalizedConfig[role]))

  return groups
    .map((group) => ({
      ...group,
      children: group.children.filter((item) =>
        canAccessRoles(userRoles, item.roles) && visibleNames.has(item.name),
      ),
    }))
    .filter((group) => group.children.length > 0)
}

export function serializeRoleMenuConfig(input: unknown, groups: AppRouteGroup[]) {
  return JSON.stringify(normalizeRoleMenuConfig(input, groups))
}

export function parseRoleMenuConfig(value: unknown, groups: AppRouteGroup[]) {
  return normalizeRoleMenuConfig(value, groups)
}

export function buildRoleMenuConfigRow(input: unknown, groups: AppRouteGroup[], updatedAt = new Date().toISOString()) {
  return {
    config_key: ROLE_MENU_CONFIG_KEY,
    config_value: serializeRoleMenuConfig(input, groups),
    config_desc: '按角色控制侧边栏菜单显示',
    updated_at: updatedAt,
  }
}

export function loadRoleMenuCache(groups: AppRouteGroup[]) {
  if (typeof window === 'undefined') return buildDefaultRoleMenuConfig(groups)
  try {
    return parseRoleMenuConfig(window.localStorage.getItem(ROLE_MENU_STORAGE_KEY), groups)
  } catch {
    return buildDefaultRoleMenuConfig(groups)
  }
}

export function saveRoleMenuCache(input: unknown, groups: AppRouteGroup[]) {
  const normalized = normalizeRoleMenuConfig(input, groups)
  if (typeof window === 'undefined') return normalized
  try {
    window.localStorage.setItem(ROLE_MENU_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
  window.dispatchEvent(new CustomEvent(ROLE_MENU_UPDATED_EVENT, { detail: normalized }))
  return normalized
}
