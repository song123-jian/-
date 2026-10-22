-- Schema 2 customer lifecycle. Wrap in BEGIN/COMMIT (or ROLLBACK for rehearsal).
-- Existing schema 1 needs pm_customer_migration_map populated by Python customer_key.
CREATE TABLE IF NOT EXISTS public.pm_customers (
  customer_key text PRIMARY KEY CHECK(customer_key ~ '^[a-f0-9]{64}$'),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleted')),
  revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
  deleted_at text,
  deleted_reason text NOT NULL DEFAULT '' CHECK(length(deleted_reason)<=1000)
);
CREATE TABLE IF NOT EXISTS public.pm_customer_audit (
  request_id text PRIMARY KEY CHECK(request_id ~ '^[a-zA-Z0-9_-]{16,100}$'),
  customer_key text NOT NULL REFERENCES public.pm_customers(customer_key),
  action text NOT NULL CHECK(action IN ('delete','restore')),
  expected_revision bigint NOT NULL,
  revision bigint NOT NULL,
  reason text NOT NULL,
  created_at text NOT NULL
);
LOCK TABLE public.pm_quotes IN ACCESS EXCLUSIVE MODE;
ALTER TABLE public.pm_quotes ADD COLUMN IF NOT EXISTS customer_key text;
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.pm_quotes WHERE customer_key IS NULL) THEN
    IF EXISTS(SELECT 1 FROM public.pm_quotes q LEFT JOIN pm_customer_migration_map m USING(customer) WHERE m.customer_key IS NULL) THEN
      RAISE EXCEPTION '客户映射不完整，请重新生成迁移文件' USING errcode='22023';
    END IF;
    INSERT INTO public.pm_customers(customer_key,display_name,revision)
      SELECT m.customer_key,min(q.customer),count(*) FROM public.pm_quotes q JOIN pm_customer_migration_map m USING(customer)
      GROUP BY m.customer_key ON CONFLICT(customer_key) DO NOTHING;
    UPDATE public.pm_quotes q SET customer_key=m.customer_key FROM pm_customer_migration_map m
      WHERE q.customer=m.customer AND q.customer_key IS NULL;
  END IF;
END $$;
ALTER TABLE public.pm_quotes ALTER COLUMN customer_key SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='pm_quotes_customer_key_fkey' AND conrelid='public.pm_quotes'::regclass) THEN
    ALTER TABLE public.pm_quotes ADD CONSTRAINT pm_quotes_customer_key_fkey FOREIGN KEY(customer_key) REFERENCES public.pm_customers(customer_key);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS pm_quotes_customer_idx ON public.pm_quotes(customer_key,identity,effective_date DESC,id DESC);
ALTER TABLE public.pm_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_customer_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pm_customers,public.pm_customer_audit FROM public,anon,authenticated,service_role;
GRANT SELECT ON public.pm_customers,public.pm_customer_audit TO service_role;
-- Lifecycle checks must govern every quote write, including older clients.
REVOKE INSERT ON public.pm_quotes FROM service_role;

