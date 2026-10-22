-- 15 independent application accounts; original pm_ tables remain intact.
ROLLBACK;
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
  IF (SELECT value FROM public.pm_settings WHERE key='schema_version') IS DISTINCT FROM '2'
    OR (SELECT value FROM public.pm_settings WHERE key='quote_workflow_version') IS DISTINCT FROM '1.6.0' THEN
    RAISE EXCEPTION '需要现有schema2和报价1.6.0结构';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='pmu_executor') THEN
    CREATE ROLE pmu_executor NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE pmu_executor NOLOGIN NOBYPASSRLS;
GRANT pmu_executor TO postgres;
GRANT CREATE ON SCHEMA public TO pmu_executor;
CREATE TABLE public.pmu_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  username text UNIQUE NOT NULL CHECK(username ~ '^[a-z0-9_]{3,32}$'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pmu_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pmu_members FROM public,anon,authenticated;
GRANT SELECT ON public.pmu_members TO authenticated,pmu_executor;
GRANT ALL ON public.pmu_members TO service_role;
CREATE POLICY own_membership ON public.pmu_members FOR SELECT TO authenticated,pmu_executor USING(user_id=auth.uid());
CREATE FUNCTION public.pmu_limit_members() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('pmu:15-active-members',0));
  IF NEW.enabled AND (SELECT count(*) FROM public.pmu_members WHERE enabled AND user_id<>NEW.user_id)>=15 THEN
    RAISE EXCEPTION '最多启用15个程序账号' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pmu_limit_members() FROM public,anon,authenticated,service_role;
CREATE TRIGGER limit_members BEFORE INSERT OR UPDATE ON public.pmu_members FOR EACH ROW EXECUTE FUNCTION public.pmu_limit_members();
CREATE FUNCTION public.pmu_enabled() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ SELECT EXISTS(SELECT 1 FROM public.pmu_members WHERE user_id=auth.uid() AND enabled); $$;
REVOKE ALL ON FUNCTION public.pmu_enabled() FROM public,anon;
GRANT EXECUTE ON FUNCTION public.pmu_enabled() TO authenticated,pmu_executor,service_role;
GRANT USAGE ON SCHEMA public TO pmu_executor;
-- Supabase postgres cannot grant USAGE on the managed auth schema.
-- This fixed, argument-free helper exposes only the verified current UUID.
CREATE FUNCTION public.pmu_owner_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ SELECT auth.uid(); $$;
REVOKE ALL ON FUNCTION public.pmu_owner_id() FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pmu_owner_id() TO pmu_executor;

