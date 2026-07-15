const TOKEN_KEY = 'token'
const COOKIE_KEY = 'inject_erp_token'
const USER_CONTEXT_KEYS = ['userId', 'userName', 'realName', 'phone', 'role', 'roles']

function hasLocalStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

function readCookie(name: string) {
  if (typeof document === 'undefined' || !document.cookie) {
    return ''
  }
  const prefix = `${encodeURIComponent(name)}=`
  const item = document.cookie.split('; ').find((part) => part.startsWith(prefix))
  return item ? decodeURIComponent(item.slice(prefix.length)) : ''
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') {
    return
  }
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/`
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') {
    return
  }
  document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; path=/`
}

export function getStoredToken() {
  if (hasLocalStorage()) {
    try {
      return window.localStorage.getItem(TOKEN_KEY) || ''
    } catch {
      return readCookie(COOKIE_KEY)
    }
  }
  return readCookie(COOKIE_KEY)
}

export function setStoredToken(token: string) {
  if (hasLocalStorage()) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token)
      return
    } catch {
      // fall through to cookie storage
    }
  }
  writeCookie(COOKIE_KEY, token)
}

export function clearStoredToken() {
  if (hasLocalStorage()) {
    try {
      window.localStorage.removeItem(TOKEN_KEY)
    } catch {
      // ignore
    }
  }
  deleteCookie(COOKIE_KEY)
}

export function clearStoredAuthContext() {
  clearStoredToken()
  if (!hasLocalStorage()) return
  try {
    for (const key of USER_CONTEXT_KEYS) window.localStorage.removeItem(key)
  } catch {
    // The token cookie was already cleared; ignore unavailable local storage.
  }
}
