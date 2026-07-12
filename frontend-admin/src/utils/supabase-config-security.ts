const SUPABASE_CONFIG_PASSWORD_SHA256 = '7982933fbe2382a834c46da403de99f9c8e08e8f2e7afa50c6bf42f4b63f1c2b'

// This local password prevents accidental edits; Supabase Auth and RLS remain the security boundary.

function bytesToHex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifySupabaseConfigPassword(password: string) {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('当前环境不支持安全的配置密码校验')
  }

  if (!password) return false

  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(password))
  return bytesToHex(digest) === SUPABASE_CONFIG_PASSWORD_SHA256
}

export async function assertSupabaseConfigPassword(password: string) {
  if (!await verifySupabaseConfigPassword(password)) {
    throw new Error('Supabase 配置确认密码错误')
  }
}
