import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const safeUserColumns = 'id, username, real_name, phone, role, status, login_fail_count, lock_until, last_login_at, created_at, updated_at'
const activeStatuses = new Set(['1', 'TRUE', 'ACTIVE', 'ENABLED'])
const managerRoles = new Set(['ADMIN', 'BOSS'])

type JsonRecord = Record<string, unknown>

function json(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function has(input: JsonRecord, ...keys: string[]) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(input, key))
}

function valueOf(input: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) return input[key]
  }
  return undefined
}

function normalizeStatus(value: unknown, fallback = 1) {
  const status = Number(value ?? fallback)
  if (!Number.isInteger(status) || ![0, 1].includes(status)) throw new Error('用户状态只能是 0 或 1')
  return status
}

function normalizeRole(value: unknown) {
  const role = text(value).toUpperCase()
  if (!['ADMIN', 'BOSS', 'OPERATOR'].includes(role)) throw new Error('用户角色无效')
  return role
}

function normalizeEmail(value: unknown) {
  const email = text(value).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Auth 邮箱格式无效')
  return email
}

function resolveSupabaseAuthEmailDomain(supabaseUrl: unknown, ...explicitDomains: unknown[]) {
  for (const domain of explicitDomains) {
    if (text(domain)) return text(domain)
  }

  try {
    const parsed = new URL(text(supabaseUrl))
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.hostname.toLowerCase() : ''
  } catch {
    return ''
  }
}

