import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertSupabaseConfigPassword } from '@/utils/supabase-config-security'
import {
  assertSupabaseConnectionCanBeStored,
  getTrustedSupabaseProjectUrls,
  resolveSupabaseConnectionConfig,
  resolveSupabaseAuthEmailDomain,
} from '@/utils/supabase-runtime-config'

export interface SupabaseRuntimeConfig {
  url: string
  anonKey: string
  authEmailDomain?: string
  storageBucket?: string
}

const SUPABASE_CONFIG_STORAGE_KEY = 'inject_erp_supabase_config'
const defaultSupabaseUrl = 'https://saodtwnvbanjlkwwivcb.supabase.co'
const defaultSupabasePublishableKey = 'sb_publishable_zDACThBqg3ZrBgS4yXwKvg_dyxSAOLM'
const defaultStorageBucket = 'erp-files'

function readStoredSupabaseConfig(): SupabaseRuntimeConfig | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SupabaseRuntimeConfig>
    if (typeof parsed.url !== 'string' || typeof parsed.anonKey !== 'string') return null
    return {
      url: parsed.url.trim(),
      anonKey: parsed.anonKey.trim(),
      authEmailDomain: typeof parsed.authEmailDomain === 'string' ? parsed.authEmailDomain.trim() : '',
      storageBucket: typeof parsed.storageBucket === 'string' ? parsed.storageBucket.trim() : '',
    }
  } catch {
    return null
  }
}

const storedConfig = readStoredSupabaseConfig()
const environmentConnection = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || '',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '',
}
const fallbackConnection = {
  url: defaultSupabaseUrl,
  anonKey: defaultSupabasePublishableKey,
}
const resolvedConnection = resolveSupabaseConnectionConfig({
  stored: storedConfig,
  environment: environmentConnection,
  fallback: fallbackConnection,
})
const acceptedStoredConfig = resolvedConnection.source === 'stored' ? storedConfig : null
const supabaseUrl = resolvedConnection.config.url
const supabaseAnonKey = resolvedConnection.config.anonKey
const configuredAuthEmailDomain = acceptedStoredConfig?.authEmailDomain || import.meta.env.VITE_SUPABASE_AUTH_EMAIL_DOMAIN?.trim()
const configuredStorageBucket = acceptedStoredConfig?.storageBucket || import.meta.env.VITE_SUPABASE_STORAGE_BUCKET?.trim()
const trustedProjectUrls = getTrustedSupabaseProjectUrls(fallbackConnection, environmentConnection)

export const supabaseAuthEmailDomain =
  resolveSupabaseAuthEmailDomain(supabaseUrl, configuredAuthEmailDomain)
export const supabaseStorageBucket =
  configuredStorageBucket || defaultStorageBucket

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabaseRuntimeEnv = {
  url: supabaseUrl,
  hasUrl: Boolean(supabaseUrl),
  hasAnonKey: Boolean(supabaseAnonKey),
  hasAuthEmailDomain: Boolean(supabaseAuthEmailDomain),
  hasStorageBucket: Boolean(configuredStorageBucket),
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

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  return {
    url: supabaseUrl || '',
    anonKey: supabaseAnonKey || '',
    authEmailDomain: configuredAuthEmailDomain || '',
    storageBucket: configuredStorageBucket || '',
  }
}

export async function saveSupabaseRuntimeConfig(config: SupabaseRuntimeConfig, confirmationPassword: string) {
  if (!config.url.trim() || !config.anonKey.trim()) {
    throw new Error('项目 URL 和 anon key 不能为空')
  }

  const connection = assertSupabaseConnectionCanBeStored(config, trustedProjectUrls)

  await assertSupabaseConfigPassword(confirmationPassword)

  if (typeof window === 'undefined') {
    throw new Error('当前环境不支持保存浏览器配置')
  }

  try {
    window.localStorage.setItem(SUPABASE_CONFIG_STORAGE_KEY, JSON.stringify({
      url: connection.url,
      anonKey: connection.anonKey,
      authEmailDomain: config.authEmailDomain?.trim() || '',
      storageBucket: config.storageBucket?.trim() || '',
    }))
  } catch {
    throw new Error('浏览器本地存储不可用，无法保存配置')
  }
}

export async function clearSupabaseRuntimeConfig(confirmationPassword: string) {
  await assertSupabaseConfigPassword(confirmationPassword)

  if (typeof window === 'undefined') {
    throw new Error('当前环境不支持清除浏览器配置')
  }

  try {
    window.localStorage.removeItem(SUPABASE_CONFIG_STORAGE_KEY)
  } catch {
    throw new Error('浏览器本地存储不可用，无法恢复默认配置')
  }
}
