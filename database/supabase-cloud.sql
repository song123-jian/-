-- Supabase cloud configuration for Inject ERP.
-- Run this file after database/init.sql in Supabase SQL Editor.

create extension if not exists pgcrypto;

create or replace function public.erp_login(login_name text, login_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
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
     or matched_user.password_hash <> crypt(login_password, matched_user.password_hash) then
    update public.sys_user
       set login_fail_count = coalesce(login_fail_count, 0) + 1,
           updated_at = now()
     where id = matched_user.id;
    raise exception '用户名或密码错误' using errcode = 'P0001';
  end if;

  session_token := encode(gen_random_bytes(32), 'hex');

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

insert into storage.buckets (id, name, public)
values ('erp-files', 'erp-files', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "erp files public read" on storage.objects;
create policy "erp files public read"
on storage.objects for select
using (bucket_id = 'erp-files');

drop policy if exists "erp files authenticated write" on storage.objects;
create policy "erp files authenticated write"
on storage.objects for insert
with check (bucket_id = 'erp-files');

-- Keep the initial migration permissive for browser-only operation.
-- Tighten these policies per role before production use.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

alter default privileges in schema public
grant select, insert, update, delete on tables to anon, authenticated;

alter default privileges in schema public
grant usage, select on sequences to anon, authenticated;
