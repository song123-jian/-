-- Supabase cloud configuration for Inject ERP.
-- Run this file after database/init.sql in Supabase SQL Editor.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

insert into public.sys_config (config_key, config_value, config_desc)
values
  ('stock_expiry_warning_days', '30', '批次临期预警天数'),
  ('mold_lifetime_warning_ratio', '0.9', '模具寿命预警比例（达到寿命百分比时预警）')
on conflict (config_key) do update
  set config_desc = excluded.config_desc;

alter table if exists public.stock_move
  add column if not exists unit_cost numeric(12,4),
  add column if not exists amount numeric(14,2),
  add column if not exists sale_order_item_id bigint,
  add column if not exists delivery_order_id bigint,
  add column if not exists delivery_order_item_id bigint;

alter table if exists public.delivery_order_item
  add column if not exists stock_move_id bigint;

create table if not exists public.stock_transfer (
  id bigserial primary key,
  transfer_no varchar(50) not null unique,
  from_warehouse_id bigint not null,
  to_warehouse_id bigint not null,
  status varchar(64) default 'DRAFT',
  operator_id bigint,
  receive_time timestamp,
  remark text,
  created_at timestamp default current_timestamp
);

create table if not exists public.stock_transfer_item (
  id bigserial primary key,
  transfer_id bigint not null,
  product_id bigint not null,
  from_location_id bigint,
  to_location_id bigint,
  from_batch_id bigint,
  qty int not null,
  received_qty int default 0,
  remark varchar(500)
);

alter table if exists public.prod_order
  add column if not exists picked_material_qty numeric(10,2) default 0,
  add column if not exists picked_material_amount numeric(14,2) default 0,
  add column if not exists inbounded_qty numeric(10,2) default 0,
  add column if not exists inbounded_amount numeric(14,2) default 0;

alter table if exists public.prod_report
  add column if not exists process_name varchar(50) default '注塑';

update public.prod_report
   set process_name = '注塑'
 where process_name is null
    or btrim(process_name) = '';

alter table if exists public.prod_report
  alter column process_name set default '注塑',
  alter column process_name set not null;

alter table if exists public.sale_order
  add column if not exists received_opening_amount numeric(12,2) default 0;

alter table if exists public.salary_adjust
  add column if not exists status varchar(64) default 'DRAFT',
  add column if not exists confirmed_by bigint,
  add column if not exists confirmed_at timestamp;

update public.salary_adjust
   set adjust_type = case
     when upper(coalesce(adjust_type, '')) in ('BONUS', 'REWARD', 'SUBSIDY', 'ALLOWANCE') then 'BONUS'
     when upper(coalesce(adjust_type, '')) in ('PENALTY', 'DEDUCTION', 'FINE') then 'PENALTY'
     when adjust_type in ('奖励', '奖金', '补贴') then 'BONUS'
     when adjust_type in ('惩罚', '扣款', '罚款') then 'PENALTY'
     else upper(coalesce(adjust_type, ''))
   end
 where adjust_type is not null;

update public.salary_daily
   set status = upper(coalesce(status, 'DRAFT'))
 where status is not null;

update public.salary_adjust
   set status = upper(coalesce(status, 'DRAFT'))
 where status is not null;

update public.sale_order
   set received_opening_amount = greatest(coalesce(received_amount, 0) - coalesce(payment_sum.pay_amount, 0), 0)
  from (
    select sale_order_id, sum(pay_amount) as pay_amount
      from public.payment_record
     where sale_order_id is not null
     group by sale_order_id
  ) payment_sum
 where public.sale_order.id = payment_sum.sale_order_id
   and coalesce(public.sale_order.received_opening_amount, 0) = 0
   and coalesce(public.sale_order.received_amount, 0) > coalesce(payment_sum.pay_amount, 0);

