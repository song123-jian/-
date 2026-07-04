import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const supabaseAuthEmailDomain =
  import.meta.env.VITE_SUPABASE_AUTH_EMAIL_DOMAIN?.trim() || 'inject-erp.example.com'
export const supabaseStorageBucket =
  import.meta.env.VITE_SUPABASE_STORAGE_BUCKET?.trim() || 'erp-files'

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabaseRuntimeEnv = {
  hasUrl: Boolean(supabaseUrl),
  hasAnonKey: Boolean(supabaseAnonKey),
  hasAuthEmailDomain: Boolean(import.meta.env.VITE_SUPABASE_AUTH_EMAIL_DOMAIN?.trim()),
  hasStorageBucket: Boolean(import.meta.env.VITE_SUPABASE_STORAGE_BUCKET?.trim()),
  authEmailDomain: supabaseAuthEmailDomain,
  storageBucket: supabaseStorageBucket,
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error('请先在 .env.local 中配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY')
  }
  return supabase
}
