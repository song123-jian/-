const LOGIN_PATH = '/login'
const DEFAULT_POST_LOGIN_PATH = '/dashboard'

function normalizeInternalPath(path: string | null | undefined, fallback = DEFAULT_POST_LOGIN_PATH) {
  const value = String(path || '').trim()
  if (!value || value.includes('://') || value.startsWith('//') || !value.startsWith('/')) {
    return fallback
  }
  if (value === LOGIN_PATH || value.startsWith(`${LOGIN_PATH}?`) || value.startsWith(`${LOGIN_PATH}#`)) {
    return fallback
  }
  return value
}

export function resolvePostLoginPath(redirectPath: string | null | undefined) {
  return normalizeInternalPath(redirectPath)
}

export function buildLoginUrl(redirectPath?: string | null) {
  const target = resolvePostLoginPath(redirectPath)
  return `${LOGIN_PATH}?redirect=${encodeURIComponent(target)}`
}

export function getCurrentLocationPath() {
  if (typeof window === 'undefined') {
    return DEFAULT_POST_LOGIN_PATH
  }
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}
