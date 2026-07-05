-- Injection professional extension for an existing Supabase project.
-- Run this in Supabase SQL Editor when the base ERP schema already exists.

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

grant select, insert, update, delete on table
  public.process_card,
  public.trial_mold_record,
  public.material_mix_order,
  public.batch_trace_link,
  public.startup_check,
  public.maintenance_order,
  public.spare_part,
  public.mold_maintenance_plan,
  public.andon_event,
  public.label_template,
  public.customer_complaint,
  public.oee_record,
  public.process_change,
  public.purchase_requisition
to anon, authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;