CREATE TABLE public.pmu_settings (LIKE public.pm_settings INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE public.pmu_settings ADD PRIMARY KEY(key);
INSERT INTO public.pmu_settings SELECT * FROM public.pm_settings;
INSERT INTO public.pmu_settings VALUES('multiuser_version','1.7.0'),('max_active_users','15'),('read_optimization_version','1.6.5') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
ALTER TABLE public.pmu_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pmu_settings FROM public,anon,authenticated;
GRANT SELECT ON public.pmu_settings TO authenticated,pmu_executor,service_role;
CREATE POLICY member_settings ON public.pmu_settings FOR SELECT TO authenticated,pmu_executor USING(public.pmu_enabled());

CREATE TABLE public.pmu_customers (LIKE public.pm_customers INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE public.pmu_customers ADD COLUMN owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.pmu_members(user_id);
ALTER TABLE public.pmu_customers ADD PRIMARY KEY(owner_id,customer_key);
CREATE TABLE public.pmu_quotes (LIKE public.pm_quotes INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING IDENTITY);
ALTER TABLE public.pmu_quotes ADD COLUMN owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.pmu_members(user_id);
ALTER TABLE public.pmu_quotes ADD PRIMARY KEY(id);
ALTER TABLE public.pmu_quotes ADD UNIQUE(owner_id,import_key);
ALTER TABLE public.pmu_quotes ADD FOREIGN KEY(owner_id,customer_key) REFERENCES public.pmu_customers(owner_id,customer_key);
CREATE INDEX pmu_quotes_identity_date ON public.pmu_quotes(owner_id,identity,effective_date DESC,id DESC);
CREATE INDEX pmu_quotes_customer ON public.pmu_quotes(owner_id,customer_key,identity,effective_date DESC,id DESC);
CREATE TABLE public.pmu_customer_audit (LIKE public.pm_customer_audit INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE public.pmu_customer_audit ADD COLUMN owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.pmu_members(user_id);
ALTER TABLE public.pmu_customer_audit ADD PRIMARY KEY(owner_id,request_id);
ALTER TABLE public.pmu_customer_audit ADD FOREIGN KEY(owner_id,customer_key) REFERENCES public.pmu_customers(owner_id,customer_key);
ALTER TABLE public.pmu_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_customers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pmu_customers FROM public,anon,authenticated,service_role;
GRANT SELECT ON public.pmu_customers TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.pmu_customers TO pmu_executor;
CREATE POLICY own_data ON public.pmu_customers TO authenticated,pmu_executor
USING(owner_id=auth.uid() AND public.pmu_enabled())
WITH CHECK(owner_id=auth.uid() AND public.pmu_enabled());
ALTER TABLE public.pmu_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_quotes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pmu_quotes FROM public,anon,authenticated,service_role;
GRANT SELECT ON public.pmu_quotes TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.pmu_quotes TO pmu_executor;
CREATE POLICY own_data ON public.pmu_quotes TO authenticated,pmu_executor
USING(owner_id=auth.uid() AND public.pmu_enabled())
WITH CHECK(owner_id=auth.uid() AND public.pmu_enabled());
ALTER TABLE public.pmu_customer_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_customer_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pmu_customer_audit FROM public,anon,authenticated,service_role;
GRANT SELECT ON public.pmu_customer_audit TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.pmu_customer_audit TO pmu_executor;
CREATE POLICY own_data ON public.pmu_customer_audit TO authenticated,pmu_executor
USING(owner_id=auth.uid() AND public.pmu_enabled())
WITH CHECK(owner_id=auth.uid() AND public.pmu_enabled());
GRANT USAGE,SELECT ON SEQUENCE public.pmu_quotes_id_seq TO pmu_executor,service_role;

CREATE OR REPLACE FUNCTION public.pmu_require_customer(r jsonb, expected bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.pmu_customers%rowtype; k text := r->>'customer_key';
BEGIN
  IF k IS NULL OR k !~ '^[a-f0-9]{64}$' OR expected IS NULL OR expected<0 THEN
    RAISE EXCEPTION '缺少客户版本，请升级程序并重新预览' USING errcode='22023';
  END IF;
  INSERT INTO public.pmu_customers(customer_key,display_name) VALUES(k,r->>'customer') ON CONFLICT DO NOTHING;
  SELECT * INTO c FROM public.pmu_customers WHERE customer_key=k;
  IF c.status<>'active' THEN
    RAISE EXCEPTION '客户已在回收站，请先恢复客户' USING errcode='22023';
  END IF;
  IF c.revision<>expected THEN
    RAISE EXCEPTION '客户或报价已变化，请重新打开表单或重新预览' USING errcode='P0001';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pmu_add_quote(p_record jsonb,p_base_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.pmu_quotes%rowtype; has_prior boolean; new_id bigint;
  day_now date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('customer:'||(p_record->>'customer_key'),hashtextextended(public.pmu_owner_id()::text,0)));
  PERFORM public.pmu_require_customer(p_record,(p_record->>'customer_revision')::bigint);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_record->>'identity',hashtextextended(public.pmu_owner_id()::text,0)));
  SELECT * INTO prior FROM public.pmu_quotes WHERE identity=p_record->>'identity'
    ORDER BY (effective_date<=day_now) DESC,effective_date DESC,id DESC LIMIT 1;
  has_prior := found;
  IF p_base_id IS NOT NULL THEN
    IF NOT has_prior OR prior.id<>p_base_id THEN
      RAISE EXCEPTION '该报价已变化，请刷新后再操作' USING errcode='P0001';
    END IF;
    IF length(trim(coalesce(p_record->>'reason','')))=0 THEN
      RAISE EXCEPTION '请填写调价或补录原因' USING errcode='22023';
    END IF;
    IF prior.price=p_record->>'price' AND prior.effective_date=(p_record->>'effective_date')::date
      AND prior.material=coalesce(p_record->>'material','') AND prior.note=coalesce(p_record->>'note','') THEN
      RETURN jsonb_build_object('added',false,'id',prior.id,'message','价格、日期和备注均未变化，无需重复保存');
    END IF;
  ELSIF has_prior THEN
    RAISE EXCEPTION '该客户牌号已有报价，请从查询结果中更新价格' USING errcode='P0001';
  END IF;
  INSERT INTO public.pmu_quotes(identity,customer,grade,material,color,price,tax_type,effective_date,note,reason,source_file,source_sheet,source_row,source_type,customer_key)
    VALUES(p_record->>'identity',p_record->>'customer',p_record->>'grade',coalesce(p_record->>'material',''),
      coalesce(p_record->>'color',''),p_record->>'price',p_record->>'tax_type',(p_record->>'effective_date')::date,
      coalesce(p_record->>'note',''),coalesce(p_record->>'reason',''),'','',0,'手工录入',p_record->>'customer_key') RETURNING id INTO new_id;
  UPDATE public.pmu_customers SET revision=revision+1 WHERE customer_key=p_record->>'customer_key';
  RETURN jsonb_build_object('added',true,'id',new_id,'message','已保存云端新报价，原有历史完整保留');
END $$;

CREATE OR REPLACE FUNCTION public.pmu_import_quotes(p_records jsonb,p_customer_revisions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb; k text; expected bigint; c public.pmu_customers%rowtype;
  written integer; added integer := 0; skipped integer := 0;
BEGIN
  IF jsonb_typeof(p_records) IS DISTINCT FROM 'array' OR jsonb_array_length(p_records)>20000
    OR jsonb_typeof(p_customer_revisions) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION '导入参数无效，一次最多20000条报价' USING errcode='22023';
  END IF;
  -- Acquire all customer locks in fixed order before ANY identity locks.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_records) e WHERE NOT p_customer_revisions ? (e->>'customer_key')) THEN
    RAISE EXCEPTION '缺少客户版本，请重新预览' USING errcode='22023';
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_customer_revisions) ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('customer:'||k,hashtextextended(public.pmu_owner_id()::text,0)));
    SELECT value INTO r FROM jsonb_array_elements(p_records) WHERE value->>'customer_key'=k LIMIT 1;
    expected := (p_customer_revisions->>k)::bigint;
    IF NOT found THEN
      SELECT * INTO c FROM public.pmu_customers WHERE customer_key=k;
      IF NOT found THEN RAISE EXCEPTION '客户不存在，请重新预览' USING errcode='22023'; END IF;
      r:=jsonb_build_object('customer_key',k,'customer',c.display_name);
      IF jsonb_array_length(p_records)=0 AND NOT EXISTS(SELECT 1 FROM public.pmu_customer_audit WHERE customer_key=k AND revision>expected) THEN
        expected:=c.revision;
      END IF;
    END IF;
    PERFORM public.pmu_require_customer(r,expected);
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(p_records) WITH ORDINALITY e(value,ordinality)
      ORDER BY value->>'identity',ordinality LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(r->>'identity',hashtextextended(public.pmu_owner_id()::text,0)));
    INSERT INTO public.pmu_quotes(identity,customer,grade,material,color,price,tax_type,effective_date,note,reason,source_file,source_sheet,source_row,source_type,import_key,customer_key)
      VALUES(r->>'identity',r->>'customer',r->>'grade',coalesce(r->>'material',''),coalesce(r->>'color',''),
        r->>'price',r->>'tax_type',(r->>'effective_date')::date,coalesce(r->>'note',''),coalesce(r->>'reason',''),
        coalesce(r->>'source_file',''),coalesce(r->>'source_sheet',''),coalesce((r->>'source_row')::integer,0),'文件导入',r->>'import_key',r->>'customer_key')
      ON CONFLICT(owner_id,import_key) DO NOTHING;
    GET DIAGNOSTICS written = ROW_COUNT;
    IF written=1 THEN
      added:=added+1;
      UPDATE public.pmu_customers SET revision=revision+1 WHERE customer_key=r->>'customer_key';
    ELSE skipped:=skipped+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('added',added,'skipped',skipped);
