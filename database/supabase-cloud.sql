-- Inject ERP full Supabase bootstrap.
-- Target: a new Supabase project or a project initialized with the matching init.sql.
-- Execute this file as one batch. Object creation is retry-safe for the current schema.
-- This file is self-contained: it does not include other SQL files or migrate legacy data.
-- Run only this file for a fresh project. Do not run init.sql or the legacy patch files afterward.
-- Deploy supabase/functions/erp-user-admin before using the in-app user administration page.
-- After this transaction commits, create the Auth user in Supabase Authentication and bind its UUID:
--   select public.bind_mold_auth_user(<sys_user_id>, '<auth.users.id>'::uuid);

begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('inject-erp:supabase-cloud-bootstrap', 0)
);

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
set local search_path = pg_catalog, extensions, public;

-- -----------------------------------------------------------------------------
-- 1. Base ERP schema
-- -----------------------------------------------------------------------------

create table if not exists public.sys_user (
  id bigserial primary key,
  username varchar(50) not null unique,
  real_name varchar(50) not null,
  phone varchar(20),
  auth_user_id uuid unique,
  password_hash varchar(255) not null,
  role varchar(64) not null,
  status smallint default 1,
  login_fail_count int default 0,
  lock_until timestamp,
  last_login_at timestamp,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

-- Compatibility for projects initialized with an earlier init.sql.
alter table public.sys_user
  add column if not exists auth_user_id uuid;

do $sys_user_auth_unique$
begin
  if not exists (
    select 1
      from pg_catalog.pg_index
     where indrelid = 'public.sys_user'::pg_catalog.regclass
       and indisunique
       and indnkeyatts = 1
       and indpred is null
       and pg_catalog.pg_get_indexdef(indexrelid, 1, true) = 'auth_user_id'
  ) then
    create unique index uq_sys_user_auth_user_id on public.sys_user (auth_user_id);
  end if;
end;
$sys_user_auth_unique$;

create table if not exists public.machine (
  id bigserial primary key,
  code varchar(50) not null unique,
  name varchar(100) not null,
  model varchar(100),
  tonnage int,
  status varchar(64) default 'IDLE',
  qr_code varchar(255),
  location varchar(100),
  factory_code varchar(50),
  workshop varchar(100),
  purchase_date date,
  remark text,
  created_at timestamp default current_timestamp
);

create table if not exists public.customer (
  id bigserial primary key,
  code varchar(50) not null unique,
  name varchar(100) not null,
  short_name varchar(50),
  contact varchar(50),
  phone varchar(20),
  address varchar(500),
  tax_no varchar(50),
  invoice_title varchar(200),
  credit_level varchar(64) default 'B',
  payment_days int default 30,
  sales_user_id bigint,
  status smallint default 1,
  created_at timestamp default current_timestamp
);

create table if not exists public.supplier (
  id bigserial primary key,
  code varchar(50) not null unique,
  name varchar(100) not null,
  contact varchar(50),
  phone varchar(20),
  address varchar(500),
  main_material varchar(200),
  status smallint default 1,
  created_at timestamp default current_timestamp
);

create table if not exists public.product (
  id bigserial primary key,
  code varchar(50) not null unique,
  name varchar(100) not null,
  spec varchar(200),
  type varchar(64) not null,
  unit varchar(20) default '个',
  piece_price numeric(10,4),
  cavity_yield int,
  cycle_time_sec int,
  safe_stock int default 0,
  weight_g numeric(10,2),
  raw_material_id bigint,
  raw_material_usage numeric(10,4),
  color varchar(50),
  customer_id bigint references public.customer(id),
  image_url varchar(500),
  status smallint default 1,
  created_at timestamp default current_timestamp
);

create table if not exists public.mold (
  id bigserial primary key,
  code varchar(50) not null unique,
  name varchar(100) not null,
  product_id bigint references public.product(id),
  cavities int not null,
  lifetime int,
  used_shots int default 0,
  shots_since_maintenance int default 0,
  maintenance_cycle int,
  maintenance_count int default 0,
  last_maintenance_at timestamp,
  status varchar(64) default 'NORMAL',
  remark text,
  created_at timestamp default current_timestamp
);

create table if not exists public.sale_order (
  id bigserial primary key,
  order_no varchar(50) not null unique,
  customer_id bigint not null references public.customer(id),
  order_date date not null,
  delivery_date date,
  total_amount numeric(12,2),
  received_amount numeric(12,2) default 0,
  received_opening_amount numeric(12,2) default 0,
  status varchar(64) default 'DRAFT',
  sales_user_id bigint,
  remark text,
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  constraint ck_sale_order_amounts check (
    coalesce(total_amount, 0) >= 0
    and coalesce(received_amount, 0) >= 0
    and coalesce(received_opening_amount, 0) >= 0
    and coalesce(received_amount, 0) <= coalesce(total_amount, 0)
  )
);

create table if not exists public.sale_order_item (
  id bigserial primary key,
  sale_order_id bigint not null references public.sale_order(id),
  product_id bigint not null references public.product(id),
  qty int not null,
  unit_price numeric(10,4),
  amount numeric(12,2),
  delivered_qty int default 0,
  produced_qty int default 0,
  remark varchar(500)
);

create table if not exists public.prod_order (
  id bigserial primary key,
  order_no varchar(50) not null unique,
  sale_order_id bigint references public.sale_order(id),
  sale_order_item_id bigint references public.sale_order_item(id),
  product_id bigint not null references public.product(id),
  machine_id bigint references public.machine(id),
  mold_id bigint references public.mold(id),
  plan_qty int not null,
  completed_qty int default 0,
  qualified_qty int default 0,
  bad_qty int default 0,
  raw_material_qty numeric(10,2),
  picked_material_qty numeric(10,2) default 0,
  picked_material_amount numeric(14,2) default 0,
  inbounded_qty numeric(10,2) default 0,
  inbounded_amount numeric(14,2) default 0,
  plan_start timestamp,
  plan_end timestamp,
  actual_start timestamp,
  actual_end timestamp,
  status varchar(64) default 'WAITING',
  priority int default 5,
  remark text,
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.prod_report (
  id bigserial primary key,
  prod_order_id bigint not null references public.prod_order(id),
  user_id bigint not null,
  machine_id bigint not null references public.machine(id),
  mold_id bigint references public.mold(id),
  report_type varchar(64) not null,
  process_name varchar(50) not null default '注塑',
  shift varchar(64),
  qty int default 0,
  bad_qty int default 0,
  shots int default 0,
  start_time timestamp,
  end_time timestamp,
  work_minutes int,
  sync_status smallint default 1,
  created_at timestamp default current_timestamp,
  constraint ck_prod_report_process_name check (length(btrim(process_name)) between 1 and 50)
);

create table if not exists public.downtime_record (
  id bigserial primary key,
  prod_order_id bigint references public.prod_order(id),
  machine_id bigint not null references public.machine(id),
  reason varchar(64) not null,
  start_time timestamp not null,
  end_time timestamp,
  duration_minutes int,
  operator_id bigint,
  remark text,
  created_at timestamp default current_timestamp
);

create table if not exists public.mold_mount_record (
  id bigserial primary key,
  mold_id bigint not null references public.mold(id),
  machine_id bigint not null references public.machine(id),
  prod_order_id bigint references public.prod_order(id),
  mount_type varchar(64) not null,
  operator_id bigint,
  operate_time timestamp not null,
  remark text
);

create table if not exists public.mold_maintenance_record (
  id bigserial primary key,
  mold_id bigint not null references public.mold(id),
  operator_id bigint,
  used_shots_before int not null,
  shots_since_maintenance_before int not null,
  maintenance_count_before int not null,
  operate_time timestamp not null,
  remark text
);

create table if not exists public.machine_inspection_record (
  id bigserial primary key,
  machine_id bigint not null references public.machine(id),
  inspector_id bigint not null,
  inspect_time timestamp not null,
  result varchar(64) not null,
  items_checked varchar(500),
  issues varchar(500),
  remark text
);

create table if not exists public.qc_record (
  id bigserial primary key,
  prod_order_id bigint references public.prod_order(id),
  product_id bigint not null references public.product(id),
  check_type varchar(64) not null,
  check_result varchar(64) not null,
  defect_type varchar(50),
  defect_desc varchar(500),
  defect_qty int default 0,
  sample_qty int,
  checker_id bigint not null,
  check_time timestamp not null,
  image_urls varchar(1000),
  disposal_status varchar(32) default 'OPEN',
  disposal_assignee varchar(100),
  disposal_close_reason text,
  disposal_updated_at timestamp,
  remark text,
  created_at timestamp default current_timestamp
);

create table if not exists public.warehouse (
  id bigserial primary key,
  code varchar(50) not null unique,
  name varchar(100) not null,
  type varchar(64) not null,
  address varchar(200),
  factory_code varchar(50),
  workshop varchar(100),
  manager_id bigint,
  is_enabled smallint default 1,
  created_at timestamp default current_timestamp
);

create table if not exists public.warehouse_location (
  id bigserial primary key,
  warehouse_id bigint not null references public.warehouse(id),
  code varchar(50) not null,
  name varchar(100),
  area varchar(50),
  shelf varchar(50),
  layer int,
  position int,
  is_enabled smallint default 1,
  constraint uk_wh_location unique (warehouse_id, code)
);

create table if not exists public.material_batch (
  id bigserial primary key,
  batch_no varchar(50) not null unique,
  product_id bigint not null references public.product(id),
  warehouse_id bigint not null references public.warehouse(id),
  supplier_id bigint references public.supplier(id),
  production_date date,
  expiry_date date,
  initial_qty int,
  remaining_qty int default 0,
  status varchar(64) default 'NORMAL',
  created_at timestamp default current_timestamp
);

create table if not exists public.stock (
  id bigserial primary key,
  product_id bigint not null references public.product(id),
  warehouse_id bigint not null references public.warehouse(id),
  location_id bigint references public.warehouse_location(id),
  batch_id bigint references public.material_batch(id),
  qty int default 0,
  locked_qty int default 0,
  updated_at timestamp default current_timestamp,
  constraint uk_stock unique (product_id, warehouse_id, location_id, batch_id)
);

create table if not exists public.stock_move (
  id bigserial primary key,
  move_no varchar(50) not null unique,
  product_id bigint not null references public.product(id),
  warehouse_id bigint not null references public.warehouse(id),
  location_id bigint references public.warehouse_location(id),
  batch_id bigint references public.material_batch(id),
  to_warehouse_id bigint references public.warehouse(id),
  to_location_id bigint references public.warehouse_location(id),
  to_batch_id bigint references public.material_batch(id),
  move_type varchar(64) not null,
  move_reason varchar(64) not null,
  qty int not null,
  sale_order_item_id bigint references public.sale_order_item(id),
  delivery_order_id bigint,
  delivery_order_item_id bigint,
  related_order_id bigint,
  related_order_type varchar(64),
  unit_cost numeric(12,4),
  amount numeric(14,2),
  operator_id bigint,
  operate_time timestamp not null,
  remark text,
  created_at timestamp default current_timestamp
);

create table if not exists public.stock_transfer (
  id bigserial primary key,
  transfer_no varchar(50) not null unique,
  from_warehouse_id bigint not null references public.warehouse(id),
  to_warehouse_id bigint not null references public.warehouse(id),
  status varchar(64) default 'DRAFT',
  operator_id bigint,
  receive_time timestamp,
  remark text,
  created_at timestamp default current_timestamp,
  constraint ck_stock_transfer_status check (status in ('DRAFT', 'CONFIRMED', 'SHIPPED', 'RECEIVED', 'CANCELLED', 'REJECTED'))
);

create table if not exists public.stock_transfer_item (
  id bigserial primary key,
  transfer_id bigint not null references public.stock_transfer(id) on delete cascade,
  product_id bigint not null references public.product(id),
  from_location_id bigint references public.warehouse_location(id),
  to_location_id bigint references public.warehouse_location(id),
  from_batch_id bigint references public.material_batch(id),
  qty int not null,
  received_qty int default 0,
  remark varchar(500)
);

create table if not exists public.stock_inventory (
  id bigserial primary key,
  inventory_no varchar(50) not null unique,
  warehouse_id bigint not null references public.warehouse(id),
  inventory_type varchar(64) not null,
  status varchar(64) default 'DRAFT',
  freeze_stock smallint default 0,
  operator_id bigint,
  approver_id bigint,
  remark text,
  created_at timestamp default current_timestamp
);

create table if not exists public.stock_inventory_item (
  id bigserial primary key,
  inventory_id bigint not null references public.stock_inventory(id) on delete cascade,
  product_id bigint not null references public.product(id),
  location_id bigint references public.warehouse_location(id),
  batch_id bigint references public.material_batch(id),
  book_qty int default 0,
  actual_qty int default 0,
  diff_qty int default 0,
  diff_amount numeric(12,2),
  reason varchar(200)
);

create table if not exists public.piece_price (
  id bigserial primary key,
  product_id bigint not null references public.product(id),
  process_name varchar(50) default '注塑',
  price numeric(10,4) not null,
  effective_date date not null,
  expire_date date,
  created_by bigint,
  created_at timestamp default current_timestamp,
  constraint ck_piece_price_positive check (price > 0),
  constraint ck_piece_price_date_range check (expire_date is null or expire_date >= effective_date)
);

create table if not exists public.salary_daily (
  id bigserial primary key,
  user_id bigint not null,
  work_date date not null,
  total_qualified_qty int default 0,
  total_piece_amount numeric(10,4) default 0,
  subsidy numeric(10,4) default 0,
  deduction numeric(10,4) default 0,
  total_amount numeric(10,4) default 0,
  status varchar(64) default 'DRAFT',
  confirmed_by bigint,
  confirmed_at timestamp,
  created_at timestamp default current_timestamp,
  constraint uk_user_date unique (user_id, work_date),
  constraint ck_salary_daily_status check (status in ('DRAFT', 'SETTLED'))
);

create table if not exists public.salary_adjust (
  id bigserial primary key,
  user_id bigint not null,
  adjust_type varchar(64) not null,
  amount numeric(10,4) not null,
  adjust_date date not null,
  reason varchar(500),
  status varchar(64) default 'DRAFT',
  confirmed_by bigint,
  confirmed_at timestamp,
  created_by bigint,
  created_at timestamp default current_timestamp,
  constraint ck_salary_adjust_type check (adjust_type in ('BONUS', 'PENALTY')),
  constraint ck_salary_adjust_amount check (amount > 0),
  constraint ck_salary_adjust_status check (status in ('DRAFT', 'SETTLED'))
);

create table if not exists public.payment_record (
  id bigserial primary key,
  payment_no varchar(50) not null unique,
  customer_id bigint not null references public.customer(id),
  sale_order_id bigint not null references public.sale_order(id),
  pay_amount numeric(12,2) not null check (pay_amount > 0),
  pay_date date not null,
  pay_method varchar(64) not null,
  invoice_no varchar(50),
  remark text,
  created_by bigint,
  created_at timestamp default current_timestamp
);

create table if not exists public.delivery_order (
  id bigserial primary key,
  delivery_no varchar(50) not null unique,
  sale_order_id bigint not null references public.sale_order(id),
  customer_id bigint not null references public.customer(id),
  delivery_date date not null,
  total_qty int,
  logistics_company varchar(100),
  tracking_no varchar(100),
  status varchar(64) default 'PENDING',
  operator_id bigint,
  remark text,
  created_at timestamp default current_timestamp,
  constraint ck_delivery_status check (status in ('PENDING', 'SHIPPED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED')),
  constraint ck_delivery_total_qty check (coalesce(total_qty, 0) >= 0)
);

create table if not exists public.delivery_order_item (
  id bigserial primary key,
  delivery_order_id bigint not null references public.delivery_order(id),
  sale_order_item_id bigint not null references public.sale_order_item(id),
  product_id bigint not null references public.product(id),
  qty int not null check (qty > 0),
  stock_move_id bigint references public.stock_move(id)
);

create table if not exists public.expense_record (
  id bigserial primary key,
  expense_no varchar(50) not null unique,
  expense_type varchar(64) not null,
  amount numeric(12,2) not null,
  expense_date date not null,
  payee varchar(100) not null,
  remark text,
  created_by bigint,
  created_at timestamp default current_timestamp,
  constraint ck_expense_type check (expense_type in ('RENT', 'ELECTRICITY', 'WATER', 'MATERIAL', 'MAINTENANCE', 'SALARY', 'OTHER')),
  constraint ck_expense_amount_positive check (amount > 0),
  constraint ck_expense_payee_required check (btrim(payee) <> '')
);

create table if not exists public.sys_operation_log (
  id bigserial primary key,
  user_id bigint,
  username varchar(50),
  module varchar(50),
  action varchar(50),
  target_type varchar(50),
  target_id bigint,
  old_value text,
  new_value text,
  ip varchar(50),
  created_at timestamp default current_timestamp
);

create table if not exists public.sys_config (
  id bigserial primary key,
  config_key varchar(100) not null unique,
  config_value text,
  config_desc varchar(500),
  updated_at timestamp default current_timestamp
);

create table if not exists public.notification (
  id bigserial primary key,
  user_id bigint not null,
  title varchar(200) not null,
  content text not null,
  type varchar(64) not null default 'INFO',
  is_read smallint default 0,
  created_at timestamp default current_timestamp
);

create table if not exists public.seq_number (
  id bigserial primary key,
  seq_type varchar(20) not null,
  seq_date date not null,
  current_seq int not null default 0,
  constraint uk_type_date unique (seq_type, seq_date)
);

create index if not exists idx_prod_report_order_process_time on public.prod_report (prod_order_id, process_name, start_time);
create index if not exists idx_salary_daily_work_date_user on public.salary_daily (work_date, user_id);
create index if not exists idx_salary_adjust_date_user on public.salary_adjust (adjust_date, user_id);
create index if not exists idx_piece_price_product_process_date on public.piece_price (product_id, process_name, effective_date desc);
create index if not exists idx_payment_record_sale_order on public.payment_record (sale_order_id, pay_date desc);
create index if not exists idx_payment_record_customer_date on public.payment_record (customer_id, pay_date desc);
create index if not exists idx_delivery_order_sale_order on public.delivery_order (sale_order_id, delivery_date desc);
create index if not exists idx_delivery_order_customer_date on public.delivery_order (customer_id, delivery_date desc);
create index if not exists idx_delivery_item_order on public.delivery_order_item (delivery_order_id);
create index if not exists idx_delivery_item_stock_move on public.delivery_order_item (stock_move_id);
create index if not exists idx_stock_move_reason_time on public.stock_move (move_type, move_reason, operate_time desc);
create index if not exists idx_stock_move_batch on public.stock_move (batch_id);
create index if not exists idx_stock_move_prod_picking on public.stock_move (related_order_id, product_id)
  where related_order_type = 'PROD_ORDER' and move_reason = 'OUT_PICKING';
create index if not exists idx_stock_move_prod_inbound on public.stock_move (related_order_id, product_id)
  where related_order_type = 'PROD_ORDER' and move_reason = 'IN_PRODUCE';
create index if not exists idx_stock_move_sale_item on public.stock_move (sale_order_item_id)
  where related_order_type = 'SALE_ORDER' and move_reason = 'OUT_SALE';
create index if not exists idx_stock_move_delivery_order on public.stock_move (delivery_order_id)
  where related_order_type = 'SALE_ORDER' and move_reason = 'OUT_SALE';
create index if not exists idx_stock_move_transfer_order on public.stock_move (related_order_id, product_id)
  where related_order_type = 'STOCK_TRANSFER' and move_reason = 'TRANSFER';
create index if not exists idx_stock_transfer_status_time on public.stock_transfer (status, created_at desc);
create index if not exists idx_stock_transfer_item_transfer on public.stock_transfer_item (transfer_id);
create index if not exists idx_stock_transfer_item_product_batch on public.stock_transfer_item (product_id, from_batch_id);
create index if not exists idx_expense_record_date on public.expense_record (expense_date desc);
create index if not exists idx_expense_record_type_date on public.expense_record (expense_type, expense_date desc);
create index if not exists idx_expense_record_search_trgm on public.expense_record using gin (
  (coalesce(expense_no, '') || ' ' || coalesce(payee, '') || ' ' || coalesce(remark, '')) gin_trgm_ops
);

insert into public.sys_user (
  username, real_name, phone, password_hash, role, status, login_fail_count, created_at, updated_at
)
values (
  'songjian', '宋建', '13800000000',
  '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi',
  'BOSS', 1, 0, current_timestamp, current_timestamp
)
on conflict (username) do nothing;

insert into public.warehouse (code, name, type, address)
values
  ('W-RAW', '原料仓', 'RAW', 'A区'),
  ('W-SEMI', '半成品仓', 'SEMI', 'C区'),
  ('W-FINISH', '成品仓', 'FINISH', 'D区'),
  ('W-DEFECT', '不良品仓', 'DEFECT', 'E区')
on conflict (code) do nothing;

insert into public.machine (code, name, model, tonnage, status, location)
values
  ('IM-001', '1号注塑机', '海天MA1200', 120, 'IDLE', 'A车间'),
  ('IM-002', '2号注塑机', '海天MA1600', 160, 'IDLE', 'A车间'),
  ('IM-003', '3号注塑机', '海天MA2000', 200, 'IDLE', 'B车间')
on conflict (code) do nothing;

insert into public.sys_config (config_key, config_value, config_desc)
values
  ('system_title', '注塑厂管理系统', '系统标题'),
  ('factory_name', 'XX注塑厂', '工厂名称，显示在系统标题'),
  ('shift_day_start', '08:00', '白班开始时间'),
  ('shift_night_start', '20:00', '夜班开始时间'),
  ('overtime_threshold_min', '480', '日工时超过此值计加班（分钟）'),
  ('bad_rate_warning', '5', '不良率预警阈值（%）'),
  ('delivery_warning_days', '3', '交期预警天数'),
  ('stock_expiry_warning_days', '30', '批次临期预警天数'),
  ('stock_warning_enabled', 'true', '是否启用库存预警'),
  ('auto_daily_settle', 'true', '是否自动日结工资'),
  ('backup_time', '02:00', '自动备份时间'),
  ('backup_keep_days', '30', '备份保留天数'),
  ('piece_price_tolerance', '5', '报工超计划数量容差（%）'),
  ('fifo_enabled', 'true', '是否启用原料先进先出'),
  ('inventory_freeze_on_count', 'true', '盘点时是否冻结库存'),
  ('location_capacity_check', 'false', '是否启用库位容量校验'),
  ('default_raw_warehouse', '1', '默认原料仓ID'),
  ('default_finish_warehouse', '3', '默认成品仓ID'),
  ('mold_maintenance_warning_ratio', '0.8', '模具保养预警比例'),
  ('mold_lifetime_warning_ratio', '0.9', '模具寿命预警比例'),
  ('external_push_enabled', 'false', '是否启用外部消息推送'),
  ('wecom_webhook_url', '', '企业微信 Webhook'),
  ('dingtalk_webhook_url', '', '钉钉 Webhook')
on conflict (config_key) do nothing;

-- Complete the two deliberate circular stock/delivery references after both sides exist.
do $stock_delivery_constraints$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.stock_move'::pg_catalog.regclass
       and conname = 'fk_stock_move_delivery_order'
  ) then
    alter table public.stock_move
      add constraint fk_stock_move_delivery_order
      foreign key (delivery_order_id) references public.delivery_order(id);
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.stock_move'::pg_catalog.regclass
       and conname = 'fk_stock_move_delivery_order_item'
  ) then
    alter table public.stock_move
      add constraint fk_stock_move_delivery_order_item
      foreign key (delivery_order_item_id) references public.delivery_order_item(id);
  end if;