do $$
begin
  if not exists (select 1 from public.payment_record where sale_order_id is null limit 1) then
    alter table public.payment_record alter column sale_order_id set not null;
  elsif not exists (
    select 1
      from pg_constraint
     where conname = 'ck_payment_record_sale_order_required'
       and conrelid = 'public.payment_record'::regclass
  ) then
    alter table public.payment_record
      add constraint ck_payment_record_sale_order_required check (sale_order_id is not null) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_salary_daily_status'
       and conrelid = 'public.salary_daily'::regclass
  ) then
    alter table public.salary_daily
      add constraint ck_salary_daily_status check (status in ('DRAFT', 'SETTLED')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'fk_product_customer'
       and conrelid = 'public.product'::regclass
  ) then
    alter table public.product
      add constraint fk_product_customer
      foreign key (customer_id) references public.customer(id) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'fk_sale_order_customer'
       and conrelid = 'public.sale_order'::regclass
  ) then
    alter table public.sale_order
      add constraint fk_sale_order_customer
      foreign key (customer_id) references public.customer(id) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'fk_payment_record_customer'
       and conrelid = 'public.payment_record'::regclass
  ) then
    alter table public.payment_record
      add constraint fk_payment_record_customer
      foreign key (customer_id) references public.customer(id) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_salary_adjust_type'
       and conrelid = 'public.salary_adjust'::regclass
  ) then
    alter table public.salary_adjust
      add constraint ck_salary_adjust_type check (adjust_type in ('BONUS', 'PENALTY')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_salary_adjust_amount'
       and conrelid = 'public.salary_adjust'::regclass
  ) then
    alter table public.salary_adjust
      add constraint ck_salary_adjust_amount check (amount > 0) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_salary_adjust_status'
       and conrelid = 'public.salary_adjust'::regclass
  ) then
    alter table public.salary_adjust
      add constraint ck_salary_adjust_status check (status in ('DRAFT', 'SETTLED')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_payment_record_pay_amount_positive'
       and conrelid = 'public.payment_record'::regclass
  ) then
    alter table public.payment_record
      add constraint ck_payment_record_pay_amount_positive check (pay_amount > 0) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_sale_order_amounts'
       and conrelid = 'public.sale_order'::regclass
  ) then
    alter table public.sale_order
      add constraint ck_sale_order_amounts check (
        coalesce(total_amount, 0) >= 0
        and coalesce(received_amount, 0) >= 0
        and coalesce(received_opening_amount, 0) >= 0
        and coalesce(received_amount, 0) <= coalesce(total_amount, 0)
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'fk_payment_record_sale_order'
       and conrelid = 'public.payment_record'::regclass
  ) then
    alter table public.payment_record
      add constraint fk_payment_record_sale_order
      foreign key (sale_order_id) references public.sale_order(id) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_stock_transfer_status'
       and conrelid = 'public.stock_transfer'::regclass
  ) then
    alter table public.stock_transfer
      add constraint ck_stock_transfer_status check (status in ('DRAFT', 'CONFIRMED', 'SHIPPED', 'RECEIVED', 'CANCELLED', 'REJECTED')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'fk_stock_transfer_item_transfer'
       and conrelid = 'public.stock_transfer_item'::regclass
  ) then
    alter table public.stock_transfer_item
      add constraint fk_stock_transfer_item_transfer
      foreign key (transfer_id) references public.stock_transfer(id) on delete cascade not valid;
  end if;
end $$;

create index if not exists idx_stock_move_reason_time
  on public.stock_move (move_type, move_reason, operate_time desc);

create index if not exists idx_stock_move_batch
  on public.stock_move (batch_id);

create index if not exists idx_stock_move_prod_picking
  on public.stock_move (related_order_id, product_id)
  where related_order_type = 'PROD_ORDER' and move_reason = 'OUT_PICKING';

create index if not exists idx_stock_move_prod_inbound
  on public.stock_move (related_order_id, product_id)
  where related_order_type = 'PROD_ORDER' and move_reason = 'IN_PRODUCE';

create index if not exists idx_stock_move_sale_item
  on public.stock_move (sale_order_item_id)
  where related_order_type = 'SALE_ORDER' and move_reason = 'OUT_SALE';

create index if not exists idx_stock_move_delivery_order
  on public.stock_move (delivery_order_id)
  where related_order_type = 'SALE_ORDER' and move_reason = 'OUT_SALE';

create index if not exists idx_stock_move_transfer_order
  on public.stock_move (related_order_id, product_id)
  where related_order_type = 'STOCK_TRANSFER' and move_reason = 'TRANSFER';

create index if not exists idx_delivery_order_sale_order
  on public.delivery_order (sale_order_id, delivery_date desc);

create index if not exists idx_delivery_order_customer_date
  on public.delivery_order (customer_id, delivery_date desc);

create index if not exists idx_delivery_item_order
  on public.delivery_order_item (delivery_order_id);

create index if not exists idx_delivery_item_stock_move
  on public.delivery_order_item (stock_move_id);

create index if not exists idx_stock_transfer_status_time
  on public.stock_transfer (status, created_at desc);

create index if not exists idx_stock_transfer_item_transfer
  on public.stock_transfer_item (transfer_id);

create index if not exists idx_stock_transfer_item_product_batch
  on public.stock_transfer_item (product_id, from_batch_id);

create index if not exists idx_salary_daily_work_date_user
  on public.salary_daily (work_date, user_id);

create index if not exists idx_salary_adjust_date_user
  on public.salary_adjust (adjust_date, user_id);

create index if not exists idx_prod_report_order_process_time
  on public.prod_report (prod_order_id, process_name, start_time);