END $$;

CREATE OR REPLACE FUNCTION public.pmu_import_quotes(p_records jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION '请升级程序，导入需要客户版本校验' USING errcode='22023'; END $$;

CREATE OR REPLACE FUNCTION public.pmu_change_customer(p_customer_key text,p_action text,p_expected_revision bigint,p_request_id text,p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.pmu_customers%rowtype; a public.pmu_customer_audit%rowtype;
  new_status text; timestamp text := to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD"T"HH24:MI:SS"+08:00"');
BEGIN
  IF p_action NOT IN ('delete','restore') OR p_action IS NULL OR p_customer_key IS NULL OR p_customer_key !~ '^[a-f0-9]{64}$'
    OR p_request_id IS NULL OR p_request_id !~ '^[a-zA-Z0-9_-]{16,100}$' OR p_reason IS NULL OR length(p_reason)>1000 THEN
    RAISE EXCEPTION '客户操作参数无效' USING errcode='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('request:'||p_request_id,hashtextextended(public.pmu_owner_id()::text,0)));
  PERFORM pg_advisory_xact_lock(hashtextextended('customer:'||p_customer_key,hashtextextended(public.pmu_owner_id()::text,0)));
  SELECT * INTO a FROM public.pmu_customer_audit WHERE request_id=p_request_id;
  IF found THEN
    IF (a.customer_key,a.action,a.expected_revision,a.reason) IS DISTINCT FROM (p_customer_key,p_action,p_expected_revision,p_reason) THEN
      RAISE EXCEPTION '请求编号被用于其他操作，请重新预览' USING errcode='P0001';
    END IF;
    RETURN to_jsonb(a);
  END IF;
  new_status := CASE WHEN p_action='delete' THEN 'deleted' ELSE 'active' END;
  SELECT * INTO c FROM public.pmu_customers WHERE customer_key=p_customer_key;
  IF NOT found OR c.revision IS DISTINCT FROM p_expected_revision OR c.status=new_status THEN
    RAISE EXCEPTION '客户状态或报价已变化，请重新预览后操作' USING errcode='P0001';
  END IF;
  UPDATE public.pmu_customers SET status=new_status,revision=revision+1,
    deleted_at=CASE WHEN p_action='delete' THEN timestamp ELSE NULL END,
    deleted_reason=CASE WHEN p_action='delete' THEN p_reason ELSE '' END WHERE customer_key=p_customer_key;
  INSERT INTO public.pmu_customer_audit VALUES(p_request_id,p_customer_key,p_action,p_expected_revision,c.revision+1,p_reason,timestamp) RETURNING * INTO a;
  RETURN to_jsonb(a);
END $$;

CREATE OR REPLACE FUNCTION public.pmu_active_quotes()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('customer_revision',c.revision) ORDER BY q.effective_date DESC,q.id DESC),'[]'::jsonb)
  FROM public.pmu_quotes q JOIN public.pmu_customers c USING(customer_key) WHERE c.status='active';
