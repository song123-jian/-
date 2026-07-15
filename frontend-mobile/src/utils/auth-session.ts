import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '../api/supabaseClient.ts'

const AUTH_STORAGE_KEYS = ['token', 'userId', 'userName', 'phone', 'role', 'realName', 'roles']

export function clearStoredAuthContext() {
  for (const key of AUTH_STORAGE_KEYS) localStorage.removeItem(key)
}

export async function getActiveSupabaseSession(): Promise<Session | null> {
  try {
    const { data, error } = await getSupabaseClient().auth.getSession()
    if (error || !data.session?.access_token || !data.session.user?.id) return null
    return data.session
  } catch {
    return null
  }
}

export async function hasActiveSupabaseSession() {
  return Boolean(await getActiveSupabaseSession())
}

export async function synchronizeSupabaseAuthSession() {
  const session = await getActiveSupabaseSession()
  if (!session) {
    clearStoredAuthContext()
    return false
  }
  if (localStorage.getItem('token') !== session.access_token) {
    localStorage.setItem('token', session.access_token)
  }
  return true
}
