-- ERP production workflow release SQL
-- Scope:
-- 1) workflow center tables
-- 2) workflow definitions for master, finance, sale and stock flows
-- 3) indexes, grants and schema reload
-- Safe to run multiple times.

begin;

create table if not exists public.workflow_definition (
  id bigserial primary key,
  code varchar(80) not null,
  name varchar(120) not null,
  business_type varchar(80) not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.workflow_instance (
  id bigserial primary key,
  definition_code varchar(80) not null,
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
  finished_at timestamp
);

create table if not exists public.workflow_task (
  id bigserial primary key,
  instance_id bigint references public.workflow_instance(id) on delete cascade,
  task_no varchar(120) not null,
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

alter table if exists public.workflow_definition
  add column if not exists code varchar(80),
  add column if not exists name varchar(120),
  add column if not exists business_type varchar(80),
  add column if not exists enabled boolean default true,
  add column if not exists config jsonb default '{}'::jsonb,
  add column if not exists created_at timestamp default current_timestamp,
  add column if not exists updated_at timestamp default current_timestamp;

alter table if exists public.workflow_instance
  add column if not exists definition_code varchar(80),
  add column if not exists business_type varchar(80),
  add column if not exists business_id bigint,
  add column if not exists business_code varchar(120),
  add column if not exists title varchar(240),
  add column if not exists status varchar(64) default 'DRAFT',
  add column if not exists current_node varchar(80),
  add column if not exists route varchar(200),
  add column if not exists owner_id bigint,
  add column if not exists created_by bigint,
  add column if not exists created_at timestamp default current_timestamp,
  add column if not exists updated_at timestamp default current_timestamp,
  add column if not exists finished_at timestamp;

alter table if exists public.workflow_task
  add column if not exists instance_id bigint,
  add column if not exists task_no varchar(120),
  add column if not exists business_type varchar(80),
  add column if not exists business_id bigint,
  add column if not exists business_code varchar(120),
  add column if not exists title varchar(240),
  add column if not exists description text,
  add column if not exists status varchar(64) default 'OPEN',
  add column if not exists node varchar(80),
  add column if not exists priority int default 60,
  add column if not exists assignee_id bigint,
  add column if not exists assignee_name varchar(120),
  add column if not exists source_route varchar(200),
  add column if not exists due_at timestamp,
  add column if not exists created_by bigint,
  add column if not exists created_at timestamp default current_timestamp,
  add column if not exists claimed_at timestamp,
  add column if not exists started_at timestamp,
  add column if not exists finished_at timestamp,
  add column if not exists updated_at timestamp default current_timestamp;

alter table if exists public.workflow_log
  add column if not exists instance_id bigint,
  add column if not exists task_id bigint,
  add column if not exists business_type varchar(80),
  add column if not exists business_id bigint,
  add column if not exists action varchar(64),
  add column if not exists from_status varchar(64),
  add column if not exists to_status varchar(64),
  add column if not exists actor_id bigint,
  add column if not exists note text,
  add column if not exists created_at timestamp default current_timestamp;

create unique index if not exists uq_workflow_definition_code
  on public.workflow_definition (code);

create unique index if not exists uq_workflow_definition_business_type
  on public.workflow_definition (business_type);

create unique index if not exists uq_workflow_instance_business
  on public.workflow_instance (business_type, business_id);

create unique index if not exists uq_workflow_task_no
  on public.workflow_task (task_no);

create index if not exists idx_workflow_instance_status
  on public.workflow_instance (status, updated_at desc);

create index if not exists idx_workflow_instance_business
  on public.workflow_instance (business_type, business_id);

create index if not exists idx_workflow_task_status_priority
  on public.workflow_task (status, priority, created_at desc);

create index if not exists idx_workflow_task_assignee
  on public.workflow_task (assignee_id, status);

create index if not exists idx_workflow_task_business
  on public.workflow_task (business_type, business_id);

create index if not exists idx_workflow_task_instance
  on public.workflow_task (instance_id, status);

create index if not exists idx_workflow_log_business
  on public.workflow_log (business_type, business_id, created_at desc);

create index if not exists idx_workflow_log_instance
  on public.workflow_log (instance_id, created_at desc);

insert into public.workflow_definition (code, name, business_type, config, enabled, updated_at)
values
  ('customer-master-review', '客户资料审核', 'customer', '{"route":"/base/customers"}'::jsonb, true, current_timestamp),
  ('sale-order-approval', '销售订单审核', 'sale_order', '{"route":"/sale/orders"}'::jsonb, true, current_timestamp),
  ('purchase-requisition-approval', '采购请购审批', 'purchase_requisition', '{"route":"/injection/purchase-requisition"}'::jsonb, true, current_timestamp),
  ('production-order-flow', '生产工单闭环', 'prod_order', '{"route":"/prod/orders"}'::jsonb, true, current_timestamp),
  ('maintenance-order-repair-flow', '设备维修闭环', 'maintenance_order', '{"route":"/injection/maintenance-order"}'::jsonb, true, current_timestamp),
  ('spare-part-replenishment', '备件补货闭环', 'spare_part', '{"route":"/equipment/spare-parts"}'::jsonb, true, current_timestamp),
  ('salary-month-review', '工资月结复核', 'salary_month', '{"route":"/salary/monthly"}'::jsonb, true, current_timestamp),
  ('qc-defect-disposal-flow', '不良品处置闭环', 'qc_record', '{"route":"/qc/defect-disposal"}'::jsonb, true, current_timestamp),
  ('stock-inventory-approval', '库存盘点审批', 'stock_inventory', '{"route":"/stock/inventory"}'::jsonb, true, current_timestamp),
  ('expense-approval-flow', '费用支出审批', 'expense_record', '{"route":"/finance/expenses"}'::jsonb, true, current_timestamp),
  ('payment-confirmation-flow', '销售回款确认', 'payment_record', '{"route":"/sale/payments"}'::jsonb, true, current_timestamp),
  ('purchase-inbound-review', '采购入库复核', 'purchase_inbound', '{"route":"/stock/in-purchase"}'::jsonb, true, current_timestamp)
on conflict (business_type) do update
set code = excluded.code,
    name = excluded.name,
    config = excluded.config,
    enabled = true,
    updated_at = current_timestamp;

alter table if exists public.workflow_definition disable row level security;
alter table if exists public.workflow_instance disable row level security;
alter table if exists public.workflow_task disable row level security;
alter table if exists public.workflow_log disable row level security;

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on table
  public.workflow_definition,
  public.workflow_instance,
  public.workflow_task,
  public.workflow_log
to anon, authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;

notify pgrst, 'reload schema';

commit;