$$;

CREATE OR REPLACE FUNCTION public.pmu_customer_states()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.customer_key),'[]'::jsonb) FROM public.pmu_customers c;
$$;

CREATE OR REPLACE FUNCTION public.pmu_export_snapshot()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object('schema_version',2,
    'quotes',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id),'[]'::jsonb) FROM public.pmu_quotes q),
    'customers',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.customer_key),'[]'::jsonb) FROM public.pmu_customers c),
    'audit',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.request_id),'[]'::jsonb) FROM public.pmu_customer_audit a));
$$;

CREATE OR REPLACE FUNCTION public.pmu_save_quote_v160(p_record jsonb,p_base_id bigint DEFAULT NULL,p_history_keys jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.pmu_quotes%rowtype; base public.pmu_quotes%rowtype; saved public.pmu_quotes%rowtype;
  has_prior boolean; new_id bigint; old_group text; new_group text := p_record->>'identity';
  k jsonb; revision_now bigint; did_add boolean := false; write_source text;
  day_now date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('customer:'||(p_record->>'customer_key'),hashtextextended(public.pmu_owner_id()::text,0)));
  PERFORM public.pmu_require_customer(p_record,(p_record->>'customer_revision')::bigint);
  IF p_history_keys IS NOT NULL THEN
    SELECT * INTO base FROM public.pmu_quotes WHERE id=p_base_id;
    IF NOT found OR base.customer_key<>p_record->>'customer_key'
      OR base.customer<>p_record->>'customer' OR base.grade<>p_record->>'grade' THEN
      RAISE EXCEPTION '报价基准已变化，请刷新后重新打开' USING errcode='P0001';
    END IF;
    old_group:=base.identity;
    IF old_group=new_group OR new_group IS NULL OR new_group !~ '^[a-f0-9]{64}$'
      OR (base.color<>'' AND base.color IS DISTINCT FROM p_record->>'color')
      OR (base.tax_type<>'未注明' AND base.tax_type IS DISTINCT FROM p_record->>'tax_type')
      OR (p_record->>'color') IS NULL OR (p_record->>'tax_type') NOT IN ('含税','未税','未注明') THEN
      RAISE EXCEPTION '仅能补齐原来空白的颜色或未注明税口径' USING errcode='22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(least(old_group,new_group),hashtextextended(public.pmu_owner_id()::text,0)));
    PERFORM pg_advisory_xact_lock(hashtextextended(greatest(old_group,new_group),hashtextextended(public.pmu_owner_id()::text,0)));
    SELECT * INTO prior FROM public.pmu_quotes WHERE identity=old_group
      ORDER BY (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=day_now) DESC,effective_date DESC,id DESC LIMIT 1;
    IF prior.id IS DISTINCT FROM p_base_id OR EXISTS(SELECT 1 FROM public.pmu_quotes WHERE identity=new_group) THEN
      RAISE EXCEPTION '报价已变化或目标颜色和税口径已有报价，请刷新后核对' USING errcode='P0001';
    END IF;
    IF jsonb_typeof(p_history_keys) IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_history_keys)<>(SELECT count(*) FROM public.pmu_quotes WHERE identity=old_group)
      OR EXISTS(SELECT 1 FROM public.pmu_quotes q WHERE identity=old_group AND NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(p_history_keys) e WHERE (e->>'id')::bigint=q.id))
      OR EXISTS(SELECT 1 FROM public.pmu_quotes q JOIN jsonb_array_elements(p_history_keys) e ON (e->>'id')::bigint=q.id
        WHERE q.identity=old_group AND (q.import_key IS NULL) IS DISTINCT FROM ((e->>'import_key') IS NULL))
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_history_keys) e GROUP BY e->>'id' HAVING count(*)<>1) THEN
      RAISE EXCEPTION '历史记录已变化，请重新打开补填窗口' USING errcode='P0001';
    END IF;
    FOR k IN SELECT value FROM jsonb_array_elements(p_history_keys) LOOP
      IF (k->>'import_key') IS NOT NULL AND (k->>'import_key') !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION '导入指纹无效' USING errcode='22023';
      END IF;
      UPDATE public.pmu_quotes SET identity=new_group,color=p_record->>'color',tax_type=p_record->>'tax_type',
        import_key=k->>'import_key' WHERE id=(k->>'id')::bigint AND identity=old_group;
    END LOOP;
    UPDATE public.pmu_customers SET revision=revision+1 WHERE customer_key=p_record->>'customer_key';
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(new_group,hashtextextended(public.pmu_owner_id()::text,0)));
  END IF;
  SELECT * INTO prior FROM public.pmu_quotes WHERE identity=new_group
    ORDER BY (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=day_now) DESC,effective_date DESC,id DESC LIMIT 1;
  has_prior:=found;
  IF p_base_id IS NOT NULL THEN
    IF NOT has_prior OR prior.id<>p_base_id THEN
      RAISE EXCEPTION '该报价已变化，请刷新后再操作' USING errcode='P0001';
    END IF;
    IF length(trim(coalesce(p_record->>'reason','')))=0 THEN
      RAISE EXCEPTION '请填写调价或补录原因' USING errcode='22023';
    END IF;
  ELSIF has_prior THEN
    RAISE EXCEPTION '该客户牌号已有报价，请从查询结果中更新价格' USING errcode='P0001';
  END IF;
  IF NOT has_prior OR prior.price IS DISTINCT FROM p_record->>'price'
    OR prior.effective_date IS DISTINCT FROM (p_record->>'effective_date')::date
    OR prior.material IS DISTINCT FROM coalesce(p_record->>'material','')
    OR prior.note IS DISTINCT FROM coalesce(p_record->>'note','') THEN
    write_source:=CASE WHEN coalesce((p_record->>'import_immediate')::boolean,false) THEN '图片导入'
      WHEN prior.source_type IN ('文件导入','图片导入','导入更新') THEN '导入更新' ELSE '手工录入' END;
    INSERT INTO public.pmu_quotes(identity,customer,grade,material,color,price,tax_type,effective_date,note,reason,source_file,source_sheet,source_row,source_type,customer_key)
      VALUES(new_group,p_record->>'customer',p_record->>'grade',coalesce(p_record->>'material',''),coalesce(p_record->>'color',''),
        p_record->>'price',p_record->>'tax_type',(p_record->>'effective_date')::date,coalesce(p_record->>'note',''),
        coalesce(p_record->>'reason',''),CASE WHEN write_source='图片导入' THEN coalesce(p_record->>'source_file','') ELSE '' END,
        CASE WHEN write_source='图片导入' THEN coalesce(p_record->>'source_sheet','') ELSE '' END,
        CASE WHEN write_source='图片导入' THEN coalesce((p_record->>'source_row')::integer,0) ELSE 0 END,write_source,p_record->>'customer_key') RETURNING id INTO new_id;
    UPDATE public.pmu_customers SET revision=revision+1 WHERE customer_key=p_record->>'customer_key';
    did_add:=true;
  ELSE new_id:=prior.id; END IF;
  SELECT * INTO saved FROM public.pmu_quotes WHERE identity=new_group
    ORDER BY (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=day_now) DESC,effective_date DESC,id DESC LIMIT 1;
  SELECT revision INTO revision_now FROM public.pmu_customers WHERE customer_key=p_record->>'customer_key';
  RETURN jsonb_build_object('added',did_add,'id',new_id,
    'record',to_jsonb(saved)||jsonb_build_object('customer_revision',revision_now),
    'message',CASE WHEN p_history_keys IS NOT NULL THEN '已补齐缺失字段，历史价格和日期保留'
      WHEN did_add THEN '已保存新报价，原有历史完整保留' ELSE '报价内容未变化，无需重复保存' END);
