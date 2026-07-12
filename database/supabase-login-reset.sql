-- Transactional and retry-safe Supabase Auth bootstrap for the ERP administrator.
-- Run this file as one batch in the Supabase SQL Editor with database-owner rights.
-- The password is represented only by the precomputed BCrypt hash below.

begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('inject-erp:supabase-login-reset:songjian', 0)
);

do $login_reset$
declare
  v_username constant text := 'songjian';
  v_email constant text := 'songjian@saodtwnvbanjlkwwivcb.supabase.co';
  v_password_hash constant text := '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi';
  v_started_at constant timestamptz := pg_catalog.clock_timestamp();
  v_existing_binding uuid;
  v_bound_auth_user_id uuid;
  v_bound_auth_email text;
  v_bound_auth_username text;
  v_email_auth_user_id uuid;
  v_auth_user_id uuid;
  v_email_owner_count integer := 0;
  v_identity_id uuid;
  v_conflicting_username text;
  v_sys_user_id bigint;
begin
  raise notice '[%] Starting administrator Auth bootstrap', v_started_at;

  if pg_catalog.to_regclass('auth.users') is null then
    raise exception using
      errcode = '42P01',
      message = '管理员初始化中止：缺少 auth.users',
      hint = '请确认脚本在目标 Supabase 项目的 SQL Editor 中执行。';
  end if;

  if pg_catalog.to_regclass('auth.identities') is null then
    raise exception using
      errcode = '42P01',
      message = '管理员初始化中止：缺少 auth.identities',
      hint = '请确认目标项目的 Supabase Auth schema 已完成初始化。';
  end if;

  if pg_catalog.to_regclass('public.sys_user') is null then
    raise exception using
      errcode = '42P01',
      message = '管理员初始化中止：缺少 public.sys_user',
      hint = '请先完整执行 database/supabase-cloud.sql。';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'sys_user'
       and column_name = 'auth_user_id'
  ) then
    raise exception using
      errcode = '42703',
      message = '管理员初始化中止：public.sys_user 缺少 auth_user_id',
      hint = '请先完整执行最新版 database/supabase-cloud.sql。';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'auth'
       and table_name = 'users'
       and column_name = 'email_confirmed_at'
  ) then
    raise exception using
      errcode = '42703',
      message = '管理员初始化中止：auth.users 缺少 email_confirmed_at',
      hint = '当前 Auth schema 与脚本要求不兼容，请先完成 Supabase Auth 升级。';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'auth'
       and table_name = 'identities'
       and column_name = 'provider_id'
  ) then
    raise exception using
      errcode = '42703',
      message = '管理员初始化中止：auth.identities 缺少 provider_id',
      hint = '当前 Auth schema 与官方 provider_id 结构不一致，请先完成 Supabase Auth 升级。';
  end if;

  -- Preserve an existing ERP-to-Auth binding whenever it still points to auth.users.
  select app_user.auth_user_id
    into v_existing_binding
    from public.sys_user app_user
   where app_user.username = v_username
   for update;

  if v_existing_binding is not null then
    select
      auth_user.id,
      auth_user.email,
      pg_catalog.lower(coalesce(auth_user.raw_user_meta_data ->> 'username', ''))
      into v_bound_auth_user_id, v_bound_auth_email, v_bound_auth_username
      from auth.users auth_user
     where auth_user.id = v_existing_binding
     for update;
  end if;

  if v_bound_auth_user_id is not null
     and pg_catalog.lower(pg_catalog.split_part(coalesce(v_bound_auth_email, ''), '@', 1)) <> v_username
     and v_bound_auth_username <> v_username then
    raise exception using
      errcode = 'P0001',
      message = '管理员初始化中止：已有 Auth UUID 不能确认属于 songjian',
      detail = '现有 sys_user.auth_user_id 指向的 Auth 用户，其邮箱前缀和 username 元数据均不匹配 songjian。',
      hint = '请先在 Supabase Authentication 用户列表核对该 UUID；本脚本不会覆盖身份不明的 Auth 用户。';
  end if;

  -- Lock matching email rows before deciding whether a new Auth UUID is needed.
  perform 1
     from auth.users auth_user
    where pg_catalog.lower(auth_user.email) = pg_catalog.lower(v_email)
    for update;

  select count(*)::integer
    into v_email_owner_count
    from auth.users auth_user
   where pg_catalog.lower(auth_user.email) = pg_catalog.lower(v_email);

  if v_bound_auth_user_id is not null then
    if exists (
      select 1
        from auth.users auth_user
       where pg_catalog.lower(auth_user.email) = pg_catalog.lower(v_email)
         and auth_user.id <> v_bound_auth_user_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = '管理员初始化中止：目标 Auth 邮箱已由其他 UUID 占用',
        detail = 'public.sys_user(username=songjian) 已绑定有效 Auth UUID，但目标邮箱属于另一个 Auth UUID。',
        hint = '请先在 Supabase Authentication 用户列表核对邮箱归属；本脚本不会覆盖或删除其他 Auth 用户。';
    end if;

    v_auth_user_id := v_bound_auth_user_id;
  else
    if v_email_owner_count > 1 then
      raise exception using
        errcode = 'P0001',
        message = '管理员初始化中止：目标 Auth 邮箱对应多个 UUID',
        detail = '未找到可复用的 sys_user Auth 绑定，且目标邮箱存在重复 Auth 记录。',
        hint = '请先在 Supabase Authentication 用户列表核对重复账号。';
    end if;

    select auth_user.id
      into v_email_auth_user_id
      from auth.users auth_user
     where pg_catalog.lower(auth_user.email) = pg_catalog.lower(v_email)
     order by auth_user.id
     limit 1;

    v_auth_user_id := v_email_auth_user_id;
  end if;

  if v_auth_user_id is null then
    v_auth_user_id := pg_catalog.gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      is_sso_user,
      is_anonymous
    )
    values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      v_auth_user_id,
      'authenticated',
      'authenticated',
      v_email,
      v_password_hash,
      v_started_at,
      '',
      '',
      '',
      '',
      pg_catalog.jsonb_build_object(
        'provider', 'email',
        'providers', pg_catalog.jsonb_build_array('email')
      ),
      pg_catalog.jsonb_build_object(
        'username', v_username,
        'email_verified', true
      ),
      v_started_at,
      v_started_at,
      false,
      false
    );
  else
    update auth.users
       set instance_id = '00000000-0000-0000-0000-000000000000'::uuid,
           aud = 'authenticated',
           role = 'authenticated',
           email = v_email,
           encrypted_password = v_password_hash,
           email_confirmed_at = coalesce(email_confirmed_at, v_started_at),
           confirmation_token = coalesce(confirmation_token, ''),
           recovery_token = coalesce(recovery_token, ''),
           email_change_token_new = coalesce(email_change_token_new, ''),
           email_change = coalesce(email_change, ''),
           raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
             || pg_catalog.jsonb_build_object(
                  'provider', 'email',
                  'providers', pg_catalog.jsonb_build_array('email')
                ),
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
             || pg_catalog.jsonb_build_object(
                  'username', v_username,
                  'email_verified', true
                ),
           updated_at = v_started_at,
           banned_until = null,
           deleted_at = null,
           is_sso_user = false,
           is_anonymous = false
     where id = v_auth_user_id;
  end if;

  raise notice '[%] auth.users is ready for %', pg_catalog.clock_timestamp(), v_email;

  if exists (
    select 1
      from auth.identities identity_row
     where identity_row.provider = 'email'
       and identity_row.provider_id = v_auth_user_id::text
       and identity_row.user_id <> v_auth_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = '管理员初始化中止：email identity 的 provider_id 已绑定其他 Auth 用户',
      hint = '请先在 auth.identities 中核对该 provider_id；本脚本不会删除冲突 identity。';
  end if;

  select identity_row.id
    into v_identity_id
    from auth.identities identity_row
   where identity_row.provider = 'email'
     and (
       identity_row.provider_id = v_auth_user_id::text
       or identity_row.user_id = v_auth_user_id
     )
   order by
     (identity_row.provider_id = v_auth_user_id::text) desc,
     identity_row.created_at nulls last,
     identity_row.id
   limit 1
   for update;

  if v_identity_id is null then
    insert into auth.identities as existing_identity (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      v_auth_user_id::text,
      v_auth_user_id,
      pg_catalog.jsonb_build_object(
        'sub', v_auth_user_id::text,
        'email', v_email,
        'email_verified', true
      ),
      'email',
      null,
      v_started_at,
      v_started_at
    )
    on conflict (provider_id, provider) do update
       set user_id = excluded.user_id,
           identity_data = coalesce(existing_identity.identity_data, '{}'::jsonb)
             || excluded.identity_data,
           updated_at = excluded.updated_at;
  else
    update auth.identities identity_row
       set provider_id = v_auth_user_id::text,
           user_id = v_auth_user_id,
           identity_data = coalesce(identity_row.identity_data, '{}'::jsonb)
             || pg_catalog.jsonb_build_object(
                  'sub', v_auth_user_id::text,
                  'email', v_email,
                  'email_verified', true
                ),
           updated_at = v_started_at
     where identity_row.id = v_identity_id;
  end if;

  raise notice '[%] auth.identities email identity is ready', pg_catalog.clock_timestamp();

  select app_user.username
    into v_conflicting_username
    from public.sys_user app_user
   where app_user.auth_user_id = v_auth_user_id
     and app_user.username <> v_username
   order by app_user.id
   limit 1
   for update;

  if v_conflicting_username is not null then
    raise exception using
      errcode = 'P0001',
      message = '管理员初始化中止：目标 Auth UUID 已绑定其他系统用户',
      detail = pg_catalog.format('冲突的 public.sys_user.username=%s。', v_conflicting_username),
      hint = '请先核对系统用户绑定；本脚本不会自动解绑或删除其他系统用户。';
  end if;

  insert into public.sys_user (
    username,
    real_name,
    auth_user_id,
    password_hash,
    role,
    status,
    login_fail_count,
    lock_until,
    created_at,
    updated_at
  )
  values (
    v_username,
    '宋建',
    v_auth_user_id,
    v_password_hash,
    'BOSS',
    1,
    0,
    null,
    v_started_at,
    v_started_at
  )
  on conflict (username) do update
     set real_name = excluded.real_name,
         auth_user_id = excluded.auth_user_id,
         password_hash = excluded.password_hash,
         role = excluded.role,
         status = excluded.status,
         login_fail_count = 0,
         lock_until = null,
         updated_at = excluded.updated_at
  returning id into v_sys_user_id;

  if v_sys_user_id is null then
    raise exception using
      errcode = 'P0001',
      message = '管理员初始化中止：public.sys_user upsert 未返回用户 ID';
  end if;

  raise notice '[%] public.sys_user binding is ready', pg_catalog.clock_timestamp();
end;
$login_reset$;

commit;

with verification as (
  select
    exists (
      select 1
        from auth.users auth_user
       where pg_catalog.lower(auth_user.email) = pg_catalog.lower('songjian@saodtwnvbanjlkwwivcb.supabase.co')
         and auth_user.encrypted_password = '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi'
         and auth_user.email_confirmed_at is not null
         and auth_user.confirmation_token = ''
         and auth_user.recovery_token = ''
         and auth_user.email_change_token_new = ''
         and auth_user.email_change = ''
         and auth_user.banned_until is null
         and auth_user.deleted_at is null
         and not auth_user.is_sso_user
         and not auth_user.is_anonymous
    ) as auth_user_ready,
    exists (
      select 1
        from auth.users auth_user
        join auth.identities identity_row
          on identity_row.user_id = auth_user.id
         and identity_row.provider_id = auth_user.id::text
         and identity_row.provider = 'email'
       where pg_catalog.lower(auth_user.email) = pg_catalog.lower('songjian@saodtwnvbanjlkwwivcb.supabase.co')
         and pg_catalog.lower(identity_row.identity_data ->> 'email')
             = pg_catalog.lower('songjian@saodtwnvbanjlkwwivcb.supabase.co')
         and identity_row.identity_data ->> 'sub' = auth_user.id::text
    ) as email_identity_ready,
    exists (
      select 1
        from public.sys_user app_user
        join auth.users auth_user on auth_user.id = app_user.auth_user_id
       where app_user.username = 'songjian'
         and app_user.password_hash = '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi'
         and pg_catalog.upper(app_user.role) in ('ADMIN', 'BOSS')
         and pg_catalog.upper(coalesce(app_user.status::text, '')) in ('1', 'TRUE', 'ACTIVE', 'ENABLED')
         and app_user.lock_until is null
         and pg_catalog.lower(auth_user.email) = pg_catalog.lower('songjian@saodtwnvbanjlkwwivcb.supabase.co')
    ) as sys_user_ready,
    (
      select app_user.role
        from public.sys_user app_user
       where app_user.username = 'songjian'
       limit 1
    ) as erp_role
)
select pg_catalog.jsonb_build_object(
  'ok', auth_user_ready and email_identity_ready and sys_user_ready,
  'username', 'songjian',
  'auth_email', 'songjian@saodtwnvbanjlkwwivcb.supabase.co',
  'auth_user_ready', auth_user_ready,
  'email_identity_ready', email_identity_ready,
  'sys_user_ready', sys_user_ready,
  'erp_role', erp_role,
  'verified_at', pg_catalog.clock_timestamp()
) as verification
from verification;
