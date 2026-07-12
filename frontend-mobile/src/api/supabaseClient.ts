import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {}

const defaultSupabaseUrl = 'https://saodtwnvbanjlkwwivcb.supabase.co'
const defaultSupabasePublishableKey = 'sb_publishable_zDACThBqg3ZrBgS4yXwKvg_dyxSAOLM'

function normalizeSupabaseProjectUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return ''

  try {
    const parsed = new URL(value.trim())
    if (!['http:', 'https:'].includes(parsed.protocol)) return ''
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return ''
    if (parsed.pathname && parsed.pathname !== '/') return ''
    return parsed.origin
  } catch {
    return ''
  }
}

const configuredSupabaseUrl = normalizeSupabaseProjectUrl(viteEnv.VITE_SUPABASE_URL)
const configuredSupabaseKey = viteEnv.VITE_SUPABASE_ANON_KEY?.trim() || ''
const hasEnvironmentConnection = Boolean(
  configuredSupabaseUrl
  && /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(configuredSupabaseKey),
)
const supabaseUrl = hasEnvironmentConnection ? configuredSupabaseUrl : defaultSupabaseUrl
const supabaseAnonKey = hasEnvironmentConnection ? configuredSupabaseKey : defaultSupabasePublishableKey

export function resolveSupabaseAuthEmailDomain(supabaseUrl: unknown, ...explicitDomains: unknown[]) {
  for (const domain of explicitDomains) {
    if (typeof domain === 'string' && domain.trim()) return domain.trim()
  }

  try {
    const parsed = new URL(String(supabaseUrl ?? '').trim())
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.hostname.toLowerCase() : ''
  } catch {
    return ''
  }
}

export const supabaseAuthEmailDomain =
  resolveSupabaseAuthEmailDomain(supabaseUrl, viteEnv.VITE_SUPABASE_AUTH_EMAIL_DOMAIN)
export const supabaseStorageBucket =
  viteEnv.VITE_SUPABASE_STORAGE_BUCKET?.trim() || 'erp-files'

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null

let supabaseClientForTest: SupabaseClient | null | undefined

export function __setSupabaseClientForTest(client?: SupabaseClient | null) {
  supabaseClientForTest = client
}

export function getSupabaseClient() {
  const client = supabaseClientForTest === undefined ? supabase : supabaseClientForTest
  if (!client) {
    throw new Error('请先在 .env.local 中配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY')
  }
  return client
}
