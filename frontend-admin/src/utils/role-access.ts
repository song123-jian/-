export const MANAGEMENT_ROLES = ['admin', 'boss']
export const FIELD_ROLES = ['operator']

export function normalizeRole(role?: string | null) {
  return String(role || '').trim().toLowerCase()
}

export function normalizeRoles(roles?: Array<string | null | undefined> | string | null) {
  const raw = Array.isArray(roles) ? roles : roles ? [roles] : []
  return Array.from(new Set(raw.map(normalizeRole).filter(Boolean)))
}

export function canAccessRoles(userRoles: string[], allowedRoles?: string[]) {
  const allowed = normalizeRoles(allowedRoles)
  if (!allowed.length) return true
  const current = normalizeRoles(userRoles)
  return current.some((role) => allowed.includes(role))
}

export function getStoredUserRoles() {
  if (typeof window === 'undefined') return []
  const roles: string[] = []
  try {
    const parsed = JSON.parse(window.localStorage.getItem('roles') || '[]')
    if (Array.isArray(parsed)) roles.push(...parsed)
  } catch {
    // ignore malformed role cache
  }
  const role = window.localStorage.getItem('role')
  if (role) roles.push(role)
  return normalizeRoles(roles)
}