CREATE OR REPLACE FUNCTION public.pm_require_customer(r jsonb, expected bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.pm_customers%rowtype; k text := r->>'customer_key';
BEGIN
  IF k IS NULL OR k !~ '^[a-f0-9]{64}$' OR expected IS NULL OR expected<0 THEN
    RAISE EXCEPTION '缺少客户版本，请升级程序并重新预览' USING errcode='22023';
  END IF;
  INSERT INTO public.pm_customers(customer_key,display_name) VALUES(k,r->>'customer') ON CONFLICT DO NOTHING;
  SELECT * INTO c FROM public.pm_customers WHERE customer_key=k;
  IF c.status<>'active' THEN
    RAISE EXCEPTION '客户已在回收站，请先恢复客户' USING errcode='22023';
  END IF;
  IF c.revision<>expected THEN
    RAISE EXCEPTION '客户或报价已变化，请重新打开表单或重新预览' USING errcode='P0001';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pm_add_quote(p_record jsonb,p_base_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.pm_quotes%rowtype; has_prior boolean; new_id bigint;
  day_now date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('customer:'||(p_record->>'customer_key'),0));
  PERFORM public.pm_require_customer(p_record,(p_record->>'customer_revision')::bigint);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_record->>'identity',0));
  SELECT * INTO prior FROM public.pm_quotes WHERE identity=p_record->>'identity'
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
  INSERT INTO public.pm_quotes(identity,customer,grade,material,color,price,tax_type,effective_date,note,reason,source_file,source_sheet,source_row,source_type,customer_key)
    VALUES(p_record->>'identity',p_record->>'customer',p_record->>'grade',coalesce(p_record->>'material',''),
      coalesce(p_record->>'color',''),p_record->>'price',p_record->>'tax_type',(p_record->>'effective_date')::date,
      coalesce(p_record->>'note',''),coalesce(p_record->>'reason',''),'','',0,'手工录入',p_record->>'customer_key') RETURNING id INTO new_id;
  UPDATE public.pm_customers SET revision=revision+1 WHERE customer_key=p_record->>'customer_key';
  RETURN jsonb_build_object('added',true,'id',new_id,'message','已保存云端新报价，原有历史完整保留');
END $$;

CREATE OR REPLACE FUNCTION public.pm_import_quotes(p_records jsonb,p_customer_revisions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb; k text; expected bigint; c public.pm_customers%rowtype;
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
    PERFORM pg_advisory_xact_lock(hashtextextended('customer:'||k,0));
    SELECT value INTO r FROM jsonb_array_elements(p_records) WHERE value->>'customer_key'=k LIMIT 1;
    expected := (p_customer_revisions->>k)::bigint;
    IF NOT found THEN
      SELECT * INTO c FROM public.pm_customers WHERE customer_key=k;
      IF NOT found THEN RAISE EXCEPTION '客户不存在，请重新预览' USING errcode='22023'; END IF;
      r:=jsonb_build_object('customer_key',k,'customer',c.display_name);
      IF jsonb_array_length(p_records)=0 AND NOT EXISTS(SELECT 1 FROM public.pm_customer_audit WHERE customer_key=k AND revision>expected) THEN
        expected:=c.revision;
      END IF;
    END IF;
    PERFORM public.pm_require_customer(r,expected);
  END LOOP;
  FOR r IN SELECT value FROM jsonb_array_elements(p_records) WITH ORDINALITY e(value,ordinality)
      ORDER BY value->>'identity',ordinality LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(r->>'identity',0));
    INSERT INTO public.pm_quotes(identity,customer,grade,material,color,price,tax_type,effective_date,note,reason,source_file,source_sheet,source_row,source_type,import_key,customer_key)
      VALUES(r->>'identity',r->>'customer',r->>'grade',coalesce(r->>'material',''),coalesce(r->>'color',''),
        r->>'price',r->>'tax_type',(r->>'effective_date')::date,coalesce(r->>'note',''),coalesce(r->>'reason',''),
        coalesce(r->>'source_file',''),coalesce(r->>'source_sheet',''),coalesce((r->>'source_row')::integer,0),'文件导入',r->>'import_key',r->>'customer_key')
      ON CONFLICT(import_key) DO NOTHING;
    GET DIAGNOSTICS written = ROW_COUNT;
    IF written=1 THEN
      added:=added+1;
      UPDATE public.pm_customers SET revision=revision+1 WHERE customer_key=r->>'customer_key';
    ELSE skipped:=skipped+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('added',added,'skipped',skipped);
