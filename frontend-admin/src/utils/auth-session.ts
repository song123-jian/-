import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/api/supabaseClient'
import {
  clearStoredAuthContext,
  getStoredToken,
  setStoredToken,
} from '@/utils/auth-storage'

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
  if (getStoredToken() !== session.access_token) setStoredToken(session.access_token)
  return true
}
