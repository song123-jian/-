export interface SupabaseConnectionConfig {
  url: string
  anonKey: string
}

type SupabaseConnectionCandidate = Partial<SupabaseConnectionConfig> | null | undefined

export function normalizeSupabaseProjectUrl(value: unknown) {
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

function isPlaceholderAuthEmailDomain(value: string) {
  return value === ['inject-erp', 'example', 'com'].join('.')
}

export function resolveSupabaseAuthEmailDomain(
  supabaseUrl: unknown,
  ...explicitDomains: unknown[]
) {
  for (const domain of explicitDomains) {
    if (typeof domain !== 'string') continue
    const normalizedDomain = domain.trim().toLowerCase()
    if (normalizedDomain && !isPlaceholderAuthEmailDomain(normalizedDomain)) {
      return normalizedDomain
    }
  }

  const normalizedUrl = normalizeSupabaseProjectUrl(supabaseUrl)
  return normalizedUrl ? new URL(normalizedUrl).hostname.toLowerCase() : ''
}

export function isSafeSupabasePublishableKey(value: unknown) {
  return typeof value === 'string' && /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value.trim())
}

function normalizeConnection(candidate: SupabaseConnectionCandidate): SupabaseConnectionConfig | null {
  const url = normalizeSupabaseProjectUrl(candidate?.url)
  const anonKey = typeof candidate?.anonKey === 'string' ? candidate.anonKey.trim() : ''
  if (!url || !isSafeSupabasePublishableKey(anonKey)) return null
  return { url, anonKey }
}

export function getTrustedSupabaseProjectUrls(
  fallback: SupabaseConnectionConfig,
  environment?: SupabaseConnectionCandidate,
) {
  const fallbackConfig = normalizeConnection(fallback)
  if (!fallbackConfig) throw new Error('程序内置的 Supabase 配置无效')

  const environmentConfig = normalizeConnection(environment)
  return [...new Set([fallbackConfig.url, environmentConfig?.url].filter((url): url is string => Boolean(url)))]
}

export function resolveSupabaseConnectionConfig(options: {
  stored?: SupabaseConnectionCandidate
  environment?: SupabaseConnectionCandidate
  fallback: SupabaseConnectionConfig
}) {
  const fallbackConfig = normalizeConnection(options.fallback)
  if (!fallbackConfig) throw new Error('程序内置的 Supabase 配置无效')

  const environmentConfig = normalizeConnection(options.environment)
  const trustedUrls = new Set(getTrustedSupabaseProjectUrls(fallbackConfig, environmentConfig))
  const storedConfig = normalizeConnection(options.stored)

  if (storedConfig && trustedUrls.has(storedConfig.url)) {
    return { config: storedConfig, source: 'stored' as const }
  }
  if (environmentConfig) {
    return { config: environmentConfig, source: 'environment' as const }
  }
  return { config: fallbackConfig, source: 'fallback' as const }
}

export function assertSupabaseConnectionCanBeStored(
  candidate: SupabaseConnectionCandidate,
  trustedProjectUrls: readonly string[],
) {
  const url = normalizeSupabaseProjectUrl(candidate?.url)
  if (!url) {
    throw new Error('项目 URL 格式不正确，必须是无路径的 http 或 https 地址')
  }

  const trustedUrls = new Set(trustedProjectUrls.map(normalizeSupabaseProjectUrl).filter(Boolean))
  if (!trustedUrls.has(url)) {
    throw new Error('只允许使用程序内置或部署环境中的 Supabase 项目 URL')
  }

  const anonKey = typeof candidate?.anonKey === 'string' ? candidate.anonKey.trim() : ''
  if (!isSafeSupabasePublishableKey(anonKey)) {
    throw new Error('仅允许填写 sb_publishable_ 开头的 Supabase Publishable key')
  }

  return { url, anonKey }
}