create index if not exists idx_piece_price_product_process_date
  on public.piece_price (product_id, process_name, effective_date desc);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_prod_report_process_name'
       and conrelid = 'public.prod_report'::regclass
  ) then
    alter table public.prod_report
      add constraint ck_prod_report_process_name check (length(btrim(process_name)) between 1 and 50) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_piece_price_positive'
       and conrelid = 'public.piece_price'::regclass
  ) then
    alter table public.piece_price
      add constraint ck_piece_price_positive check (price > 0) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_piece_price_date_range'
       and conrelid = 'public.piece_price'::regclass
  ) then
    alter table public.piece_price
      add constraint ck_piece_price_date_range check (expire_date is null or expire_date >= effective_date) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'fk_piece_price_product'
       and conrelid = 'public.piece_price'::regclass
  ) then
    alter table public.piece_price
      add constraint fk_piece_price_product
      foreign key (product_id) references public.product(id) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_delivery_status'
       and conrelid = 'public.delivery_order'::regclass
  ) then
    alter table public.delivery_order
      add constraint ck_delivery_status check (status in ('PENDING', 'SHIPPED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_delivery_item_qty_positive'
       and conrelid = 'public.delivery_order_item'::regclass
  ) then
    alter table public.delivery_order_item
      add constraint ck_delivery_item_qty_positive check (qty > 0) not valid;
  end if;
end $$;

create index if not exists idx_material_batch_supplier
  on public.material_batch (supplier_id);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'fk_material_batch_supplier'
       and conrelid = 'public.material_batch'::regclass
  ) then
    alter table public.material_batch
      add constraint fk_material_batch_supplier foreign key (supplier_id) references public.supplier(id) not valid;
  end if;
end $$;

create index if not exists idx_payment_record_sale_order
  on public.payment_record (sale_order_id, pay_date desc);

create index if not exists idx_payment_record_customer_date
  on public.payment_record (customer_id, pay_date desc);

create index if not exists idx_expense_record_date
  on public.expense_record (expense_date desc);

create index if not exists idx_expense_record_type_date
  on public.expense_record (expense_type, expense_date desc);

create index if not exists idx_expense_record_search_trgm
  on public.expense_record using gin ((coalesce(expense_no, '') || ' ' || coalesce(payee, '') || ' ' || coalesce(remark, '')) gin_trgm_ops);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_expense_type'
       and conrelid = 'public.expense_record'::regclass
  ) then
    alter table public.expense_record
      add constraint ck_expense_type check (expense_type in ('RENT', 'ELECTRICITY', 'WATER', 'MATERIAL', 'MAINTENANCE', 'SALARY', 'OTHER')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_expense_amount_positive'
       and conrelid = 'public.expense_record'::regclass
  ) then
    alter table public.expense_record
      add constraint ck_expense_amount_positive check (amount > 0) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'ck_expense_payee_required'
       and conrelid = 'public.expense_record'::regclass
  ) then
    alter table public.expense_record
      add constraint ck_expense_payee_required check (btrim(coalesce(payee, '')) <> '') not valid;
  end if;
end $$;

create or replace function public.erp_recalculate_sale_order_received(target_sale_order_id bigint)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  next_received numeric(12,2);
  order_total numeric(12,2);
begin
  select total_amount
    into order_total
    from public.sale_order
   where id = target_sale_order_id
   for update;

  if not found then
    raise exception '未找到销售订单' using errcode = 'P0001';
  end if;

  select coalesce(so.received_opening_amount, 0) + coalesce(sum(pr.pay_amount), 0)
    into next_received
    from public.sale_order so
    left join public.payment_record pr on pr.sale_order_id = so.id
   where so.id = target_sale_order_id
   group by so.id, so.received_opening_amount;

  if next_received < 0 then
    raise exception '销售订单已回款金额不能小于 0' using errcode = 'P0001';
  end if;

  if order_total is not null and next_received > order_total then
    raise exception '回款金额不能超过订单金额' using errcode = 'P0001';
  end if;

  update public.sale_order
     set received_amount = next_received,
         updated_at = now()
   where id = target_sale_order_id;

  return next_received;
end;
$$;

create or replace function public.erp_payment_record_sync_sale_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_status text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if new.sale_order_id is null then
      raise exception '请选择销售订单' using errcode = 'P0001';
    end if;

    if new.pay_amount <= 0 then
      raise exception '回款金额必须大于 0' using errcode = 'P0001';
    end if;

    select status
      into target_status
      from public.sale_order
     where id = new.sale_order_id
     for update;

    if target_status is null then
      raise exception '未找到销售订单' using errcode = 'P0001';
    end if;

    if upper(coalesce(target_status, '')) not in ('APPROVED', 'CONFIRMED', 'PARTIAL', 'SHIPPED') then
      raise exception '销售订单状态不允许回款' using errcode = 'P0001';
    end if;

    perform public.erp_recalculate_sale_order_received(new.sale_order_id);
  end if;

  if tg_op = 'UPDATE' and old.sale_order_id is distinct from new.sale_order_id then
    perform public.erp_recalculate_sale_order_received(old.sale_order_id);
  elsif tg_op = 'DELETE' then
    perform public.erp_recalculate_sale_order_received(old.sale_order_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payment_record_sync_sale_order on public.payment_record;
create trigger trg_payment_record_sync_sale_order
after insert or update or delete on public.payment_record
for each row execute function public.erp_payment_record_sync_sale_order();

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
