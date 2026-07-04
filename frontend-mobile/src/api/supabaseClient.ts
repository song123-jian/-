import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {}

const supabaseUrl = viteEnv.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY?.trim()

export const supabaseAuthEmailDomain =
  viteEnv.VITE_SUPABASE_AUTH_EMAIL_DOMAIN?.trim() || 'inject-erp.example.com'
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