end;
$stock_delivery_constraints$;

-- -----------------------------------------------------------------------------
-- 2. Injection professional schema
-- -----------------------------------------------------------------------------

create table if not exists public.process_card (
  id bigserial primary key,
  card_no varchar(50) not null unique,
  product_id bigint not null references public.product(id),
  mold_id bigint references public.mold(id),
  machine_id bigint references public.machine(id),
  material_id bigint references public.product(id),
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
  prod_order_id bigint not null references public.prod_order(id),
  process_card_id bigint not null references public.process_card(id),
  project_id bigint,
  mold_id bigint references public.mold(id),
  machine_id bigint references public.machine(id),
  trial_stage varchar(32),
  shot_count int default 0,
  cycle_seconds numeric(12,2),
  first_article_result varchar(100),
  defect_summary text,
  correction_action text,
  production_ready boolean default false,
  image_urls jsonb default '[]'::jsonb,
  remark text,
  status varchar(64) default 'WAIT_TRIAL',
  created_by bigint,
  confirmed_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

alter table public.trial_mold_record
  add column if not exists project_id bigint,
  add column if not exists trial_stage varchar(32),
  add column if not exists shot_count int default 0,
  add column if not exists cycle_seconds numeric(12,2),
  add column if not exists defect_summary text,
  add column if not exists correction_action text,
  add column if not exists production_ready boolean default false;

create table if not exists public.material_mix_order (
  id bigserial primary key,
  mix_no varchar(50) not null unique,
  prod_order_id bigint not null references public.prod_order(id),
  product_id bigint references public.product(id),
  material_batch_id bigint not null references public.material_batch(id),
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
  batch_id bigint references public.material_batch(id),
  prod_order_id bigint references public.prod_order(id),
  sale_order_id bigint references public.sale_order(id),
  remark text,
  status varchar(64) default 'DRAFT',
  created_at timestamp default current_timestamp
);

create table if not exists public.startup_check (
  id bigserial primary key,
  check_no varchar(50) not null unique,
  prod_order_id bigint not null references public.prod_order(id),
  process_card_id bigint references public.process_card(id),
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
  machine_id bigint not null references public.machine(id),
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
  mold_id bigint not null references public.mold(id),
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
  customer_id bigint not null references public.customer(id),
  product_id bigint references public.product(id),
  batch_id bigint references public.material_batch(id),
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
  machine_id bigint not null references public.machine(id),
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
  material_id bigint not null references public.product(id),
  shortage_qty numeric(12,3) default 0,
  requested_qty numeric(12,3) not null,
  supplier_id bigint references public.supplier(id),
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

-- -----------------------------------------------------------------------------
-- 3. Unified workflow schema
-- -----------------------------------------------------------------------------

create table if not exists public.workflow_definition (
  id bigserial primary key,
  code varchar(80) not null unique,
  name varchar(120) not null,
  business_type varchar(80) not null unique,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.workflow_instance (
  id bigserial primary key,
  definition_code varchar(80) not null references public.workflow_definition(code),
  business_type varchar(80) not null,
  business_id bigint not null,
  business_code varchar(120),
  title varchar(240) not null,
  status varchar(64) not null default 'DRAFT',
  current_node varchar(80),
  route varchar(200),
  owner_id bigint,
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  finished_at timestamp,
  constraint uq_workflow_instance_business unique (business_type, business_id)
);

create table if not exists public.workflow_task (
  id bigserial primary key,
  instance_id bigint not null references public.workflow_instance(id) on delete cascade,
  task_no varchar(120) not null unique,
  business_type varchar(80) not null,
  business_id bigint not null,
  business_code varchar(120),
  title varchar(240) not null,
  description text,
  status varchar(64) not null default 'OPEN',
  node varchar(80),
  priority int not null default 60,
  assignee_id bigint,
  assignee_name varchar(120),
  source_route varchar(200),
  due_at timestamp,
  created_by bigint,
  created_at timestamp default current_timestamp,
  claimed_at timestamp,
  started_at timestamp,
  finished_at timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.workflow_log (
  id bigserial primary key,
  instance_id bigint references public.workflow_instance(id) on delete cascade,
  task_id bigint references public.workflow_task(id) on delete set null,
  business_type varchar(80) not null,
  business_id bigint not null,
  action varchar(64) not null,
  from_status varchar(64),
  to_status varchar(64),
  actor_id bigint,
  note text,
  created_at timestamp default current_timestamp
);

insert into public.workflow_definition (code, name, business_type, config)
values
  ('customer-master-review', '客户资料审核', 'customer', '{"route":"/base/customers"}'::jsonb),
  ('sale-order-approval', '销售订单审核', 'sale_order', '{"route":"/sale/orders"}'::jsonb),
  ('purchase-requisition-approval', '采购请购审批', 'purchase_requisition', '{"route":"/injection/purchase-requisition"}'::jsonb),
  ('production-order-flow', '生产工单闭环', 'prod_order', '{"route":"/prod/orders"}'::jsonb),
  ('maintenance-order-repair-flow', '设备维修闭环', 'maintenance_order', '{"route":"/injection/maintenance-order"}'::jsonb),
  ('spare-part-replenishment', '备件补货闭环', 'spare_part', '{"route":"/equipment/spare-parts"}'::jsonb),
  ('salary-month-review', '工资月结复核', 'salary_month', '{"route":"/salary/monthly"}'::jsonb),
  ('qc-defect-disposal-flow', '不良品处置闭环', 'qc_record', '{"route":"/qc/defect-disposal"}'::jsonb),
  ('stock-inventory-approval', '库存盘点审批', 'stock_inventory', '{"route":"/stock/inventory"}'::jsonb),
  ('expense-approval-flow', '费用支出审批', 'expense_record', '{"route":"/finance/expenses"}'::jsonb),
  ('payment-confirmation-flow', '销售回款确认', 'payment_record', '{"route":"/sale/payments"}'::jsonb),
  ('purchase-inbound-review', '采购入库复核', 'purchase_inbound', '{"route":"/stock/in-purchase"}'::jsonb)
on conflict (business_type) do nothing;

create index if not exists idx_workflow_instance_status on public.workflow_instance (status, updated_at desc);
create index if not exists idx_workflow_instance_business on public.workflow_instance (business_type, business_id);
create index if not exists idx_workflow_task_status_priority on public.workflow_task (status, priority, created_at desc);
create index if not exists idx_workflow_task_assignee on public.workflow_task (assignee_id, status);
create index if not exists idx_workflow_task_business on public.workflow_task (business_type, business_id);
create index if not exists idx_workflow_task_instance on public.workflow_task (instance_id, status);
create index if not exists idx_workflow_log_business on public.workflow_log (business_type, business_id, created_at desc);
create index if not exists idx_workflow_log_instance on public.workflow_log (instance_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 4. Base RPCs and accounting trigger
-- -----------------------------------------------------------------------------

create or replace function public.erp_recalculate_sale_order_received(target_sale_order_id bigint)
returns numeric
language plpgsql
security definer
set search_path = public, pg_catalog
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
    raise exception '未找到销售订单' using errcode = 'P0002';
  end if;

  select coalesce(so.received_opening_amount, 0) + coalesce(sum(pr.pay_amount), 0)
    into next_received
    from public.sale_order so
    left join public.payment_record pr on pr.sale_order_id = so.id
   where so.id = target_sale_order_id
   group by so.id, so.received_opening_amount;

  if next_received < 0 then
    raise exception '销售订单已回款金额不能小于 0' using errcode = '23514';
  end if;
  if order_total is not null and next_received > order_total then
    raise exception '回款金额不能超过订单金额' using errcode = '23514';
  end if;

  update public.sale_order
     set received_amount = next_received,
         updated_at = current_timestamp
   where id = target_sale_order_id;
  return next_received;
end;
$$;

create or replace function public.erp_payment_record_sync_sale_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  target_status text;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select status
      into target_status
      from public.sale_order
     where id = new.sale_order_id
     for update;

    if target_status is null then
      raise exception '未找到销售订单' using errcode = 'P0002';
    end if;
    if upper(coalesce(target_status, '')) not in ('APPROVED', 'CONFIRMED', 'PARTIAL', 'SHIPPED') then
      raise exception '销售订单状态不允许回款' using errcode = '23514';
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

create or replace trigger trg_payment_record_sync_sale_order
after insert or update or delete on public.payment_record
for each row execute function public.erp_payment_record_sync_sale_order();

create or replace function public.erp_login(login_name text, login_password text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
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
     and (lock_until is null or lock_until <= current_timestamp)
   limit 1;

  if matched_user.id is null
     or matched_user.password_hash is null
     or matched_user.password_hash <> crypt(login_password, matched_user.password_hash::text) then
    raise exception '用户名或密码错误' using errcode = 'P0001';
  end if;

  session_token := encode(gen_random_bytes(32), 'hex');
  update public.sys_user
     set login_fail_count = 0,
         last_login_at = current_timestamp,
         updated_at = current_timestamp
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

-- -----------------------------------------------------------------------------
-- 5. Mold development schema
-- -----------------------------------------------------------------------------

create table if not exists public.mold_development_project (
  id bigserial primary key,
  project_no varchar(80) not null unique,
  project_name varchar(160) not null,
  mold_id bigint references public.mold(id) on delete restrict,
  product_id bigint references public.product(id) on delete restrict,
  customer_id bigint references public.customer(id) on delete restrict,
  supplier_id bigint references public.supplier(id) on delete restrict,
  mold_type varchar(80),
  cavity_count int default 1,
  target_machine_tonnage numeric(12,2),
  target_cycle_seconds numeric(12,2),
  annual_demand numeric(14,2) default 0,
  budget_amount numeric(14,2) default 0,
  actual_amount numeric(14,2) default 0,
  planned_start_date date,
  planned_due_date date,
  actual_due_date date,
  current_stage varchar(64) default 'REQUIREMENT',
  owner_id bigint references public.sys_user(id) on delete restrict,
  status varchar(64) default 'DRAFT',
  risk_level varchar(32) default 'NORMAL',
  requirement text,
  remark text,
  created_by bigint references public.sys_user(id) on delete restrict,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  constraint ck_mold_dev_project_values check (
    coalesce(cavity_count, 1) > 0
    and coalesce(target_machine_tonnage, 0) >= 0
    and coalesce(target_cycle_seconds, 0) >= 0
    and coalesce(annual_demand, 0) >= 0
    and coalesce(budget_amount, 0) >= 0
    and coalesce(actual_amount, 0) >= 0
    and (planned_start_date is null or planned_due_date is null or planned_due_date >= planned_start_date)
  )
);

create table if not exists public.mold_project_milestone (
  id bigserial primary key,
  project_id bigint not null references public.mold_development_project(id) on delete restrict,
  stage_code varchar(64) not null,
  stage_name varchar(100) not null,
  sequence_no int not null default 1,
  planned_date date,
  actual_date date,
  owner_id bigint references public.sys_user(id) on delete restrict,
  status varchar(64) default 'PENDING',
  deliverable text,
  risk_note text,
  approved_by bigint references public.sys_user(id) on delete restrict,
  remark text,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  constraint uq_mold_project_milestone unique (project_id, stage_code)
);

create table if not exists public.mold_trial_detail (
  id bigserial primary key,
  project_id bigint not null references public.mold_development_project(id) on delete restrict,
  trial_mold_record_id bigint references public.trial_mold_record(id) on delete set null,
  trial_no varchar(80) not null unique,
  trial_stage varchar(32) default 'T0',
  shot_count int default 0,
  cycle_seconds numeric(12,2),
  mold_temp numeric(12,2),
  material_temp numeric(12,2),
  dimension_result varchar(64) default 'PENDING',
  quality_result varchar(64) default 'PENDING',
  production_result varchar(64) default 'PENDING',
  first_pass boolean default false,
  defect_summary text,
  correction_action text,
  issue_severity varchar(32) default 'NOT_REQUIRED',
  issue_owner_id bigint references public.sys_user(id) on delete restrict,
  correction_due_date date,
  correction_status varchar(32) default 'NOT_REQUIRED',
  retest_result varchar(32) default 'NOT_REQUIRED',
  closure_evidence text,
  closed_by bigint references public.sys_user(id) on delete restrict,
  closed_at timestamp,
  next_trial_date date,
  photo_urls jsonb default '[]'::jsonb,
  status varchar(64) default 'DRAFT',
  owner_id bigint references public.sys_user(id) on delete restrict,
  confirmed_by bigint references public.sys_user(id) on delete restrict,
  remark text,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  constraint ck_mold_trial_values check (
    coalesce(shot_count, 0) >= 0
    and coalesce(cycle_seconds, 0) >= 0
    and upper(coalesce(dimension_result, 'PENDING')) in ('PENDING', 'PASS', 'FAIL')
    and upper(coalesce(quality_result, 'PENDING')) in ('PENDING', 'PASS', 'FAIL')
    and upper(coalesce(production_result, 'PENDING')) in ('PENDING', 'PASS', 'FAIL')
  ),
  constraint ck_mold_trial_issue_values check (
    upper(coalesce(issue_severity, 'NOT_REQUIRED')) in ('NOT_REQUIRED', 'LOW', 'MEDIUM', 'HIGH', 'BLOCKER')
    and upper(coalesce(correction_status, 'NOT_REQUIRED')) in ('NOT_REQUIRED', 'OPEN', 'IN_PROGRESS', 'WAIT_RETEST', 'CLOSED')
    and upper(coalesce(retest_result, 'NOT_REQUIRED')) in ('NOT_REQUIRED', 'PENDING', 'PASS', 'FAIL')
    and (
      upper(coalesce(correction_status, 'NOT_REQUIRED')) <> 'CLOSED'
      or (
        upper(coalesce(retest_result, 'NOT_REQUIRED')) = 'PASS'
        and nullif(btrim(coalesce(correction_action, '')), '') is not null
        and nullif(btrim(coalesce(closure_evidence, '')), '') is not null
        and closed_by is not null
        and closed_at is not null
      )
    )
  ),
  constraint ck_mold_trial_issue_consistency check (
    (
      nullif(btrim(coalesce(defect_summary, '')), '') is null
      and upper(coalesce(issue_severity, 'NOT_REQUIRED')) = 'NOT_REQUIRED'
      and upper(coalesce(correction_status, 'NOT_REQUIRED')) = 'NOT_REQUIRED'
      and upper(coalesce(retest_result, 'NOT_REQUIRED')) = 'NOT_REQUIRED'
      and issue_owner_id is null
      and correction_due_date is null
      and nullif(btrim(coalesce(closure_evidence, '')), '') is null
      and closed_by is null
      and closed_at is null
    )
    or (
      nullif(btrim(coalesce(defect_summary, '')), '') is not null
      and upper(coalesce(issue_severity, 'NOT_REQUIRED')) in ('LOW', 'MEDIUM', 'HIGH', 'BLOCKER')
      and upper(coalesce(correction_status, 'NOT_REQUIRED')) in ('OPEN', 'IN_PROGRESS', 'WAIT_RETEST', 'CLOSED')
      and upper(coalesce(retest_result, 'NOT_REQUIRED')) in ('PENDING', 'PASS', 'FAIL')
    )
  )
);

create table if not exists public.mold_revision (
  id bigserial primary key,
  project_id bigint references public.mold_development_project(id) on delete restrict,
  mold_id bigint not null references public.mold(id) on delete restrict,
  revision_no varchar(40) not null,
  drawing_no varchar(100),
  change_type varchar(64) default 'DESIGN',
  change_reason text not null,
  change_summary text,
  file_name varchar(240),
  file_url varchar(800),
  checksum varchar(128),
  status varchar(64) default 'DRAFT',
  effective_at timestamp,
  created_by bigint references public.sys_user(id) on delete restrict,
  approved_by bigint references public.sys_user(id) on delete restrict,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  constraint uq_mold_revision unique (mold_id, revision_no)
);

create table if not exists public.mold_attachment (
  id bigserial primary key,
  project_id bigint references public.mold_development_project(id) on delete restrict,
  mold_id bigint references public.mold(id) on delete restrict,
  attachment_type varchar(64) default 'OTHER',
  file_name varchar(240) not null,
  file_url varchar(800) not null,
  version_no varchar(40),
  checksum varchar(128),
  status varchar(64) default 'ACTIVE',
  uploaded_by bigint references public.sys_user(id) on delete restrict,
  created_at timestamp default current_timestamp
);

create table if not exists public.mold_product (
  id bigserial primary key,
  mold_id bigint not null references public.mold(id) on delete restrict,
  product_id bigint not null references public.product(id) on delete restrict,
  cavity_start int,
  cavity_end int,
  cavity_count int default 1,
  priority int default 1,
  status varchar(64) default 'ACTIVE',
  effective_from date,
  effective_to date,
  remark text,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  constraint uq_mold_product unique (mold_id, product_id),
  constraint ck_mold_product_cavity check (
    coalesce(cavity_count, 1) > 0
    and (cavity_start is null or cavity_start > 0)
    and (cavity_end is null or cavity_end > 0)
    and (cavity_start is null or cavity_end is null or cavity_end >= cavity_start)
  )
);

create table if not exists public.mold_component (
  id bigserial primary key,
  project_id bigint references public.mold_development_project(id) on delete restrict,
  mold_id bigint not null references public.mold(id) on delete restrict,
  component_code varchar(100) not null,
  component_name varchar(160) not null,
  component_type varchar(80),
  material varchar(120),
  supplier_id bigint references public.supplier(id) on delete restrict,
  quantity numeric(12,2) default 1,
  lifetime_shots int,
  used_shots int default 0,
  replacement_cost numeric(14,2) default 0,
  status varchar(64) default 'ACTIVE',
  location varchar(160),
  last_replaced_at date,
  remark text,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  constraint uq_mold_component unique (mold_id, component_code),
  constraint ck_mold_component_values check (
    coalesce(quantity, 0) >= 0
    and coalesce(lifetime_shots, 0) >= 0
    and coalesce(used_shots, 0) >= 0
    and coalesce(replacement_cost, 0) >= 0
  )
);

create table if not exists public.mold_cost_record (
  id bigserial primary key,
  project_id bigint references public.mold_development_project(id) on delete restrict,
  mold_id bigint references public.mold(id) on delete restrict,
  supplier_id bigint references public.supplier(id) on delete restrict,
  cost_type varchar(64) not null,
  source_no varchar(100),
  quoted_amount numeric(14,2) default 0,
  actual_amount numeric(14,2) default 0,
  occurred_at date,
  status varchar(64) default 'DRAFT',
  remark text,
  created_by bigint references public.sys_user(id) on delete restrict,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  constraint ck_mold_cost_values check (coalesce(quoted_amount, 0) >= 0 and coalesce(actual_amount, 0) >= 0)
);

create table if not exists public.mold_supplier_evaluation (
  id bigserial primary key,
  project_id bigint references public.mold_development_project(id) on delete restrict,
  mold_id bigint references public.mold(id) on delete restrict,
  supplier_id bigint not null references public.supplier(id) on delete restrict,
  delivery_score numeric(5,2) default 0,
  quality_score numeric(5,2) default 0,
  response_score numeric(5,2) default 0,
  total_score numeric(5,2) default 0,
  evaluation_status varchar(64) default 'DRAFT',
  remark text,
  evaluated_by bigint references public.sys_user(id) on delete restrict,
  evaluated_at date,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  constraint ck_mold_evaluation_scores check (
    delivery_score between 0 and 100
    and quality_score between 0 and 100
    and response_score between 0 and 100
    and total_score between 0 and 100
  )
);

do $trial_project_constraint$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.trial_mold_record'::pg_catalog.regclass
       and conname = 'fk_trial_mold_record_project'
  ) then
    alter table public.trial_mold_record
      add constraint fk_trial_mold_record_project
      foreign key (project_id) references public.mold_development_project(id) on delete restrict;
  end if;
end;
$trial_project_constraint$;

create index if not exists idx_mold_development_project_status on public.mold_development_project (status, current_stage, planned_due_date);
create index if not exists idx_mold_project_milestone_project_status on public.mold_project_milestone (project_id, status, sequence_no);
create index if not exists idx_mold_trial_detail_project_status on public.mold_trial_detail (project_id, status, trial_stage);
create index if not exists idx_mold_trial_detail_issue_gate on public.mold_trial_detail (project_id, issue_severity, correction_status, trial_stage);
create index if not exists idx_mold_trial_detail_issue_owner_due on public.mold_trial_detail (issue_owner_id, correction_status, correction_due_date)
  where upper(coalesce(correction_status, 'NOT_REQUIRED')) not in ('NOT_REQUIRED', 'CLOSED');
create index if not exists idx_mold_revision_mold_status on public.mold_revision (mold_id, status, effective_at desc);
create unique index if not exists uq_mold_revision_single_effective on public.mold_revision (mold_id) where status = 'EFFECTIVE';
create index if not exists idx_mold_attachment_project_mold on public.mold_attachment (project_id, mold_id, created_at desc);
create index if not exists idx_mold_product_product_status on public.mold_product (product_id, status);
create index if not exists idx_mold_component_mold_status on public.mold_component (mold_id, status);
create index if not exists idx_mold_cost_project_date on public.mold_cost_record (project_id, occurred_at desc);
create index if not exists idx_mold_supplier_evaluation_supplier on public.mold_supplier_evaluation (supplier_id, evaluation_status);
create index if not exists idx_trial_mold_record_project_status on public.trial_mold_record (project_id, status);
create index if not exists idx_prod_report_mold_created_at on public.prod_report (mold_id, created_at desc);
create unique index if not exists uq_andon_mold_trial_source on public.andon_event (source_type, source_id)
  where source_type = 'MOLD_TRIAL';

-- -----------------------------------------------------------------------------
-- 6. Mold development integrity triggers and identity helpers
-- -----------------------------------------------------------------------------

create or replace function public.guard_sys_user_auth_binding()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth
as $$
begin
  if (
    (tg_op = 'INSERT' and new.auth_user_id is not null)
    or (tg_op = 'UPDATE' and new.auth_user_id is distinct from old.auth_user_id)
  )
  and current_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'auth_user_id 只能由数据库管理员绑定';
  end if;
  return new;
end;
$$;

create or replace trigger trg_guard_sys_user_auth_binding
before insert or update of auth_user_id on public.sys_user
for each row execute function public.guard_sys_user_auth_binding();

create or replace function public.bind_mold_auth_user(p_sys_user_id bigint, p_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  bound_username text;
begin
  if not exists (select 1 from auth.users where id = p_auth_user_id) then
    raise exception using errcode = 'P0002', message = '未找到指定的 Supabase Auth 用户';
  end if;

  update public.sys_user
     set auth_user_id = p_auth_user_id,
         updated_at = current_timestamp
   where id = p_sys_user_id
   returning username into bound_username;

  if bound_username is null then
    raise exception using errcode = 'P0002', message = '未找到指定的系统用户';
  end if;

  return jsonb_build_object(
    'sysUserId', p_sys_user_id,
    'authUserId', p_auth_user_id,
    'username', bound_username
  );
end;
$$;

create or replace function public.set_mold_development_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := current_timestamp;
  return new;
end;
$$;

create or replace trigger trg_mold_development_project_updated_at
before update on public.mold_development_project
for each row execute function public.set_mold_development_updated_at();
create or replace trigger trg_mold_project_milestone_updated_at
before update on public.mold_project_milestone
for each row execute function public.set_mold_development_updated_at();
create or replace trigger trg_mold_trial_detail_updated_at
before update on public.mold_trial_detail
for each row execute function public.set_mold_development_updated_at();
create or replace trigger trg_mold_revision_updated_at
before update on public.mold_revision
for each row execute function public.set_mold_development_updated_at();
create or replace trigger trg_mold_product_updated_at
before update on public.mold_product
for each row execute function public.set_mold_development_updated_at();
create or replace trigger trg_mold_component_updated_at
before update on public.mold_component
for each row execute function public.set_mold_development_updated_at();
create or replace trigger trg_mold_cost_record_updated_at
before update on public.mold_cost_record
for each row execute function public.set_mold_development_updated_at();
create or replace trigger trg_mold_supplier_evaluation_updated_at
before update on public.mold_supplier_evaluation
for each row execute function public.set_mold_development_updated_at();

create or replace function public.normalize_mold_product_cavity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.cavity_start is not null and new.cavity_end is not null then
    new.cavity_count := new.cavity_end - new.cavity_start + 1;
  end if;
  return new;
end;
$$;

create or replace trigger trg_normalize_mold_product_cavity
before insert or update on public.mold_product
for each row execute function public.normalize_mold_product_cavity();

create or replace function public.normalize_mold_supplier_score()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.total_score := round(
    (coalesce(new.delivery_score, 0) + coalesce(new.quality_score, 0) + coalesce(new.response_score, 0)) / 3,
    2
  );
  return new;
end;
$$;

create or replace trigger trg_normalize_mold_supplier_score
before insert or update on public.mold_supplier_evaluation
for each row execute function public.normalize_mold_supplier_score();

create or replace function public.sync_mold_project_actual_cost()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  target_project_id bigint;
begin
  target_project_id := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
  perform set_config('app.mold_cost_sync', 'allowed', true);

  if target_project_id is not null then
    update public.mold_development_project
       set actual_amount = coalesce((
         select sum(coalesce(cost.actual_amount, 0))
           from public.mold_cost_record cost
          where cost.project_id = target_project_id
       ), 0)
     where id = target_project_id;
  end if;

  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id and old.project_id is not null then
    update public.mold_development_project
       set actual_amount = coalesce((
         select sum(coalesce(cost.actual_amount, 0))
           from public.mold_cost_record cost
          where cost.project_id = old.project_id
       ), 0)
     where id = old.project_id;
  end if;
  return null;
end;
$$;

create or replace trigger trg_sync_mold_project_actual_cost
after insert or update or delete on public.mold_cost_record
for each row execute function public.sync_mold_project_actual_cost();

create or replace function public.guard_mold_project_actual_cost()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.actual_amount, 0) <> 0 then
      raise exception using errcode = '23514', message = '项目实际成本必须由成本明细汇总生成';
    end if;
    return new;
  end if;

  if new.actual_amount is distinct from old.actual_amount
     and coalesce(current_setting('app.mold_cost_sync', true), '') <> 'allowed' then
    raise exception using errcode = '23514', message = '项目实际成本不能直接修改';
  end if;
  return new;
end;
$$;

create or replace trigger trg_guard_mold_project_actual_cost
before insert or update of actual_amount on public.mold_development_project
for each row execute function public.guard_mold_project_actual_cost();

create or replace function public.seed_mold_project_milestones()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  insert into public.mold_project_milestone (project_id, stage_code, stage_name, sequence_no, status)
  values
    (new.id, 'REQUIREMENT', '需求评审', 1, 'IN_PROGRESS'),
    (new.id, 'DFM', 'DFM评审', 2, 'PENDING'),
    (new.id, 'DESIGN', '设计确认', 3, 'PENDING'),
    (new.id, 'MACHINING', '加工装配', 4, 'PENDING'),
    (new.id, 'T0', 'T0试模', 5, 'PENDING'),
    (new.id, 'T1', 'T1修模', 6, 'PENDING'),
    (new.id, 'T2', 'T2验证', 7, 'PENDING'),
    (new.id, 'ACCEPTANCE', '验收确认', 8, 'PENDING'),
    (new.id, 'HANDOVER', '量产移交', 9, 'PENDING'),
    (new.id, 'CLOSED', '项目关闭', 10, 'PENDING')
  on conflict (project_id, stage_code) do nothing;
  return new;
end;
$$;

create or replace trigger trg_seed_mold_project_milestones
after insert on public.mold_development_project
for each row execute function public.seed_mold_project_milestones();

create or replace function public.guard_mold_project_state()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    if upper(coalesce(new.current_stage, 'REQUIREMENT')) <> 'REQUIREMENT'
       or upper(coalesce(new.status, 'DRAFT')) <> 'DRAFT' then
      raise exception using errcode = '23514', message = '新建模具开发项目必须从需求评审草稿开始';
    end if;
    return new;
  end if;

  if (new.current_stage is distinct from old.current_stage or new.status is distinct from old.status)
     and coalesce(current_setting('app.mold_project_state_transition', true), '') <> 'allowed' then
    raise exception using errcode = '23514', message = '项目阶段和状态必须通过流程动作变更';
  end if;
  return new;
end;
$$;

create or replace trigger trg_guard_mold_project_state
before insert or update of current_stage, status on public.mold_development_project
for each row execute function public.guard_mold_project_state();

create or replace function public.current_mold_actor_id()
returns bigint
language plpgsql
security definer
stable
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  actor_id bigint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '模具开发流程要求已认证用户';
  end if;

  select app_user.id
    into actor_id
    from public.sys_user app_user
   where app_user.auth_user_id = auth.uid()
     and upper(coalesce(app_user.status::text, '')) in ('1', 'TRUE', 'ACTIVE', 'ENABLED')
   limit 1;

  if actor_id is null then
    raise exception using errcode = '42501', message = '当前认证账号未关联启用的系统用户';
  end if;
  return actor_id;
end;
$$;

create or replace function public.can_access_mold_development()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
        from public.sys_user app_user
       where app_user.auth_user_id = auth.uid()
         and upper(coalesce(app_user.status::text, '')) in ('1', 'TRUE', 'ACTIVE', 'ENABLED')
    );
$$;

create or replace function public.current_erp_user_profile()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select jsonb_build_object(
    'id', app_user.id,
    'username', app_user.username,
    'real_name', app_user.real_name,
    'phone', app_user.phone,
    'role', app_user.role,
    'status', app_user.status
  )
    from public.sys_user app_user
   where app_user.auth_user_id = (select auth.uid())
     and upper(coalesce(app_user.status::text, '')) in ('1', 'TRUE', 'ACTIVE', 'ENABLED')
   limit 1;
$$;

create or replace function public.current_erp_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select exists (
    select 1
      from public.sys_user app_user
     where app_user.auth_user_id = (select auth.uid())
       and upper(coalesce(app_user.status::text, '')) in ('1', 'TRUE', 'ACTIVE', 'ENABLED')
  );
$$;

create or replace function public.current_erp_user_is_manager()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select exists (
    select 1
      from public.sys_user app_user
     where app_user.auth_user_id = (select auth.uid())
       and upper(coalesce(app_user.role, '')) in ('ADMIN', 'BOSS')
       and upper(coalesce(app_user.status::text, '')) in ('1', 'TRUE', 'ACTIVE', 'ENABLED')
  );
$$;

-- -----------------------------------------------------------------------------
-- 7. Mold development workflow RPCs
-- -----------------------------------------------------------------------------

create or replace function public.validate_mold_project_stage_gate(p_project_id bigint)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  project_row public.mold_development_project%rowtype;
  current_stage text;
  next_stage text;
  blockers jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
begin
  select *
    into project_row
    from public.mold_development_project
   where id = p_project_id;

  if project_row.id is null then
    return jsonb_build_object(
      'passed', false,
      'blockers', jsonb_build_array('未找到模具开发项目'),
      'warnings', warnings,
      'nextStage', null
    );
  end if;

  current_stage := upper(coalesce(project_row.current_stage, 'REQUIREMENT'));
  next_stage := case current_stage
    when 'REQUIREMENT' then 'DFM'
    when 'DFM' then 'DESIGN'
    when 'DESIGN' then 'MACHINING'
    when 'MACHINING' then 'T0'
    when 'T0' then 'T1'
    when 'T1' then 'T2'
    when 'T2' then 'ACCEPTANCE'
    when 'ACCEPTANCE' then 'HANDOVER'
    when 'HANDOVER' then 'CLOSED'
    when 'CLOSED' then 'CLOSED'
    else 'REQUIREMENT'
  end;

  if current_stage not in ('REQUIREMENT', 'DFM', 'DESIGN', 'MACHINING', 'T0', 'T1', 'T2', 'ACCEPTANCE', 'HANDOVER', 'CLOSED') then
    blockers := blockers || jsonb_build_array('项目当前阶段无效，不能推进');
  elsif current_stage = 'CLOSED' then
    blockers := blockers || jsonb_build_array('已关闭项目不能继续推进');
  elsif current_stage = 'REQUIREMENT' then
    if project_row.owner_id is null then
      blockers := blockers || jsonb_build_array('需求评审必须指定负责人');
    end if;
    if project_row.planned_due_date is null then
      blockers := blockers || jsonb_build_array('需求评审必须填写计划交期');
    end if;
    if nullif(btrim(coalesce(project_row.requirement, '')), '') is null then
      blockers := blockers || jsonb_build_array('需求评审必须填写需求说明');
    end if;
  elsif current_stage in ('DFM', 'MACHINING') then
    if not exists (
      select 1
        from public.mold_project_milestone milestone
       where milestone.project_id = p_project_id
         and upper(coalesce(milestone.stage_code, '')) = current_stage
         and nullif(btrim(coalesce(milestone.deliverable, '')), '') is not null
    ) then
      blockers := blockers || jsonb_build_array(current_stage || '节点必须提交交付物');
    end if;
  elsif current_stage = 'DESIGN' then
    if not exists (
      select 1
        from public.mold_revision revision
       where revision.project_id = p_project_id
         and upper(coalesce(revision.status, '')) in ('EFFECTIVE', 'APPROVED')
    ) then
      blockers := blockers || jsonb_build_array('设计确认必须至少有一个已批准或已生效版本');
    end if;
  elsif current_stage in ('T0', 'T1') then
    if not exists (
      select 1
        from public.mold_trial_detail trial
       where trial.project_id = p_project_id
         and upper(coalesce(trial.trial_stage, '')) = current_stage
    ) then
      blockers := blockers || jsonb_build_array(current_stage || '节点必须登记对应阶段试模');
    end if;
    if exists (
      select 1
        from public.mold_trial_detail issue
       where issue.project_id = p_project_id
         and upper(coalesce(issue.issue_severity, 'NOT_REQUIRED')) in ('HIGH', 'BLOCKER')
         and upper(coalesce(issue.correction_status, 'NOT_REQUIRED')) <> 'CLOSED'
    ) then
      blockers := blockers || jsonb_build_array('存在未关闭的高严重度或阻断问题');
    end if;
  elsif current_stage = 'T2' then
    if not exists (
      select 1
        from public.mold_trial_detail trial
       where trial.project_id = p_project_id
         and upper(coalesce(trial.status, '')) = 'APPROVED_PRODUCTION'
    ) then
      blockers := blockers || jsonb_build_array('T2节点必须完成量产放行试模');
    end if;
  elsif current_stage = 'ACCEPTANCE' then
    if not exists (
      select 1
        from public.mold_attachment attachment
       where attachment.project_id = p_project_id
         and upper(coalesce(attachment.attachment_type, '')) = 'ACCEPTANCE'
         and upper(coalesce(attachment.status, 'ACTIVE')) in ('ACTIVE', '')
    ) then
      blockers := blockers || jsonb_build_array('验收节点必须提交有效验收附件');
    end if;
  elsif current_stage = 'HANDOVER' then
    if project_row.mold_id is null then
      blockers := blockers || jsonb_build_array('移交前必须关联模具');
    end if;
    if project_row.product_id is null then
      blockers := blockers || jsonb_build_array('移交前必须关联产品');
    end if;
    if not exists (
      select 1
        from public.mold_attachment attachment
       where attachment.project_id = p_project_id
         and upper(coalesce(attachment.attachment_type, '')) = 'HANDOVER'
         and upper(coalesce(attachment.status, 'ACTIVE')) in ('ACTIVE', '')
    ) then
      blockers := blockers || jsonb_build_array('移交前必须提交有效移交附件');
    end if;
  end if;

  return jsonb_build_object(
    'passed', jsonb_array_length(blockers) = 0,
    'blockers', blockers,
    'warnings', warnings,
    'nextStage', next_stage
  );
end;
$$;

create or replace function public.advance_mold_development_project(p_project_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  project_row public.mold_development_project%rowtype;
  gate_result jsonb;
  next_stage text;
  next_status text;
begin
  perform public.current_mold_actor_id();

  select *
    into project_row
    from public.mold_development_project
   where id = p_project_id
   for update;

  if project_row.id is null then
    raise exception using errcode = 'P0002', message = '未找到模具开发项目';
  end if;
  if upper(coalesce(project_row.status, '')) in ('ON_HOLD', 'CANCELLED') then
    raise exception using errcode = '23514', message = '暂停或取消的项目不能推进';
  end if;

  gate_result := public.validate_mold_project_stage_gate(p_project_id);
  if not coalesce((gate_result ->> 'passed')::boolean, false) then
    raise exception using
      errcode = '23514',
      message = '项目阶段门禁未通过：' || coalesce(gate_result -> 'blockers' ->> 0, '未知原因'),
      detail = gate_result::text;
  end if;

  next_stage := gate_result ->> 'nextStage';
  if next_stage is null or next_stage = project_row.current_stage then
    raise exception using errcode = '23514', message = '项目已处于最后节点';
  end if;

  next_status := case
    when next_stage in ('T0', 'T1', 'T2') then 'TRIALING'
    when next_stage = 'ACCEPTANCE' then 'ACCEPTANCE'
    when next_stage = 'HANDOVER' then 'MASS_PRODUCTION'
    when next_stage = 'CLOSED' then 'CLOSED'
    else 'IN_PROGRESS'
  end;

  perform set_config('app.mold_project_state_transition', 'allowed', true);
  update public.mold_development_project
     set current_stage = next_stage,
         status = next_status,
         actual_due_date = case
           when next_stage = 'CLOSED' then coalesce(actual_due_date, current_date)
           else actual_due_date
         end
   where id = p_project_id;

  update public.mold_project_milestone
     set status = 'DONE',
         actual_date = coalesce(actual_date, current_date)
   where project_id = p_project_id
     and stage_code = project_row.current_stage;

  update public.mold_project_milestone
     set status = case when next_stage = 'CLOSED' then 'DONE' else 'IN_PROGRESS' end,
         actual_date = case
           when next_stage = 'CLOSED' then coalesce(actual_date, current_date)
           else actual_date
         end
   where project_id = p_project_id
     and stage_code = next_stage;

  return jsonb_build_object(
    'projectId', p_project_id,
    'previousStage', project_row.current_stage,
    'nextStage', next_stage,
    'status', next_status
  );
end;
$$;

create or replace function public.sync_mold_trial_andon()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if upper(coalesce(new.status, '')) in ('REWORK', 'FAIL') then
    insert into public.andon_event (
      event_no, source_type, source_id, level, title, description, status, created_at, updated_at
    )
    values (
      'AE-MOLD-' || new.id,
      'MOLD_TRIAL',
      new.id,
      'WARNING',
      '模具试模未通过',
      coalesce(nullif(new.defect_summary, ''), nullif(new.correction_action, ''), '请安排修模并重新试模'),
      'OPEN',
      current_timestamp,
      current_timestamp
    )
    on conflict (source_type, source_id) where source_type = 'MOLD_TRIAL'
    do update set
      level = excluded.level,
      title = excluded.title,
      description = excluded.description,
      status = 'OPEN',
      closed_reason = null,
      updated_at = current_timestamp;
  elsif upper(coalesce(new.status, '')) = 'APPROVED_PRODUCTION' then
    update public.andon_event
       set status = 'CLOSED',
           closed_reason = coalesce(nullif(closed_reason, ''), '模具试模已通过量产放行'),
           updated_at = current_timestamp
     where source_type = 'MOLD_TRIAL'
       and source_id = new.id
       and status <> 'CLOSED';
  end if;
  return new;
end;
$$;

create or replace trigger trg_sync_mold_trial_andon
after insert or update on public.mold_trial_detail
for each row execute function public.sync_mold_trial_andon();

create or replace function public.guard_mold_revision_state()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    if upper(coalesce(old.status, 'DRAFT')) <> 'DRAFT' then
      raise exception using errcode = '23514', message = '已提交或生效的模具版本不能删除';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if upper(coalesce(new.status, 'DRAFT')) <> 'DRAFT'
       or new.approved_by is not null
       or new.effective_at is not null then
      raise exception using errcode = '23514', message = '新版本必须以草稿状态创建';
    end if;
    return new;
  end if;

  if coalesce(current_setting('app.mold_revision_transition', true), '') <> 'allowed' then
    if new.status is distinct from old.status then
      raise exception using errcode = '23514', message = '版本状态必须通过提交或批准动作变更';
    end if;
    if new.approved_by is distinct from old.approved_by
       or new.effective_at is distinct from old.effective_at then
      raise exception using errcode = '23514', message = '版本审批人和生效时间必须由审批流程写入';
    end if;
    if upper(coalesce(old.status, 'DRAFT')) <> 'DRAFT' and (
      new.project_id is distinct from old.project_id
      or new.mold_id is distinct from old.mold_id
      or new.revision_no is distinct from old.revision_no
      or new.drawing_no is distinct from old.drawing_no
      or new.change_type is distinct from old.change_type
      or new.change_reason is distinct from old.change_reason
      or new.change_summary is distinct from old.change_summary
      or new.file_name is distinct from old.file_name
      or new.file_url is distinct from old.file_url
      or new.checksum is distinct from old.checksum
    ) then
      raise exception using errcode = '23514', message = '已提交或生效的模具版本只读';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger trg_guard_mold_revision_state
before insert or update or delete on public.mold_revision
for each row execute function public.guard_mold_revision_state();

create or replace function public.transition_mold_revision(p_revision_id bigint, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  revision_row public.mold_revision%rowtype;
  normalized_action text := upper(coalesce(p_action, ''));
  actor_id bigint;
  next_status text;
begin
  actor_id := public.current_mold_actor_id();

  select *
    into revision_row
    from public.mold_revision
   where id = p_revision_id
   for update;

  if revision_row.id is null then
    raise exception using errcode = 'P0002', message = '未找到模具版本';
  end if;

  if normalized_action = 'SUBMIT' then
    if upper(coalesce(revision_row.status, 'DRAFT')) <> 'DRAFT' then
      raise exception using errcode = '23514', message = '只有草稿版本可以提交审批';
    end if;
    next_status := 'PENDING_APPROVAL';
  elsif normalized_action = 'APPROVE' then
    if upper(coalesce(revision_row.status, '')) <> 'PENDING_APPROVAL' then
      raise exception using errcode = '23514', message = '只有待审批版本可以批准生效';
    end if;
    next_status := 'EFFECTIVE';
  elsif normalized_action = 'VOID' then
    if upper(coalesce(revision_row.status, '')) = 'EFFECTIVE' then
      raise exception using errcode = '23514', message = '生效版本不能直接作废，请先批准新版本';
    end if;
    next_status := 'VOID';
  else
    raise exception using errcode = '22023', message = '不支持的模具版本动作';
  end if;

  perform set_config('app.mold_revision_transition', 'allowed', true);
  if next_status = 'EFFECTIVE' then
    update public.mold_revision
       set status = 'VOID'
     where mold_id = revision_row.mold_id
       and status = 'EFFECTIVE'
       and id <> p_revision_id;
  end if;

  update public.mold_revision
     set status = next_status,
         approved_by = case when next_status = 'EFFECTIVE' then actor_id else approved_by end,
         effective_at = case when next_status = 'EFFECTIVE' then current_timestamp else effective_at end
   where id = p_revision_id;

  return jsonb_build_object(
    'revisionId', p_revision_id,
    'previousStatus', revision_row.status,
    'status', next_status
  );
end;
$$;

create or replace function public.validate_mold_trial_release()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  has_defect boolean;
begin
  has_defect := nullif(btrim(coalesce(new.defect_summary, '')), '') is not null;

  if tg_op = 'INSERT' then
    if has_defect and (
      upper(coalesce(new.correction_status, 'NOT_REQUIRED')) <> 'OPEN'
      or upper(coalesce(new.retest_result, 'NOT_REQUIRED')) <> 'PENDING'
      or new.closed_by is not null
      or new.closed_at is not null
      or nullif(btrim(coalesce(new.closure_evidence, '')), '') is not null
    ) then
      raise exception using errcode = '23514', message = '新试模问题必须以待整改状态创建';
    end if;
    if not has_defect and (
      upper(coalesce(new.issue_severity, 'NOT_REQUIRED')) <> 'NOT_REQUIRED'
      or upper(coalesce(new.correction_status, 'NOT_REQUIRED')) <> 'NOT_REQUIRED'
      or upper(coalesce(new.retest_result, 'NOT_REQUIRED')) <> 'NOT_REQUIRED'
    ) then
      raise exception using errcode = '23514', message = '无缺陷试模的问题字段必须为不适用';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(current_setting('app.mold_trial_issue_transition', true), '') <> 'allowed'
     and (
       upper(coalesce(new.correction_status, 'NOT_REQUIRED')) is distinct from upper(coalesce(old.correction_status, 'NOT_REQUIRED'))
       or new.closure_evidence is distinct from old.closure_evidence
       or new.closed_by is distinct from old.closed_by
       or new.closed_at is distinct from old.closed_at
     )
     and not (
       nullif(btrim(coalesce(old.defect_summary, '')), '') is null
       and has_defect
       and upper(coalesce(old.correction_status, 'NOT_REQUIRED')) = 'NOT_REQUIRED'
       and upper(coalesce(new.correction_status, 'NOT_REQUIRED')) = 'OPEN'
       and upper(coalesce(new.retest_result, 'NOT_REQUIRED')) = 'PENDING'
       and new.closed_by is null
       and new.closed_at is null
       and nullif(btrim(coalesce(new.closure_evidence, '')), '') is null
     ) then
    raise exception using errcode = '23514', message = '试模问题状态和关闭信息必须通过问题流程动作变更';
  end if;

  if upper(coalesce(new.correction_status, 'NOT_REQUIRED')) = 'CLOSED' then
    if upper(coalesce(new.retest_result, 'NOT_REQUIRED')) <> 'PASS' then
      raise exception using errcode = '23514', message = '试模问题复试未通过，不能关闭';
    end if;
    if nullif(btrim(coalesce(new.correction_action, '')), '') is null then
      raise exception using errcode = '23514', message = '试模问题未填写整改措施，不能关闭';
    end if;
    if nullif(btrim(coalesce(new.closure_evidence, '')), '') is null then
      raise exception using errcode = '23514', message = '试模问题缺少关闭证据，不能关闭';
    end if;
    if new.closed_by is null or new.closed_at is null then
      raise exception using errcode = '23514', message = '试模问题缺少关闭人或关闭时间，不能关闭';
    end if;
  end if;

  if tg_op = 'INSERT' and upper(coalesce(new.status, '')) = 'APPROVED_PRODUCTION' then
    raise exception using errcode = '23514', message = '新试模记录不能直接创建为量产放行状态';
  end if;

  if tg_op = 'UPDATE'
     and upper(coalesce(new.status, '')) is distinct from upper(coalesce(old.status, ''))
     and (
       upper(coalesce(new.status, '')) = 'APPROVED_PRODUCTION'
       or upper(coalesce(old.status, '')) = 'APPROVED_PRODUCTION'
     )
     and coalesce(current_setting('app.mold_trial_release', true), '') <> 'allowed' then
    raise exception using errcode = '23514', message = '试模量产放行状态必须通过放行流程变更';
  end if;

  if upper(coalesce(new.status, '')) = 'APPROVED_PRODUCTION'
     and (tg_op = 'INSERT' or upper(coalesce(new.status, '')) is distinct from upper(coalesce(old.status, ''))) then
    if not exists (
      select 1
        from public.mold_development_project project
       where project.id = new.project_id
         and upper(coalesce(project.current_stage, '')) = 'T2'
    ) then
      raise exception using errcode = '23514', message = '只有处于T2验证节点的项目才能执行量产放行';
    end if;
    if upper(coalesce(new.trial_stage, '')) not in ('T2', 'PILOT') then
      raise exception using errcode = '23514', message = '模具试模必须完成T2或小批验证后才能放行';
    end if;
    if upper(coalesce(new.dimension_result, 'PENDING')) <> 'PASS' then
      raise exception using errcode = '23514', message = '模具试模尺寸结果未通过，不能放行';
    end if;
    if upper(coalesce(new.quality_result, 'PENDING')) <> 'PASS' then
      raise exception using errcode = '23514', message = '模具试模质量结果未通过，不能放行';
    end if;
    if upper(coalesce(new.production_result, 'PENDING')) <> 'PASS' then
      raise exception using errcode = '23514', message = '模具试模量产结果未通过，不能放行';
    end if;
    if not coalesce(new.first_pass, false) then
      raise exception using errcode = '23514', message = '模具试模首件未通过，不能放行';
    end if;
    if not exists (
      select 1
        from public.mold_attachment attachment
       where attachment.project_id = new.project_id
         and upper(coalesce(attachment.attachment_type, '')) = 'ACCEPTANCE'
         and upper(coalesce(attachment.status, 'ACTIVE')) = 'ACTIVE'
    ) then
      raise exception using errcode = '23514', message = '当前项目缺少有效验收资料，不能放行';
    end if;
    if has_defect then
      if upper(coalesce(new.issue_severity, 'NOT_REQUIRED')) not in ('LOW', 'MEDIUM', 'HIGH', 'BLOCKER') then
        raise exception using errcode = '23514', message = '试模存在缺陷但未填写有效问题严重度，不能放行';
      end if;
      if nullif(btrim(coalesce(new.correction_action, '')), '') is null then
        raise exception using errcode = '23514', message = '试模存在缺陷但未填写整改措施，不能放行';
      end if;
      if upper(coalesce(new.correction_status, 'NOT_REQUIRED')) <> 'CLOSED' then
        raise exception using errcode = '23514', message = '试模问题未关闭，不能放行';
      end if;
      if upper(coalesce(new.retest_result, 'NOT_REQUIRED')) <> 'PASS' then
        raise exception using errcode = '23514', message = '试模问题复试未通过，不能放行';
      end if;
      if nullif(btrim(coalesce(new.closure_evidence, '')), '') is null then
        raise exception using errcode = '23514', message = '试模问题缺少关闭证据，不能放行';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger trg_validate_mold_trial_release
before insert or update on public.mold_trial_detail
for each row execute function public.validate_mold_trial_release();

create or replace function public.transition_mold_trial_issue(
  p_trial_id bigint,
  p_action text,
  p_evidence text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  trial_row public.mold_trial_detail%rowtype;
  normalized_action text := upper(btrim(coalesce(p_action, '')));
  actor_id bigint;
  current_status text;
  next_status text;
begin
  actor_id := public.current_mold_actor_id();

  select *
    into trial_row
    from public.mold_trial_detail
   where id = p_trial_id
   for update;

  if trial_row.id is null then
    raise exception using errcode = 'P0002', message = '未找到模具试模记录';
  end if;
  if nullif(btrim(coalesce(trial_row.defect_summary, '')), '') is null then
    raise exception using errcode = '23514', message = '无缺陷试模记录不需要执行问题流程';
  end if;
  if upper(coalesce(trial_row.issue_severity, 'NOT_REQUIRED')) not in ('LOW', 'MEDIUM', 'HIGH', 'BLOCKER') then
    raise exception using errcode = '23514', message = '执行问题流程前必须填写有效问题严重度';
  end if;

  current_status := upper(coalesce(trial_row.correction_status, 'NOT_REQUIRED'));
  if normalized_action = 'START' then
    if current_status not in ('NOT_REQUIRED', 'OPEN', 'WAIT_RETEST') then
      raise exception using errcode = '23514', message = '只有待整改或复试未通过的问题可以开始整改';
    end if;
    if current_status = 'WAIT_RETEST'
       and upper(coalesce(trial_row.retest_result, 'PENDING')) <> 'FAIL' then
      raise exception using errcode = '23514', message = '待复试问题仅在复试不通过后才能继续整改';
    end if;
    next_status := 'IN_PROGRESS';
  elsif normalized_action = 'WAIT_RETEST' then
    if current_status <> 'IN_PROGRESS' then
      raise exception using errcode = '23514', message = '只有整改中问题可以转为待复试';
    end if;
    if nullif(btrim(coalesce(trial_row.correction_action, '')), '') is null then
      raise exception using errcode = '23514', message = '转为待复试前必须填写整改措施';
    end if;
    next_status := 'WAIT_RETEST';
  elsif normalized_action = 'CLOSE' then
    if current_status <> 'WAIT_RETEST' then
      raise exception using errcode = '23514', message = '只有待复试问题可以关闭';
    end if;
    if upper(coalesce(trial_row.retest_result, 'NOT_REQUIRED')) <> 'PASS' then
      raise exception using errcode = '23514', message = '复试结果必须为PASS才能关闭问题';
    end if;
    if nullif(btrim(coalesce(trial_row.correction_action, '')), '') is null then
      raise exception using errcode = '23514', message = '关闭问题前必须填写整改措施';
    end if;
    if nullif(btrim(coalesce(p_evidence, '')), '') is null then
      raise exception using errcode = '23514', message = '关闭问题必须提交关闭证据';
    end if;
    next_status := 'CLOSED';
  elsif normalized_action = 'REOPEN' then
    if current_status <> 'CLOSED' then
      raise exception using errcode = '23514', message = '只有已关闭问题可以重新打开';
    end if;
    next_status := 'OPEN';
  else
    raise exception using errcode = '22023', message = '不支持的试模问题动作';
  end if;

  perform set_config('app.mold_trial_issue_transition', 'allowed', true);
  update public.mold_trial_detail
     set correction_status = next_status,
         issue_owner_id = case
           when normalized_action in ('START', 'REOPEN') then coalesce(issue_owner_id, actor_id)
           else issue_owner_id
         end,
         retest_result = case
           when normalized_action in ('START', 'WAIT_RETEST', 'REOPEN') then 'PENDING'
           else retest_result
         end,
         closure_evidence = case when normalized_action = 'CLOSE' then btrim(p_evidence) else null end,
         closed_by = case when normalized_action = 'CLOSE' then actor_id else null end,
         closed_at = case when normalized_action = 'CLOSE' then current_timestamp else null end
   where id = p_trial_id
   returning * into trial_row;

  return jsonb_build_object(
    'trialId', p_trial_id,
    'action', normalized_action,
    'status', trial_row.correction_status,
    'retestResult', trial_row.retest_result,
    'closedBy', trial_row.closed_by,
    'closedAt', trial_row.closed_at
  );
end;
$$;

create or replace function public.release_mold_trial(p_trial_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  trial_row public.mold_trial_detail%rowtype;
  project_row public.mold_development_project%rowtype;
  gate_result jsonb;
begin
  perform public.current_mold_actor_id();

  select *
    into trial_row
    from public.mold_trial_detail
   where id = p_trial_id
   for update;

  if trial_row.id is null then
    raise exception using errcode = 'P0002', message = '未找到模具试模记录';
  end if;

  select *
    into project_row
    from public.mold_development_project
   where id = trial_row.project_id
   for update;

  if project_row.id is null then
    raise exception using errcode = 'P0002', message = '试模记录未关联有效开发项目';
  end if;
  if upper(coalesce(project_row.current_stage, '')) <> 'T2' then
    raise exception using errcode = '23514', message = '只有处于T2验证节点的项目才能执行量产放行';
  end if;
  if upper(coalesce(project_row.status, '')) in ('ON_HOLD', 'CANCELLED', 'CLOSED') then
    raise exception using errcode = '23514', message = '暂停、取消或关闭的项目不能执行量产放行';
  end if;

  perform set_config('app.mold_trial_release', 'allowed', true);
  update public.mold_trial_detail
     set status = 'APPROVED_PRODUCTION'
   where id = p_trial_id
   returning * into trial_row;

  gate_result := public.validate_mold_project_stage_gate(trial_row.project_id);
  if not coalesce((gate_result ->> 'passed')::boolean, false) then
    raise exception using
      errcode = '23514',
      message = '试模放行后项目阶段门禁未通过：' || coalesce(gate_result -> 'blockers' ->> 0, '未知原因'),
      detail = gate_result::text;
  end if;

  if trial_row.trial_mold_record_id is not null then
    update public.trial_mold_record
       set project_id = trial_row.project_id,
           trial_stage = trial_row.trial_stage,
           shot_count = trial_row.shot_count,
           cycle_seconds = trial_row.cycle_seconds,
           defect_summary = trial_row.defect_summary,
           correction_action = trial_row.correction_action,
           production_ready = true,
           first_article_result = 'PASS',
           status = 'APPROVED_PRODUCTION',
           updated_at = current_timestamp
     where id = trial_row.trial_mold_record_id;
  end if;

  update public.andon_event
     set status = 'CLOSED',
         closed_reason = coalesce(nullif(closed_reason, ''), '模具试模已通过量产放行'),
         updated_at = current_timestamp
   where source_type = 'MOLD_TRIAL'
     and source_id = p_trial_id
     and status <> 'CLOSED';

  return jsonb_build_object(
    'trialId', trial_row.id,
    'projectId', trial_row.project_id,
    'projectStage', project_row.current_stage,
    'projectStatus', project_row.status,
    'nextStage', gate_result ->> 'nextStage',
    'releasedAt', current_timestamp
  );
end;
$$;

create or replace view public.mold_life_forecast
with (security_invoker = true)
as
select
  m.id as mold_id,
  m.code as mold_code,
  m.name as mold_name,
  coalesce(m.used_shots, 0) as used_shots,
  coalesce(m.lifetime, 0) as lifetime,
  greatest(coalesce(m.lifetime, 0) - coalesce(m.used_shots, 0), 0) as remaining_shots,
  coalesce(m.maintenance_cycle, 0) as maintenance_cycle,
  coalesce(m.shots_since_maintenance, 0) as shots_since_maintenance,
  coalesce(recent.recent_30d_shots, 0) as recent_30d_shots,
  round(coalesce(recent.recent_30d_shots, 0)::numeric / 30, 2) as avg_daily_shots,
  case
    when coalesce(recent.recent_30d_shots, 0) > 0 then round(
      greatest(coalesce(m.lifetime, 0) - coalesce(m.used_shots, 0), 0)::numeric
      / (recent.recent_30d_shots::numeric / 30),
      1
    )
    else null
  end as estimated_days_to_life,
  case
    when coalesce(m.lifetime, 0) > 0 and coalesce(m.used_shots, 0) >= m.lifetime then 'OVERDUE'
    when coalesce(m.maintenance_cycle, 0) > 0 and coalesce(m.shots_since_maintenance, 0) >= m.maintenance_cycle then 'MAINTENANCE'
    when coalesce(m.lifetime, 0) > 0 and coalesce(m.used_shots, 0)::numeric / m.lifetime >= 0.9 then 'WARNING'
    else 'NORMAL'
  end as risk_level,
  m.status,
  current_timestamp as calculated_at
from public.mold m
left join lateral (
  select coalesce(sum(report.shots), 0)::numeric as recent_30d_shots
    from public.prod_report report
   where report.mold_id = m.id
     and report.created_at >= current_timestamp - interval '30 days'
) recent on true
where public.can_access_mold_development();

-- -----------------------------------------------------------------------------
-- 8. Row-level security and least-privilege grants
-- -----------------------------------------------------------------------------

do $rls$
declare
  target_table text;
  policy_name text;
begin
  foreach target_table in array array[
    'machine',
    'customer',
    'supplier',
    'product',
    'mold',
    'sale_order',
    'sale_order_item',
    'prod_order',
    'prod_report',
    'downtime_record',
    'mold_mount_record',
    'mold_maintenance_record',
    'machine_inspection_record',
    'qc_record',
    'warehouse',
    'warehouse_location',
    'material_batch',
    'stock',
    'stock_move',
    'stock_transfer',
    'stock_transfer_item',
    'stock_inventory',
    'stock_inventory_item',
    'piece_price',
    'salary_daily',
    'salary_adjust',
    'payment_record',
    'delivery_order',
    'delivery_order_item',
    'expense_record',
    'sys_operation_log',
    'sys_config',
    'notification',
    'seq_number',
    'process_card',
    'trial_mold_record',
    'material_mix_order',
    'batch_trace_link',
    'startup_check',
    'maintenance_order',
    'spare_part',
    'mold_maintenance_plan',
    'andon_event',
    'label_template',
    'customer_complaint',
    'oee_record',
    'process_change',
    'purchase_requisition',
    'workflow_definition',
    'workflow_instance',
    'workflow_task',
    'workflow_log'
  ] loop
    execute format('alter table public.%I enable row level security', target_table);
    policy_name := target_table || '_authenticated_access';
    if not exists (
      select 1
        from pg_catalog.pg_policies
       where schemaname = 'public'
         and tablename = target_table
         and policyname = policy_name
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using ((select public.current_erp_user_is_active())) with check ((select public.current_erp_user_is_active()))',
        policy_name,
        target_table
      );
    end if;
    execute format(
      'alter policy %I on public.%I to authenticated using ((select public.current_erp_user_is_active())) with check ((select public.current_erp_user_is_active()))',
      policy_name,
      target_table
    );
  end loop;
end;
$rls$;

-- All active users may read runtime configuration, but only mapped managers may mutate it.
alter policy sys_config_authenticated_access on public.sys_config
  to authenticated
  using ((select public.current_erp_user_is_manager()))
  with check ((select public.current_erp_user_is_manager()));

do $sys_config_policies$
begin
  if not exists (
    select 1
      from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename = 'sys_config'
       and policyname = 'sys_config_authenticated_select'
  ) then
    create policy sys_config_authenticated_select
    on public.sys_config for select
    to authenticated
    using ((select public.current_erp_user_is_active()));
  end if;
end;
$sys_config_policies$;

alter policy sys_config_authenticated_select on public.sys_config
  to authenticated
  using ((select public.current_erp_user_is_active()));

do $mold_rls$
declare
  target_table text;
  policy_name text;
begin
  foreach target_table in array array[
    'mold_development_project',
    'mold_project_milestone',
    'mold_trial_detail',
    'mold_revision',
    'mold_attachment',
    'mold_product',
    'mold_component',
    'mold_cost_record',
    'mold_supplier_evaluation'
  ] loop
    execute format('alter table public.%I enable row level security', target_table);
    policy_name := target_table || '_authenticated_access';
    if not exists (
      select 1
        from pg_catalog.pg_policies
       where schemaname = 'public'
         and tablename = target_table
         and policyname = policy_name
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using ((select public.can_access_mold_development())) with check ((select public.can_access_mold_development()))',
        policy_name,
        target_table
      );
    end if;
    execute format(
      'alter policy %I on public.%I to authenticated using ((select public.can_access_mold_development())) with check ((select public.can_access_mold_development()))',
      policy_name,
      target_table
    );
  end loop;
end;
$mold_rls$;

alter table public.sys_user enable row level security;

do $sys_user_policies$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'sys_user' and policyname = 'sys_user_directory_select'
  ) then
    create policy sys_user_directory_select
    on public.sys_user for select
    to authenticated
    using ((select public.current_erp_user_is_active()));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'sys_user' and policyname = 'sys_user_manager_insert'
  ) then
    create policy sys_user_manager_insert
    on public.sys_user for insert
    to authenticated
    with check (public.current_erp_user_is_manager());
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'sys_user' and policyname = 'sys_user_manager_update'
  ) then
    create policy sys_user_manager_update
    on public.sys_user for update
    to authenticated
    using (public.current_erp_user_is_manager())
    with check (public.current_erp_user_is_manager());
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'sys_user' and policyname = 'sys_user_manager_delete'
  ) then
    create policy sys_user_manager_delete
    on public.sys_user for delete
    to authenticated
    using (public.current_erp_user_is_manager());
  end if;
end;
$sys_user_policies$;

alter policy sys_user_directory_select on public.sys_user
  to authenticated using ((select public.current_erp_user_is_active()));
alter policy sys_user_manager_insert on public.sys_user
  to authenticated with check (public.current_erp_user_is_manager());
alter policy sys_user_manager_update on public.sys_user
  to authenticated
  using (public.current_erp_user_is_manager())
  with check (public.current_erp_user_is_manager());
alter policy sys_user_manager_delete on public.sys_user
  to authenticated using (public.current_erp_user_is_manager());

revoke create on schema public from public;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on table public.sys_user from authenticated;
grant select (
  id,
  username,
  real_name,
  phone,
  role,
  status,
  login_fail_count,
  lock_until,
  last_login_at,
  created_at,
  updated_at
) on public.sys_user to authenticated;
grant insert, update, delete on table public.sys_user to authenticated;

grant execute on function public.current_erp_user_profile() to authenticated;
grant execute on function public.current_erp_user_is_active() to authenticated;
grant execute on function public.current_erp_user_is_manager() to authenticated;
grant execute on function public.can_access_mold_development() to authenticated;
grant execute on function public.validate_mold_project_stage_gate(bigint) to authenticated;
grant execute on function public.advance_mold_development_project(bigint) to authenticated;
grant execute on function public.release_mold_trial(bigint) to authenticated;
grant execute on function public.transition_mold_revision(bigint, text) to authenticated;
grant execute on function public.transition_mold_trial_issue(bigint, text, text) to authenticated;
grant execute on function public.bind_mold_auth_user(bigint, uuid) to supabase_admin;
grant execute on function public.bind_mold_auth_user(bigint, uuid) to service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Storage buckets and object policies
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('erp-files', 'erp-files', true),
  ('erp-mold-development', 'erp-mold-development', false)
on conflict (id) do update set public = excluded.public;

do $storage_policies$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'erp_files_public_select'
  ) then
    create policy erp_files_public_select
    on storage.objects for select
    to public
    using (bucket_id = 'erp-files');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'erp_files_authenticated_insert'
  ) then
    create policy erp_files_authenticated_insert
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'erp-files'
      and (select public.current_erp_user_is_active())
    );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'erp_files_authenticated_update'
  ) then
    create policy erp_files_authenticated_update
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'erp-files'
      and (select public.current_erp_user_is_active())
    )
    with check (
      bucket_id = 'erp-files'
      and (select public.current_erp_user_is_active())
    );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'erp_files_authenticated_delete'
  ) then
    create policy erp_files_authenticated_delete
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'erp-files'
      and (select public.current_erp_user_is_active())
    );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'mold_development_files_select'
  ) then
    create policy mold_development_files_select
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'erp-mold-development'
      and (storage.foldername(name))[1] = 'mold-development'
      and public.can_access_mold_development()
    );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'mold_development_files_insert'
  ) then
    create policy mold_development_files_insert
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'erp-mold-development'
      and (storage.foldername(name))[1] = 'mold-development'
      and public.can_access_mold_development()
    );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'mold_development_files_update'
  ) then
    create policy mold_development_files_update
    on storage.objects for update
    to authenticated
    using (
      bucket_id = 'erp-mold-development'
      and (storage.foldername(name))[1] = 'mold-development'
      and public.can_access_mold_development()
    )
    with check (
      bucket_id = 'erp-mold-development'
      and (storage.foldername(name))[1] = 'mold-development'
      and public.can_access_mold_development()
    );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'mold_development_files_delete'
  ) then
    create policy mold_development_files_delete
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'erp-mold-development'
      and (storage.foldername(name))[1] = 'mold-development'
      and public.can_access_mold_development()
    );
  end if;