END $$;

CREATE OR REPLACE FUNCTION public.pmu_add_quote(p_record jsonb,p_base_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.pmu_save_quote_v160(p_record,p_base_id,NULL);
$$;

CREATE OR REPLACE FUNCTION public.pmu_current_quotes_v165(p_today date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_today IS NULL OR p_today NOT BETWEEN DATE '1900-01-01' AND DATE '2200-12-31' THEN
    RAISE EXCEPTION '查询日期无效' USING ERRCODE='22023';
  END IF;
  RETURN (
    WITH ranked AS (
      SELECT q.*, c.revision AS customer_revision, ROW_NUMBER() OVER chosen AS rn,
        COUNT(*) OVER (PARTITION BY identity) AS history_count,
        SUM(CASE WHEN effective_date>p_today AND source_type NOT IN ('文件导入','图片导入','导入更新') THEN 1 ELSE 0 END)
          OVER (PARTITION BY identity) AS future_count,
        LEAD(price) OVER chosen AS previous_price,
        LEAD(effective_date) OVER chosen AS previous_date,
        LEAD(source_type) OVER chosen AS previous_source_type
      FROM public.pmu_quotes q JOIN public.pmu_customers c USING(customer_key) WHERE c.status='active'
      WINDOW chosen AS (PARTITION BY identity ORDER BY
        (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=p_today) DESC,effective_date DESC,id DESC)
    )
    SELECT coalesce(jsonb_agg(to_jsonb(r)-'rn' ORDER BY customer,grade,color,tax_type),'[]'::jsonb)
    FROM ranked r WHERE rn=1
  );
END $$;

CREATE OR REPLACE FUNCTION public.pmu_customer_summaries_v165(p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('active','deleted') THEN
    RAISE EXCEPTION '客户状态无效' USING ERRCODE='22023';
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY display_name),'[]'::jsonb) FROM (
      SELECT c.*,count(DISTINCT q.identity) AS specs,count(q.id) AS records
      FROM public.pmu_customers c LEFT JOIN public.pmu_quotes q USING(customer_key)
      WHERE c.status=p_status GROUP BY c.owner_id,c.customer_key
    ) r
  );