END $$;
CREATE OR REPLACE FUNCTION public.pm_import_quotes(p_records jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION '请升级程序，导入需要客户版本校验' USING errcode='22023'; END $$;

CREATE OR REPLACE FUNCTION public.pm_change_customer(p_customer_key text,p_action text,p_expected_revision bigint,p_request_id text,p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.pm_customers%rowtype; a public.pm_customer_audit%rowtype;
  new_status text; timestamp text := to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD"T"HH24:MI:SS"+08:00"');
BEGIN
  IF p_action NOT IN ('delete','restore') OR p_action IS NULL OR p_customer_key IS NULL OR p_customer_key !~ '^[a-f0-9]{64}$'
    OR p_request_id IS NULL OR p_request_id !~ '^[a-zA-Z0-9_-]{16,100}$' OR p_reason IS NULL OR length(p_reason)>1000 THEN
    RAISE EXCEPTION '客户操作参数无效' USING errcode='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('request:'||p_request_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('customer:'||p_customer_key,0));
  SELECT * INTO a FROM public.pm_customer_audit WHERE request_id=p_request_id;
  IF found THEN
    IF (a.customer_key,a.action,a.expected_revision,a.reason) IS DISTINCT FROM (p_customer_key,p_action,p_expected_revision,p_reason) THEN
      RAISE EXCEPTION '请求编号被用于其他操作，请重新预览' USING errcode='P0001';
    END IF;
    RETURN to_jsonb(a);
  END IF;
  new_status := CASE WHEN p_action='delete' THEN 'deleted' ELSE 'active' END;
  SELECT * INTO c FROM public.pm_customers WHERE customer_key=p_customer_key;
  IF NOT found OR c.revision IS DISTINCT FROM p_expected_revision OR c.status=new_status THEN
    RAISE EXCEPTION '客户状态或报价已变化，请重新预览后操作' USING errcode='P0001';
  END IF;
  UPDATE public.pm_customers SET status=new_status,revision=revision+1,
    deleted_at=CASE WHEN p_action='delete' THEN timestamp ELSE NULL END,
    deleted_reason=CASE WHEN p_action='delete' THEN p_reason ELSE '' END WHERE customer_key=p_customer_key;
  INSERT INTO public.pm_customer_audit VALUES(p_request_id,p_customer_key,p_action,p_expected_revision,c.revision+1,p_reason,timestamp) RETURNING * INTO a;
  RETURN to_jsonb(a);
END $$;

CREATE OR REPLACE FUNCTION public.pm_active_quotes()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('customer_revision',c.revision) ORDER BY q.effective_date DESC,q.id DESC),'[]'::jsonb)
  FROM public.pm_quotes q JOIN public.pm_customers c USING(customer_key) WHERE c.status='active';
$$;
CREATE OR REPLACE FUNCTION public.pm_customer_states()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.customer_key),'[]'::jsonb) FROM public.pm_customers c;
$$;
CREATE OR REPLACE FUNCTION public.pm_export_snapshot()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object('schema_version',2,
    'quotes',(SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id),'[]'::jsonb) FROM public.pm_quotes q),
    'customers',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.customer_key),'[]'::jsonb) FROM public.pm_customers c),
    'audit',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.request_id),'[]'::jsonb) FROM public.pm_customer_audit a));
$$;

REVOKE ALL ON FUNCTION public.pm_require_customer(jsonb,bigint) FROM public,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pm_add_quote(jsonb,bigint),public.pm_import_quotes(jsonb),public.pm_import_quotes(jsonb,jsonb),
  public.pm_change_customer(text,text,bigint,text,text),public.pm_active_quotes(),public.pm_customer_states(),public.pm_export_snapshot()
  FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pm_add_quote(jsonb,bigint),public.pm_import_quotes(jsonb,jsonb),
  public.pm_change_customer(text,text,bigint,text,text),public.pm_active_quotes(),public.pm_customer_states(),public.pm_export_snapshot() TO service_role;
INSERT INTO public.pm_settings VALUES('schema_version','2') ON CONFLICT(key) DO UPDATE SET value='2';