end;
$storage_policies$;

alter policy erp_files_public_select on storage.objects
  to public using (bucket_id = 'erp-files');
alter policy erp_files_authenticated_insert on storage.objects
  to authenticated
  with check (bucket_id = 'erp-files' and (select public.current_erp_user_is_active()));
alter policy erp_files_authenticated_update on storage.objects
  to authenticated
  using (bucket_id = 'erp-files' and (select public.current_erp_user_is_active()))
  with check (bucket_id = 'erp-files' and (select public.current_erp_user_is_active()));
alter policy erp_files_authenticated_delete on storage.objects
  to authenticated
  using (bucket_id = 'erp-files' and (select public.current_erp_user_is_active()));
alter policy mold_development_files_select on storage.objects
  to authenticated
  using (
    bucket_id = 'erp-mold-development'
    and (storage.foldername(name))[1] = 'mold-development'
    and public.can_access_mold_development()
  );
alter policy mold_development_files_insert on storage.objects
  to authenticated
  with check (
    bucket_id = 'erp-mold-development'
    and (storage.foldername(name))[1] = 'mold-development'
    and public.can_access_mold_development()
  );
alter policy mold_development_files_update on storage.objects
  to authenticated
  using (
    bucket_id = 'erp-mold-development'
    and (storage.foldername(name))[1] = 'mold-development'
    and public.can_access_mold_development()
  )
  with check (
    bucket_id = 'erp-mold-development'
    and (storage.foldername(name))[1] = 'mold-development'
    and public.can_access_mold_development()
  );
alter policy mold_development_files_delete on storage.objects
  to authenticated
  using (
    bucket_id = 'erp-mold-development'
    and (storage.foldername(name))[1] = 'mold-development'
    and public.can_access_mold_development()
  );

notify pgrst, 'reload schema';

commit;

-- END OF INJECT ERP SUPABASE BOOTSTRAP
