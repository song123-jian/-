-- Supabase cloud configuration for Inject ERP.
-- Run this file after database/init.sql in Supabase SQL Editor.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

insert into public.sys_config (config_key, config_value, config_desc)
values
  ('stock_expiry_warning_days', '30', '批次临期预警天数'),
  ('mold_lifetime_warning_ratio', '0.9', '模具寿命预警比例（达到寿命百分比时预警）')
on conflict (config_key) do update
  set config_desc = excluded.config_desc;

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
set search_path = public, extensions, pg_catalog
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
     or matched_user.password_hash <> crypt(login_password, matched_user.password_hash::text) then
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

-- Injection professional extension tables.
create table if not exists public.process_card (
  id bigserial primary key,
  card_no varchar(50) not null unique,
  product_id bigint not null,
  mold_id bigint,
  machine_id bigint,
  material_id bigint,
  version_no int not null default 1,
  material_temp numeric(10,2),
  mold_temp numeric(10,2),
  injection_pressure numeric(10,2),
  holding_pressure numeric(10,2),
  cooling_seconds int,
  cycle_seconds int,
  clamping_force numeric(10,2),
  back_pressure numeric(10,2),
  change_reason text,
  status varchar(64) default 'DRAFT',
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.trial_mold_record (
  id bigserial primary key,
  trial_no varchar(50) not null unique,
  prod_order_id bigint not null,
  process_card_id bigint not null,
  mold_id bigint,
  machine_id bigint,
  first_article_result varchar(100),
  image_urls jsonb default '[]'::jsonb,
  remark text,
  status varchar(64) default 'WAIT_TRIAL',
  created_by bigint,
  confirmed_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.material_mix_order (
  id bigserial primary key,
  mix_no varchar(50) not null unique,
  prod_order_id bigint not null,
  product_id bigint,
  material_batch_id bigint not null,
  material_qty numeric(12,3) not null,
  regrind_ratio numeric(6,2) default 0,
  drying_temp numeric(10,2),
  drying_minutes int,
  remark text,
  status varchar(64) default 'DRAFT',
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  constraint ck_material_mix_regrind check (regrind_ratio >= 0 and regrind_ratio <= 100)
);

create table if not exists public.batch_trace_link (
  id bigserial primary key,
  trace_no varchar(80) not null unique,
  source_type varchar(64) not null,
  source_id bigint not null,
  target_type varchar(64) not null,
  target_id bigint not null,
  batch_id bigint,
  prod_order_id bigint,
  sale_order_id bigint,
  remark text,
  status varchar(64) default 'DRAFT',
  created_at timestamp default current_timestamp
);

create table if not exists public.startup_check (
  id bigserial primary key,
  check_no varchar(50) not null unique,
  prod_order_id bigint not null,
  process_card_id bigint,
  material_ready boolean default false,
  mold_ready boolean default false,
  machine_ready boolean default false,
  first_article_ok boolean default false,
  staff_ready boolean default false,
  failed_items jsonb default '[]'::jsonb,
  failed_items_text text,
  remark text,
  status varchar(64) default 'PENDING',
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.maintenance_order (
  id bigserial primary key,
  order_no varchar(50) not null unique,
  machine_id bigint not null,
  fault_type varchar(100) not null,
  priority varchar(64) default 'INFO',
  assignee_id bigint,
  spare_part_cost numeric(12,2) default 0,
  remark text,
  status varchar(64) default 'REPORTED',
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.spare_part (
  id bigserial primary key,
  code varchar(50) unique,
  name varchar(100) not null,
  spec varchar(200),
  qty numeric(12,3) default 0,
  safe_stock numeric(12,3) default 0,
  unit varchar(20) default 'pcs',
  remark text,
  status varchar(64) default 'ACTIVE',
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.mold_maintenance_plan (
  id bigserial primary key,
  plan_no varchar(50) not null unique,
  mold_id bigint not null,
  mold_code varchar(80),
  maintenance_cycle int not null,
  shots_since_maintenance int default 0,
  lifetime int default 0,
  used_shots int default 0,
  abnormal_count int default 0,
  last_maintenance_date date,
  next_maintenance_date date,
  maintenance_rate numeric(8,2) default 0,
  life_rate numeric(8,2) default 0,
  risk_level varchar(64) default 'normal',
  remark text,
  status varchar(64) default 'NORMAL',
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.andon_event (
  id bigserial primary key,
  event_no varchar(50) not null unique,
  source_type varchar(64) not null,
  source_id bigint,
  level varchar(64) default 'INFO',
  title varchar(200) not null,
  description text,
  assignee_id bigint,
  closed_reason text,
  status varchar(64) default 'OPEN',
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.label_template (
  id bigserial primary key,
  template_no varchar(50) not null unique,
  name varchar(100) not null,
  target_type varchar(64) not null,
  template_content text,
  version_no int default 1,
  status varchar(64) default 'ACTIVE',
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.customer_complaint (
  id bigserial primary key,
  complaint_no varchar(50) not null unique,
  customer_id bigint not null,
  product_id bigint,
  batch_id bigint,
  severity varchar(64) default 'INFO',
  defect_desc text,
  corrective_action text,
  preventive_action text,
  d1_team text,
  d2_problem text,
  d3_containment text,
  d4_root_cause text,
  d5_corrective_action text,
  d6_implementation text,
  d7_prevention text,
  d8_closure text,
  status varchar(64) default 'REGISTERED',
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.oee_record (
  id bigserial primary key,
  record_no varchar(50) unique,
  record_date date not null,
  shift varchar(64) not null,
  machine_id bigint not null,
  planned_minutes int not null,
  running_minutes int not null,
  ideal_cycle_seconds numeric(10,2),
  actual_qty int default 0,
  good_qty int default 0,
  downtime_minutes int default 0,
  changeover_minutes int default 0,
  availability numeric(8,2) default 0,
  performance numeric(8,2) default 0,
  quality_rate numeric(8,2) default 0,
  oee numeric(8,2) default 0,
  status varchar(64) default 'DRAFT',
  created_by bigint,
  created_at timestamp default current_timestamp
);

create table if not exists public.process_change (
  id bigserial primary key,
  change_no varchar(50) not null unique,
  change_type varchar(64) not null,
  target_type varchar(64) not null,
  target_id bigint not null,
  old_version varchar(50),
  new_version varchar(50),
  reason text,
  effective_at timestamp,
  status varchar(64) default 'DRAFT',
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.purchase_requisition (
  id bigserial primary key,
  requisition_no varchar(50) not null unique,
  material_id bigint not null,
  shortage_qty numeric(12,3) default 0,
  requested_qty numeric(12,3) not null,
  supplier_id bigint,
  expected_date date,
  source_mrp_no varchar(80),
  remark text,
  status varchar(64) default 'DRAFT',
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create index if not exists idx_process_card_product_status on public.process_card (product_id, status);
create index if not exists idx_trial_mold_order_status on public.trial_mold_record (prod_order_id, status);
create index if not exists idx_material_mix_order_batch on public.material_mix_order (prod_order_id, material_batch_id);
create index if not exists idx_batch_trace_lookup on public.batch_trace_link (batch_id, prod_order_id, sale_order_id);
create index if not exists idx_startup_check_order_status on public.startup_check (prod_order_id, status);
create index if not exists idx_maintenance_machine_status on public.maintenance_order (machine_id, status);
create index if not exists idx_mold_maintenance_plan_status on public.mold_maintenance_plan (mold_id, status, risk_level);
create index if not exists idx_andon_status_level on public.andon_event (status, level);
create index if not exists idx_complaint_customer_status on public.customer_complaint (customer_id, status);
create index if not exists idx_oee_machine_date on public.oee_record (machine_id, record_date);
create index if not exists idx_process_change_target on public.process_change (target_type, target_id);
create index if not exists idx_purchase_requisition_material_status on public.purchase_requisition (material_id, status);

grant select, insert, update, delete on table public.process_card, public.trial_mold_record, public.material_mix_order, public.batch_trace_link, public.startup_check, public.maintenance_order, public.spare_part, public.mold_maintenance_plan, public.andon_event, public.label_template, public.customer_complaint, public.oee_record, public.process_change, public.purchase_requisition to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
