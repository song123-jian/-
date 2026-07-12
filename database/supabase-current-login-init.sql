-- Safe login initialization for the currently connected Supabase project.
-- Run this file in Supabase SQL Editor when /login reports "Invalid login credentials"
-- while the ERP schema already exists.
--
-- Default account after execution:
--   username: songjian
--   phone:    13800000000
--   password: 123456

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

insert into public.sys_user (
  username,
  real_name,
  phone,
  password_hash,
  role,
  status,
  login_fail_count,
  created_at,
  updated_at
)
values (
  'songjian',
  '宋建',
  '13800000000',
  '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi',
  'BOSS',
  1,
  0,
  now(),
  now()
)
on conflict (username) do update
set real_name = excluded.real_name,
    phone = excluded.phone,
    password_hash = excluded.password_hash,
    role = excluded.role,
    status = excluded.status,
    login_fail_count = 0,
    updated_at = now();

create or replace function public.erp_login(login_name text, login_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  matched_user public.sys_user%rowtype;
  session_token text;
begin
  select *
    into matched_user
    from public.sys_user
   where (username = login_name or phone = login_name)
     and coalesce(status, 1) = 1
   limit 1;

  if matched_user.id is null then
    raise exception '用户名或密码错误' using errcode = 'P0001';
  end if;

  if matched_user.password_hash is null
     or matched_user.password_hash <> extensions.crypt(login_password, matched_user.password_hash::text) then
    update public.sys_user
       set login_fail_count = coalesce(login_fail_count, 0) + 1,
           updated_at = now()
     where id = matched_user.id;
    raise exception '用户名或密码错误' using errcode = 'P0001';
  end if;

  session_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.sys_user
     set login_fail_count = 0,
         last_login_at = now(),
         updated_at = now()
   where id = matched_user.id;

  return jsonb_build_object(
    'token', session_token,
    'userId', matched_user.id,
    'username', matched_user.username,
    'userName', matched_user.username,
    'realName', matched_user.real_name,
    'phone', matched_user.phone,
    'role', matched_user.role,
    'roles', jsonb_build_array(matched_user.role)
  );
end;
$$;

grant execute on function public.erp_login(text, text) to anon, authenticated;

-- Verification queries. Both should return a JSON object containing userName = songjian.
select public.erp_login('songjian', '123456') as login_by_username;
select public.erp_login('13800000000', '123456') as login_by_phone;