END $$;

CREATE OR REPLACE FUNCTION public.pmu_customer_details_v165(p_customer_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF p_customer_key IS NULL OR p_customer_key !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION '客户编号无效' USING ERRCODE='22023';
  END IF;
  SELECT to_jsonb(c)||jsonb_build_object(
    'items',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY effective_date DESC,id DESC)
                     FROM public.pmu_quotes q WHERE q.customer_key=p_customer_key),'[]'::jsonb),
    'specs',(SELECT count(DISTINCT identity) FROM public.pmu_quotes WHERE customer_key=p_customer_key),
    'records',(SELECT count(*) FROM public.pmu_quotes WHERE customer_key=p_customer_key),
    'future_records',(SELECT count(*) FROM public.pmu_quotes WHERE customer_key=p_customer_key
                      AND effective_date>(now() AT TIME ZONE 'Asia/Shanghai')::date)
  ) INTO result FROM public.pmu_customers c WHERE c.customer_key=p_customer_key;
  IF result IS NULL THEN
    RAISE EXCEPTION '客户不存在，请刷新客户目录' USING ERRCODE='22023';
  END IF;
  RETURN result;
END $$;

DO $$ DECLARE f record; sql text; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname LIKE 'pmu_%' AND p.proname NOT IN ('pmu_enabled','pmu_limit_members','pmu_owner_id') LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO pmu_executor',f.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public,anon,authenticated,service_role',f.signature);
    IF f.proname<>'pmu_require_customer' AND f.signature::text<>'pmu_import_quotes(jsonb)' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
    END IF;
  END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM pmu_executor;
REVOKE pmu_executor FROM postgres;
COMMIT;
SELECT '1.7.0' AS multiuser_version,15 AS max_active_users;
