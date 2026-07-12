-- 模具开发中心第一至第五阶段完整安装脚本
-- 面向全新 Supabase 环境，可重复执行。
-- 执行前需先完成基础 ERP 与注塑专业表，至少包含：mold、product、customer、supplier、sys_user、
-- trial_mold_record、prod_report、andon_event。模具附件使用私有桶 erp-mold-development。
-- 所有业务访问要求 Supabase Auth 会话，且管理员需预先将 sys_user.auth_user_id 精确绑定到 auth.users.id。

do $$
begin
  if to_regclass('public.mold') is null
    or to_regclass('public.product') is null
    or to_regclass('public.customer') is null
    or to_regclass('public.supplier') is null
    or to_regclass('public.sys_user') is null
    or to_regclass('public.trial_mold_record') is null
    or to_regclass('public.prod_report') is null
    or to_regclass('public.andon_event') is null then
    raise exception '请先执行基础 ERP 与注塑专业建表 SQL，再执行 supabase-mold-development.sql';
  end if;
end;
$$;

create table if not exists public.mold_development_project (
  id bigserial primary key,
  project_no varchar(80) not null unique,
  project_name varchar(160) not null,
  mold_id bigint,
  product_id bigint,
  customer_id bigint,
  supplier_id bigint,
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
  owner_id bigint,
  status varchar(64) default 'DRAFT',
  risk_level varchar(32) default 'NORMAL',
  requirement text,
  remark text,
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.mold_project_milestone (
  id bigserial primary key,
  project_id bigint not null,
  stage_code varchar(64) not null,
  stage_name varchar(100) not null,
  sequence_no int not null default 1,
  planned_date date,
  actual_date date,
  owner_id bigint,
  status varchar(64) default 'PENDING',
  deliverable text,
  risk_note text,
  approved_by bigint,
  remark text,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  constraint uq_mold_project_milestone unique (project_id, stage_code)
);

create table if not exists public.mold_trial_detail (
  id bigserial primary key,
  project_id bigint not null,
  trial_mold_record_id bigint,
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
  issue_owner_id bigint,
  correction_due_date date,
  correction_status varchar(32) default 'NOT_REQUIRED',
  retest_result varchar(32) default 'NOT_REQUIRED',
  closure_evidence text,
  closed_by bigint,
  closed_at timestamp,
  next_trial_date date,
  photo_urls jsonb default '[]'::jsonb,
  status varchar(64) default 'DRAFT',
  owner_id bigint,
  confirmed_by bigint,
  remark text,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.mold_revision (
  id bigserial primary key,
  project_id bigint,
  mold_id bigint not null,
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
  created_by bigint,
  approved_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp,
  constraint uq_mold_revision unique (mold_id, revision_no)
);

create table if not exists public.mold_attachment (
  id bigserial primary key,
  project_id bigint,
  mold_id bigint,
  attachment_type varchar(64) default 'OTHER',
  file_name varchar(240) not null,
  file_url varchar(800) not null,
  version_no varchar(40),
  checksum varchar(128),
  status varchar(64) default 'ACTIVE',
  uploaded_by bigint,
  created_at timestamp default current_timestamp
);

create table if not exists public.mold_product (
  id bigserial primary key,
  mold_id bigint not null,
  product_id bigint not null,
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
  constraint uq_mold_product unique (mold_id, product_id)
);

create table if not exists public.mold_component (
  id bigserial primary key,
  project_id bigint,
  mold_id bigint not null,
  component_code varchar(100) not null,
  component_name varchar(160) not null,
  component_type varchar(80),
  material varchar(120),
  supplier_id bigint,
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
  constraint uq_mold_component unique (mold_id, component_code)
);

create table if not exists public.mold_cost_record (
  id bigserial primary key,
  project_id bigint,
  mold_id bigint,
  supplier_id bigint,
  cost_type varchar(64) not null,
  source_no varchar(100),
  quoted_amount numeric(14,2) default 0,
  actual_amount numeric(14,2) default 0,
  occurred_at date,
  status varchar(64) default 'DRAFT',
  remark text,
  created_by bigint,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists public.mold_supplier_evaluation (
  id bigserial primary key,
  project_id bigint,
  mold_id bigint,
  supplier_id bigint not null,
  delivery_score numeric(5,2) default 0,
  quality_score numeric(5,2) default 0,
  response_score numeric(5,2) default 0,
  total_score numeric(5,2) default 0,
  evaluation_status varchar(64) default 'DRAFT',
  remark text,
  evaluated_by bigint,
  evaluated_at date,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

alter table public.mold_trial_detail
  add column if not exists issue_severity varchar(32) default 'NOT_REQUIRED',
  add column if not exists issue_owner_id bigint,
  add column if not exists correction_due_date date,
  add column if not exists correction_status varchar(32) default 'NOT_REQUIRED',
  add column if not exists retest_result varchar(32) default 'NOT_REQUIRED',
  add column if not exists closure_evidence text,
  add column if not exists closed_by bigint,
  add column if not exists closed_at timestamp;

alter table public.sys_user add column if not exists auth_user_id uuid;
create unique index if not exists uq_sys_user_auth_user_id
on public.sys_user (auth_user_id)
where auth_user_id is not null;

create or replace function public.guard_sys_user_auth_binding()
returns trigger
language plpgsql
as $$
begin
  if (
    (tg_op = 'INSERT' and new.auth_user_id is not null)
    or (tg_op = 'UPDATE' and new.auth_user_id is distinct from old.auth_user_id)
  )
  and current_user not in ('postgres', 'supabase_admin', 'service_role')
  and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'auth_user_id 只能由数据库管理员或 service_role 绑定';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_sys_user_auth_binding() from public;
revoke all on function public.guard_sys_user_auth_binding() from anon;
revoke all on function public.guard_sys_user_auth_binding() from authenticated;

drop trigger if exists trg_guard_sys_user_auth_binding on public.sys_user;
create trigger trg_guard_sys_user_auth_binding
before insert or update of auth_user_id
on public.sys_user
for each row execute function public.guard_sys_user_auth_binding();

create or replace function public.bind_mold_auth_user(p_sys_user_id bigint, p_auth_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  bound_username text;
begin
  if not exists (select 1 from auth.users where id = p_auth_user_id) then
    raise exception using errcode = 'P0002', message = '未找到指定的 Supabase Auth 用户';
  end if;

  update public.sys_user
     set auth_user_id = p_auth_user_id
   where id = p_sys_user_id
   returning username into bound_username;

  if bound_username is null then
    raise exception using errcode = 'P0002', message = '未找到指定的系统用户';
  end if;

  return jsonb_build_object('sysUserId', p_sys_user_id, 'authUserId', p_auth_user_id, 'username', bound_username);
end;
$$;

revoke all on function public.bind_mold_auth_user(bigint, uuid) from public;
revoke all on function public.bind_mold_auth_user(bigint, uuid) from anon;
revoke all on function public.bind_mold_auth_user(bigint, uuid) from authenticated;
grant execute on function public.bind_mold_auth_user(bigint, uuid) to service_role;

alter table public.trial_mold_record add column if not exists project_id bigint;
alter table public.trial_mold_record add column if not exists trial_stage varchar(32);
alter table public.trial_mold_record add column if not exists shot_count int default 0;
alter table public.trial_mold_record add column if not exists cycle_seconds numeric(12,2);
alter table public.trial_mold_record add column if not exists defect_summary text;
alter table public.trial_mold_record add column if not exists correction_action text;
alter table public.trial_mold_record add column if not exists production_ready boolean default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_dev_project_mold' and conrelid = 'public.mold_development_project'::regclass) then
    alter table public.mold_development_project add constraint fk_mold_dev_project_mold foreign key (mold_id) references public.mold(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_dev_project_product' and conrelid = 'public.mold_development_project'::regclass) then
    alter table public.mold_development_project add constraint fk_mold_dev_project_product foreign key (product_id) references public.product(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_dev_project_customer' and conrelid = 'public.mold_development_project'::regclass) then
    alter table public.mold_development_project add constraint fk_mold_dev_project_customer foreign key (customer_id) references public.customer(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_dev_project_supplier' and conrelid = 'public.mold_development_project'::regclass) then
    alter table public.mold_development_project add constraint fk_mold_dev_project_supplier foreign key (supplier_id) references public.supplier(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_dev_project_owner' and conrelid = 'public.mold_development_project'::regclass) then
    alter table public.mold_development_project add constraint fk_mold_dev_project_owner foreign key (owner_id) references public.sys_user(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_dev_project_creator' and conrelid = 'public.mold_development_project'::regclass) then
    alter table public.mold_development_project add constraint fk_mold_dev_project_creator foreign key (created_by) references public.sys_user(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_milestone_project' and conrelid = 'public.mold_project_milestone'::regclass) then
    alter table public.mold_project_milestone add constraint fk_mold_milestone_project foreign key (project_id) references public.mold_development_project(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_milestone_owner' and conrelid = 'public.mold_project_milestone'::regclass) then
    alter table public.mold_project_milestone add constraint fk_mold_milestone_owner foreign key (owner_id) references public.sys_user(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_milestone_approver' and conrelid = 'public.mold_project_milestone'::regclass) then
    alter table public.mold_project_milestone add constraint fk_mold_milestone_approver foreign key (approved_by) references public.sys_user(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_trial_project' and conrelid = 'public.mold_trial_detail'::regclass) then
    alter table public.mold_trial_detail add constraint fk_mold_trial_project foreign key (project_id) references public.mold_development_project(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_trial_source' and conrelid = 'public.mold_trial_detail'::regclass) then
    alter table public.mold_trial_detail add constraint fk_mold_trial_source foreign key (trial_mold_record_id) references public.trial_mold_record(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_trial_owner' and conrelid = 'public.mold_trial_detail'::regclass) then
    alter table public.mold_trial_detail add constraint fk_mold_trial_owner foreign key (owner_id) references public.sys_user(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_trial_confirmer' and conrelid = 'public.mold_trial_detail'::regclass) then
    alter table public.mold_trial_detail add constraint fk_mold_trial_confirmer foreign key (confirmed_by) references public.sys_user(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_trial_issue_owner' and conrelid = 'public.mold_trial_detail'::regclass) then
    alter table public.mold_trial_detail add constraint fk_mold_trial_issue_owner foreign key (issue_owner_id) references public.sys_user(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_trial_closed_by' and conrelid = 'public.mold_trial_detail'::regclass) then
    alter table public.mold_trial_detail add constraint fk_mold_trial_closed_by foreign key (closed_by) references public.sys_user(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_trial_mold_record_project' and conrelid = 'public.trial_mold_record'::regclass) then
    alter table public.trial_mold_record add constraint fk_trial_mold_record_project foreign key (project_id) references public.mold_development_project(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_revision_project' and conrelid = 'public.mold_revision'::regclass) then
    alter table public.mold_revision add constraint fk_mold_revision_project foreign key (project_id) references public.mold_development_project(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_revision_mold' and conrelid = 'public.mold_revision'::regclass) then
    alter table public.mold_revision add constraint fk_mold_revision_mold foreign key (mold_id) references public.mold(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_revision_creator' and conrelid = 'public.mold_revision'::regclass) then
    alter table public.mold_revision add constraint fk_mold_revision_creator foreign key (created_by) references public.sys_user(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_revision_approver' and conrelid = 'public.mold_revision'::regclass) then
    alter table public.mold_revision add constraint fk_mold_revision_approver foreign key (approved_by) references public.sys_user(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_attachment_project' and conrelid = 'public.mold_attachment'::regclass) then
    alter table public.mold_attachment add constraint fk_mold_attachment_project foreign key (project_id) references public.mold_development_project(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_attachment_mold' and conrelid = 'public.mold_attachment'::regclass) then
    alter table public.mold_attachment add constraint fk_mold_attachment_mold foreign key (mold_id) references public.mold(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_attachment_uploader' and conrelid = 'public.mold_attachment'::regclass) then
    alter table public.mold_attachment add constraint fk_mold_attachment_uploader foreign key (uploaded_by) references public.sys_user(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_product_mold' and conrelid = 'public.mold_product'::regclass) then
    alter table public.mold_product add constraint fk_mold_product_mold foreign key (mold_id) references public.mold(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_product_product' and conrelid = 'public.mold_product'::regclass) then
    alter table public.mold_product add constraint fk_mold_product_product foreign key (product_id) references public.product(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_component_project' and conrelid = 'public.mold_component'::regclass) then
    alter table public.mold_component add constraint fk_mold_component_project foreign key (project_id) references public.mold_development_project(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_component_mold' and conrelid = 'public.mold_component'::regclass) then
    alter table public.mold_component add constraint fk_mold_component_mold foreign key (mold_id) references public.mold(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_component_supplier' and conrelid = 'public.mold_component'::regclass) then
    alter table public.mold_component add constraint fk_mold_component_supplier foreign key (supplier_id) references public.supplier(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_cost_project' and conrelid = 'public.mold_cost_record'::regclass) then
    alter table public.mold_cost_record add constraint fk_mold_cost_project foreign key (project_id) references public.mold_development_project(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_cost_mold' and conrelid = 'public.mold_cost_record'::regclass) then
    alter table public.mold_cost_record add constraint fk_mold_cost_mold foreign key (mold_id) references public.mold(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_cost_supplier' and conrelid = 'public.mold_cost_record'::regclass) then
    alter table public.mold_cost_record add constraint fk_mold_cost_supplier foreign key (supplier_id) references public.supplier(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_cost_creator' and conrelid = 'public.mold_cost_record'::regclass) then
    alter table public.mold_cost_record add constraint fk_mold_cost_creator foreign key (created_by) references public.sys_user(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_evaluation_project' and conrelid = 'public.mold_supplier_evaluation'::regclass) then
    alter table public.mold_supplier_evaluation add constraint fk_mold_evaluation_project foreign key (project_id) references public.mold_development_project(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_evaluation_mold' and conrelid = 'public.mold_supplier_evaluation'::regclass) then
    alter table public.mold_supplier_evaluation add constraint fk_mold_evaluation_mold foreign key (mold_id) references public.mold(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_evaluation_supplier' and conrelid = 'public.mold_supplier_evaluation'::regclass) then
    alter table public.mold_supplier_evaluation add constraint fk_mold_evaluation_supplier foreign key (supplier_id) references public.supplier(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_mold_evaluation_actor' and conrelid = 'public.mold_supplier_evaluation'::regclass) then
    alter table public.mold_supplier_evaluation add constraint fk_mold_evaluation_actor foreign key (evaluated_by) references public.sys_user(id) on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ck_mold_dev_project_values' and conrelid = 'public.mold_development_project'::regclass) then
    alter table public.mold_development_project add constraint ck_mold_dev_project_values check (
      coalesce(cavity_count, 1) > 0 and coalesce(target_machine_tonnage, 0) >= 0 and coalesce(target_cycle_seconds, 0) >= 0
      and coalesce(annual_demand, 0) >= 0 and coalesce(budget_amount, 0) >= 0 and coalesce(actual_amount, 0) >= 0
      and (planned_start_date is null or planned_due_date is null or planned_due_date >= planned_start_date)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_mold_trial_values' and conrelid = 'public.mold_trial_detail'::regclass) then
    alter table public.mold_trial_detail add constraint ck_mold_trial_values check (
      coalesce(shot_count, 0) >= 0 and coalesce(cycle_seconds, 0) >= 0
      and upper(coalesce(dimension_result, 'PENDING')) in ('PENDING', 'PASS', 'FAIL')
      and upper(coalesce(quality_result, 'PENDING')) in ('PENDING', 'PASS', 'FAIL')
      and upper(coalesce(production_result, 'PENDING')) in ('PENDING', 'PASS', 'FAIL')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_mold_trial_issue_values' and conrelid = 'public.mold_trial_detail'::regclass) then
    alter table public.mold_trial_detail add constraint ck_mold_trial_issue_values check (
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
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_mold_trial_issue_consistency' and conrelid = 'public.mold_trial_detail'::regclass) then
    alter table public.mold_trial_detail add constraint ck_mold_trial_issue_consistency check (
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
    ) not valid;
  end if;
  begin
    alter table public.mold_trial_detail validate constraint ck_mold_trial_issue_consistency;
  exception
    when check_violation then
      raise notice '检测到历史试模问题状态不一致；新写入已受约束，清理历史数据后请手动 VALIDATE CONSTRAINT ck_mold_trial_issue_consistency';
  end;
  if not exists (select 1 from pg_constraint where conname = 'ck_mold_product_cavity' and conrelid = 'public.mold_product'::regclass) then
    alter table public.mold_product add constraint ck_mold_product_cavity check (
      coalesce(cavity_count, 1) > 0 and (cavity_start is null or cavity_start > 0)
      and (cavity_end is null or cavity_end > 0) and (cavity_start is null or cavity_end is null or cavity_end >= cavity_start)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_mold_component_values' and conrelid = 'public.mold_component'::regclass) then
    alter table public.mold_component add constraint ck_mold_component_values check (
      coalesce(quantity, 0) >= 0 and coalesce(lifetime_shots, 0) >= 0 and coalesce(used_shots, 0) >= 0 and coalesce(replacement_cost, 0) >= 0
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_mold_cost_values' and conrelid = 'public.mold_cost_record'::regclass) then
    alter table public.mold_cost_record add constraint ck_mold_cost_values check (coalesce(quoted_amount, 0) >= 0 and coalesce(actual_amount, 0) >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_mold_evaluation_scores' and conrelid = 'public.mold_supplier_evaluation'::regclass) then
    alter table public.mold_supplier_evaluation add constraint ck_mold_evaluation_scores check (
      delivery_score between 0 and 100 and quality_score between 0 and 100 and response_score between 0 and 100 and total_score between 0 and 100
    );
  end if;
end;
$$;

create or replace function public.set_mold_development_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := current_timestamp;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'mold_development_project', 'mold_project_milestone', 'mold_trial_detail', 'mold_revision',
    'mold_product', 'mold_component', 'mold_cost_record', 'mold_supplier_evaluation'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || table_name || '_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_mold_development_updated_at()',
      'trg_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.normalize_mold_product_cavity()
returns trigger
language plpgsql
as $$
begin
  if new.cavity_start is not null and new.cavity_end is not null then
    new.cavity_count := new.cavity_end - new.cavity_start + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_mold_product_cavity on public.mold_product;
create trigger trg_normalize_mold_product_cavity
before insert or update
on public.mold_product
for each row execute function public.normalize_mold_product_cavity();

create or replace function public.normalize_mold_supplier_score()
returns trigger
language plpgsql
as $$
begin
  new.total_score := round((coalesce(new.delivery_score, 0) + coalesce(new.quality_score, 0) + coalesce(new.response_score, 0)) / 3, 2);
  return new;
end;
$$;

drop trigger if exists trg_normalize_mold_supplier_score on public.mold_supplier_evaluation;
create trigger trg_normalize_mold_supplier_score
before insert or update
on public.mold_supplier_evaluation
for each row execute function public.normalize_mold_supplier_score();

create or replace function public.sync_mold_project_actual_cost()
returns trigger
language plpgsql
as $$
declare
  target_project_id bigint;
begin
  target_project_id := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
  perform set_config('app.mold_cost_sync', 'allowed', true);
  if target_project_id is not null then
    update public.mold_development_project
       set actual_amount = coalesce((select sum(coalesce(actual_amount, 0)) from public.mold_cost_record where project_id = target_project_id), 0)
     where id = target_project_id;
  end if;
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id and old.project_id is not null then
    update public.mold_development_project
       set actual_amount = coalesce((select sum(coalesce(actual_amount, 0)) from public.mold_cost_record where project_id = old.project_id), 0)
     where id = old.project_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_mold_project_actual_cost on public.mold_cost_record;
create trigger trg_sync_mold_project_actual_cost
after insert or update or delete
on public.mold_cost_record
for each row execute function public.sync_mold_project_actual_cost();

create or replace function public.guard_mold_project_actual_cost()
returns trigger
language plpgsql
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

drop trigger if exists trg_guard_mold_project_actual_cost on public.mold_development_project;
create trigger trg_guard_mold_project_actual_cost
before insert or update of actual_amount
on public.mold_development_project
for each row execute function public.guard_mold_project_actual_cost();

create or replace function public.seed_mold_project_milestones()
returns trigger
language plpgsql
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

drop trigger if exists trg_seed_mold_project_milestones on public.mold_development_project;
create trigger trg_seed_mold_project_milestones
after insert on public.mold_development_project
for each row execute function public.seed_mold_project_milestones();

create or replace function public.guard_mold_project_state()
returns trigger
language plpgsql
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

drop trigger if exists trg_guard_mold_project_state on public.mold_development_project;
create trigger trg_guard_mold_project_state
before insert or update of current_stage, status
on public.mold_development_project
for each row execute function public.guard_mold_project_state();

create or replace function public.current_mold_actor_id()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
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
    raise exception using errcode = '42501', message = '当前认证账号未关联启用的系统用户，不能执行模具开发流程';
  end if;

  return actor_id;
end;
$$;

revoke all on function public.current_mold_actor_id() from public;
revoke all on function public.current_mold_actor_id() from anon;
revoke all on function public.current_mold_actor_id() from authenticated;

create or replace function public.can_access_mold_development()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and exists (
      select 1
        from public.sys_user app_user
       where app_user.auth_user_id = auth.uid()
         and upper(coalesce(app_user.status::text, '')) in ('1', 'TRUE', 'ACTIVE', 'ENABLED')
    );
$$;

revoke all on function public.can_access_mold_development() from public;
revoke all on function public.can_access_mold_development() from anon;
grant execute on function public.can_access_mold_development() to authenticated;

create or replace function public.validate_mold_project_stage_gate(p_project_id bigint)
returns jsonb
language plpgsql
stable
as $$
declare
  project_row public.mold_development_project%rowtype;
  current_stage text;
  next_stage text;
  blockers jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
begin
  select * into project_row
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
set search_path = public, pg_temp
as $$
declare
  project_row public.mold_development_project%rowtype;
  gate_result jsonb;
  next_stage text;
  next_status text;
begin
  perform public.current_mold_actor_id();

  select * into project_row
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

  if next_stage is null then
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
         actual_due_date = case when next_stage = 'CLOSED' then coalesce(actual_due_date, current_date) else actual_due_date end
   where id = p_project_id;

  update public.mold_project_milestone
     set status = 'DONE', actual_date = coalesce(actual_date, current_date)
   where project_id = p_project_id and stage_code = project_row.current_stage;

  update public.mold_project_milestone
     set status = case when next_stage = 'CLOSED' then 'DONE' else 'IN_PROGRESS' end,
         actual_date = case when next_stage = 'CLOSED' then coalesce(actual_date, current_date) else actual_date end
   where project_id = p_project_id and stage_code = next_stage;

  return jsonb_build_object('projectId', p_project_id, 'previousStage', project_row.current_stage, 'nextStage', next_stage, 'status', next_status);
end;
$$;

create unique index if not exists uq_andon_mold_trial_source
on public.andon_event (source_type, source_id)
where source_type = 'MOLD_TRIAL';

create or replace function public.sync_mold_trial_andon()
returns trigger
language plpgsql
as $$
begin
  if upper(coalesce(new.status, '')) in ('REWORK', 'FAIL') then
    insert into public.andon_event (event_no, source_type, source_id, level, title, description, status, created_at, updated_at)
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
    do update set level = excluded.level, title = excluded.title, description = excluded.description, status = 'OPEN', closed_reason = null, updated_at = current_timestamp;
  elsif upper(coalesce(new.status, '')) = 'APPROVED_PRODUCTION' then
    update public.andon_event
       set status = 'CLOSED', closed_reason = coalesce(nullif(closed_reason, ''), '模具试模已通过量产放行'), updated_at = current_timestamp
     where source_type = 'MOLD_TRIAL' and source_id = new.id and status <> 'CLOSED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_mold_trial_andon on public.mold_trial_detail;
create trigger trg_sync_mold_trial_andon
after insert or update
on public.mold_trial_detail
for each row execute function public.sync_mold_trial_andon();

create or replace function public.guard_mold_revision_state()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if upper(coalesce(old.status, 'DRAFT')) <> 'DRAFT' then
      raise exception using errcode = '23514', message = '已提交或生效的模具版本不能删除';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if upper(coalesce(new.status, 'DRAFT')) <> 'DRAFT' or new.approved_by is not null or new.effective_at is not null then
      raise exception using errcode = '23514', message = '新版本必须以草稿状态创建';
    end if;
    return new;
  end if;

  if coalesce(current_setting('app.mold_revision_transition', true), '') <> 'allowed' then
    if new.status is distinct from old.status then
      raise exception using errcode = '23514', message = '版本状态必须通过提交或批准动作变更';
    end if;
    if new.approved_by is distinct from old.approved_by or new.effective_at is distinct from old.effective_at then
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

drop trigger if exists trg_guard_mold_revision_state on public.mold_revision;
create trigger trg_guard_mold_revision_state
before insert or update or delete on public.mold_revision
for each row execute function public.guard_mold_revision_state();

drop function if exists public.transition_mold_revision(bigint, text, bigint);

create or replace function public.transition_mold_revision(p_revision_id bigint, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  revision_row public.mold_revision%rowtype;
  normalized_action text := upper(coalesce(p_action, ''));
  actor_id bigint;
  next_status text;
begin
  actor_id := public.current_mold_actor_id();

  select * into revision_row
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

  return jsonb_build_object('revisionId', p_revision_id, 'previousStatus', revision_row.status, 'status', next_status);
end;
$$;

create or replace function public.validate_mold_trial_release()
returns trigger
language plpgsql
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

drop trigger if exists trg_validate_mold_trial_release on public.mold_trial_detail;
create trigger trg_validate_mold_trial_release
before insert or update
on public.mold_trial_detail
for each row execute function public.validate_mold_trial_release();

drop function if exists public.transition_mold_trial_issue(bigint, text, bigint, text);

create or replace function public.transition_mold_trial_issue(
  p_trial_id bigint,
  p_action text,
  p_evidence text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trial_row public.mold_trial_detail%rowtype;
  normalized_action text := upper(btrim(coalesce(p_action, '')));
  actor_id bigint;
  current_status text;
  next_status text;
begin
  actor_id := public.current_mold_actor_id();

  select * into trial_row
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
    if current_status = 'WAIT_RETEST' and upper(coalesce(trial_row.retest_result, 'PENDING')) <> 'FAIL' then
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
         issue_owner_id = case when normalized_action in ('START', 'REOPEN') then coalesce(issue_owner_id, actor_id) else issue_owner_id end,
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
set search_path = public, pg_temp
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

create or replace view public.mold_life_forecast as
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
    when coalesce(recent.recent_30d_shots, 0) > 0
      then round(greatest(coalesce(m.lifetime, 0) - coalesce(m.used_shots, 0), 0)::numeric / (recent.recent_30d_shots::numeric / 30), 1)
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
  select coalesce(sum(pr.shots), 0)::numeric as recent_30d_shots
  from public.prod_report pr
  where pr.mold_id = m.id
    and pr.created_at >= current_timestamp - interval '30 days'
) recent on true
where public.can_access_mold_development();

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

do $$
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
    policy_name := target_table || '_authenticated_access';
    execute format('alter table public.%I enable row level security', target_table);
    if not exists (
      select 1
        from pg_policies
       where schemaname = 'public'
         and tablename = target_table
         and policyname = policy_name
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.can_access_mold_development()) with check (public.can_access_mold_development())',
        policy_name,
        target_table
      );
    end if;
  end loop;
end;
$$;

revoke all on table
  public.mold_development_project,
  public.mold_project_milestone,
  public.mold_trial_detail,
  public.mold_revision,
  public.mold_attachment,
  public.mold_product,
  public.mold_component,
  public.mold_cost_record,
  public.mold_supplier_evaluation
from public, anon;

grant select, insert, update, delete on table
  public.mold_development_project,
  public.mold_project_milestone,
  public.mold_trial_detail,
  public.mold_revision,
  public.mold_attachment,
  public.mold_product,
  public.mold_component,
  public.mold_cost_record,
  public.mold_supplier_evaluation
to authenticated;

revoke all on public.mold_life_forecast from public, anon;
grant select on public.mold_life_forecast to authenticated;
revoke usage, select on all sequences in schema public from anon;
grant usage, select on all sequences in schema public to authenticated;
revoke all on function public.advance_mold_development_project(bigint) from public;
revoke all on function public.advance_mold_development_project(bigint) from anon;
grant execute on function public.advance_mold_development_project(bigint) to authenticated;
revoke all on function public.release_mold_trial(bigint) from public;
revoke all on function public.release_mold_trial(bigint) from anon;
grant execute on function public.release_mold_trial(bigint) to authenticated;
revoke all on function public.transition_mold_revision(bigint, text) from public;
revoke all on function public.transition_mold_revision(bigint, text) from anon;
grant execute on function public.transition_mold_revision(bigint, text) to authenticated;
revoke all on function public.validate_mold_project_stage_gate(bigint) from public;
revoke all on function public.validate_mold_project_stage_gate(bigint) from anon;
grant execute on function public.validate_mold_project_stage_gate(bigint) to authenticated;
revoke all on function public.transition_mold_trial_issue(bigint, text, text) from public;
revoke all on function public.transition_mold_trial_issue(bigint, text, text) from anon;
grant execute on function public.transition_mold_trial_issue(bigint, text, text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('erp-mold-development', 'erp-mold-development', false)
    on conflict (id) do update set public = false;
  end if;

  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists mold_development_files_insert on storage.objects';
    execute 'drop policy if exists mold_development_files_select on storage.objects';
    execute 'create policy mold_development_files_insert on storage.objects for insert to authenticated with check (bucket_id = ''erp-mold-development'' and (storage.foldername(name))[1] = ''mold-development'' and public.can_access_mold_development())';
    execute 'create policy mold_development_files_select on storage.objects for select to authenticated using (bucket_id = ''erp-mold-development'' and (storage.foldername(name))[1] = ''mold-development'' and public.can_access_mold_development())';
  end if;
end;
$$;