function authEmail(username: string, supplied: unknown, supabaseUrl: string) {
  if (text(supplied)) return normalizeEmail(supplied)
  if (username.includes('@')) return normalizeEmail(username)
  const domain = resolveSupabaseAuthEmailDomain(supabaseUrl, Deno.env.get('ERP_AUTH_EMAIL_DOMAIN'))
  if (!domain) throw new Error('无法从 SUPABASE_URL 推导 Auth 邮箱域名')
  return normalizeEmail(`${username}@${domain}`)
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return text((error as { message?: unknown }).message)
  return text(error) || '用户认证服务执行失败'
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json(405, { ok: false, error: '仅支持 POST 请求' })

  try {
    const supabaseUrl = text(Deno.env.get('SUPABASE_URL'))
    const serviceRoleKey = text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
    const authorization = text(request.headers.get('Authorization'))
    if (!supabaseUrl || !serviceRoleKey) return json(500, { ok: false, error: 'Edge Function 服务端环境未配置' })
    if (!authorization.toLowerCase().startsWith('bearer ')) return json(401, { ok: false, error: '缺少登录凭证' })

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const jwt = authorization.slice(7).trim()
    const { data: authData, error: authError } = await admin.auth.getUser(jwt)
    if (authError || !authData.user) return json(401, { ok: false, error: '登录凭证无效或已过期' })

    const { data: caller, error: callerError } = await admin
      .from('sys_user')
      .select('id, role, status')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle()
    if (callerError) throw callerError
    if (!caller || !activeStatuses.has(text(caller.status).toUpperCase()) || !managerRoles.has(text(caller.role).toUpperCase())) {
      return json(403, { ok: false, error: '仅管理员可以维护认证用户' })
    }

    const body = await request.json() as JsonRecord
    const action = text(body.action).toLowerCase()
    const userId = Number(body.userId || 0)
    const input = (body.user && typeof body.user === 'object' ? body.user : {}) as JsonRecord

    if (action === 'create') {
      const username = text(valueOf(input, 'username'))
      const realName = text(valueOf(input, 'real_name', 'realName'))
      const phone = text(valueOf(input, 'phone')) || null
      const role = normalizeRole(valueOf(input, 'role'))
      const status = normalizeStatus(valueOf(input, 'status'))
      const password = text(valueOf(input, 'password', 'new_password', 'newPassword'))
      if (!username || !realName) return json(400, { ok: false, error: '用户名和姓名不能为空' })
      if (password.length < 6) return json(400, { ok: false, error: 'Auth 密码至少 6 位' })

      const { data: duplicate, error: duplicateError } = await admin
        .from('sys_user')
        .select('id')
        .eq('username', username)
        .maybeSingle()
      if (duplicateError) throw duplicateError
      if (duplicate) return json(409, { ok: false, error: '用户名已存在' })

      const email = authEmail(username, valueOf(input, 'auth_email', 'authEmail'), supabaseUrl)
      const { data: createdAuth, error: createAuthError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, real_name: realName, phone, role },
      })
      if (createAuthError || !createdAuth.user) throw createAuthError || new Error('Auth 用户创建失败')

      const { data: createdUser, error: createUserError } = await admin
        .from('sys_user')
        .insert({
          username,
          real_name: realName,
          phone,
          password_hash: 'SUPABASE_AUTH_MANAGED',
          role,
          status,
          login_fail_count: 0,
        })
        .select(safeUserColumns)
        .single()
      if (createUserError || !createdUser) {
        await admin.auth.admin.deleteUser(createdAuth.user.id)
        throw createUserError || new Error('系统用户创建失败')
      }

      const { error: bindError } = await admin.rpc('bind_mold_auth_user', {
        p_sys_user_id: createdUser.id,
        p_auth_user_id: createdAuth.user.id,
      })
      if (bindError) {
        await admin.from('sys_user').delete().eq('id', createdUser.id)
        await admin.auth.admin.deleteUser(createdAuth.user.id)
        throw bindError
      }
      return json(201, { ok: true, user: createdUser })
    }

    if (!Number.isInteger(userId) || userId <= 0) return json(400, { ok: false, error: '用户 ID 无效' })
    const { data: existing, error: existingError } = await admin
      .from('sys_user')
      .select('id, username, real_name, phone, password_hash, role, status, auth_user_id, login_fail_count, lock_until, last_login_at, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle()
    if (existingError) throw existingError
    if (!existing) return json(404, { ok: false, error: '未找到系统用户' })
    if (!existing.auth_user_id) return json(409, { ok: false, error: '该系统用户尚未绑定 Supabase Auth 用户' })

    if (action === 'delete') {
      if (Number(caller.id) === userId) return json(409, { ok: false, error: '不能删除当前登录账号' })
      const { error: deleteUserError } = await admin.from('sys_user').delete().eq('id', userId)
      if (deleteUserError) throw deleteUserError
      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(existing.auth_user_id)
      if (deleteAuthError) {
        const { data: restored, error: restoreError } = await admin
          .from('sys_user')
          .insert({
            id: existing.id,
            username: existing.username,
            real_name: existing.real_name,
            phone: existing.phone,
            password_hash: existing.password_hash,
            role: existing.role,
            status: existing.status,
            login_fail_count: existing.login_fail_count,
            lock_until: existing.lock_until,
            last_login_at: existing.last_login_at,
            created_at: existing.created_at,
            updated_at: existing.updated_at,
          })
          .select('id')
          .single()
        if (!restoreError && restored) {
          await admin.rpc('bind_mold_auth_user', {
            p_sys_user_id: restored.id,
            p_auth_user_id: existing.auth_user_id,
          })
        }
        throw deleteAuthError
      }
      return json(200, { ok: true })
    }

    if (action !== 'update') return json(400, { ok: false, error: '用户操作无效' })
    const updates: JsonRecord = { updated_at: new Date().toISOString() }
    if (has(input, 'username')) updates.username = text(valueOf(input, 'username'))
    if (has(input, 'real_name', 'realName')) updates.real_name = text(valueOf(input, 'real_name', 'realName'))
    if (has(input, 'phone')) updates.phone = text(valueOf(input, 'phone')) || null
    if (has(input, 'role')) updates.role = normalizeRole(valueOf(input, 'role'))
    if (has(input, 'status')) updates.status = normalizeStatus(valueOf(input, 'status'), existing.status)
    if (updates.username === '' || updates.real_name === '') return json(400, { ok: false, error: '用户名和姓名不能为空' })

    const password = text(valueOf(input, 'password', 'new_password', 'newPassword'))
    if (password && password.length < 6) return json(400, { ok: false, error: 'Auth 密码至少 6 位' })
    const nextUsername = text(updates.username ?? existing.username)
    const nextRealName = text(updates.real_name ?? existing.real_name)
    const nextPhone = text(updates.phone ?? existing.phone) || null
    const nextRole = text(updates.role ?? existing.role)
    const nextEmail = has(input, 'auth_email', 'authEmail') || has(input, 'username')
      ? authEmail(nextUsername, valueOf(input, 'auth_email', 'authEmail'), supabaseUrl)
      : undefined

    const { data: updatedUser, error: updateUserError } = await admin
      .from('sys_user')
      .update(updates)
      .eq('id', userId)
      .select(safeUserColumns)
      .single()
    if (updateUserError || !updatedUser) throw updateUserError || new Error('系统用户更新失败')

    const authUpdates: JsonRecord = {
      user_metadata: { username: nextUsername, real_name: nextRealName, phone: nextPhone, role: nextRole },
    }
    if (nextEmail) authUpdates.email = nextEmail
    if (password) authUpdates.password = password
    const { error: updateAuthError } = await admin.auth.admin.updateUserById(existing.auth_user_id, authUpdates)
    if (updateAuthError) {
      await admin.from('sys_user').update({
        username: existing.username,
        real_name: existing.real_name,
        phone: existing.phone,
        role: existing.role,
        status: existing.status,
        updated_at: existing.updated_at,
      }).eq('id', userId)
      throw updateAuthError
    }
    return json(200, { ok: true, user: updatedUser })
  } catch (error) {
    return json(500, { ok: false, error: errorMessage(error) })
  }
})
