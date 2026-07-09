-- Unified workflow center for ERP approval and task tracking.
-- Run in Supabase SQL Editor after the base ERP schema exists.

begin;

create table if not exists public.workflow_definition (
  id bigserial primary key,
  code varchar(80) not null unique,
  name varchar(120) not null,
  business_type varchar(80) not null unique,
  enabled boolean default true,
  config jsonb default '{}'::jsonb,
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
  status varchar(64) default 'DRAFT',
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
  status varchar(64) default 'OPEN',
  node varchar(80),
  priority int default 60,
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
on conflict (business_type) do update
set code = excluded.code,
    name = excluded.name,
    config = excluded.config,
    enabled = true,
    updated_at = current_timestamp;

create index if not exists idx_workflow_instance_status on public.workflow_instance (status, updated_at desc);
create index if not exists idx_workflow_instance_business on public.workflow_instance (business_type, business_id);
create index if not exists idx_workflow_task_status_priority on public.workflow_task (status, priority, created_at desc);
create index if not exists idx_workflow_task_assignee on public.workflow_task (assignee_id, status);
create index if not exists idx_workflow_task_business on public.workflow_task (business_type, business_id);
create index if not exists idx_workflow_log_business on public.workflow_log (business_type, business_id, created_at desc);

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
