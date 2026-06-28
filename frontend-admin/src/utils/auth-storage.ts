const TOKEN_KEY = 'token'
const COOKIE_KEY = 'inject_erp_token'

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
