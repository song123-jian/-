-- Desktop read synchronization only. Preserves existing accounts, quotes and write RPCs.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
 IF (SELECT value FROM public.pmu_settings WHERE key='multiuser_version') IS DISTINCT FROM '1.7.0'
 OR (SELECT value FROM public.pmu_settings WHERE key='quote_workflow_version') IS DISTINCT FROM '1.6.0'
 OR to_regprocedure('public.pmu_owner_id()') IS NULL THEN
  RAISE EXCEPTION '需要个人账号1.7.0、报价1.6.0及身份桥接';
 END IF;
 IF to_regclass('public.pmu_data_versions') IS NOT NULL
 OR to_regprocedure('public.pmu_sync_meta_v1()') IS NOT NULL
 OR to_regprocedure('public.pmu_mobile_snapshot_v1()') IS NOT NULL THEN
  RAISE EXCEPTION '同步结构已存在，禁止重复执行';
 END IF;
 IF has_schema_privilege('pmu_executor','public','CREATE') THEN
  RAISE EXCEPTION '执行角色权限与预期不同，停止升级';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles a ON a.oid=m.member
  JOIN pg_roles b ON b.oid=m.roleid JOIN pg_roles g ON g.oid=m.grantor
  WHERE a.rolname='postgres' AND b.rolname='pmu_executor' AND g.rolname='postgres') THEN
  RAISE EXCEPTION '存在自有角色授权，停止自动变更';
 END IF;
END $$;
CREATE TABLE public.pmu_data_versions(
 owner_id uuid PRIMARY KEY REFERENCES public.pmu_members(user_id),
 version bigint NOT NULL DEFAULT 0 CHECK(version>=0),
 changed_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.pmu_data_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_data_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pmu_data_versions FROM public,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.pmu_data_versions TO pmu_executor;
CREATE POLICY desktop_own_version ON public.pmu_data_versions TO pmu_executor
 USING(owner_id=public.pmu_owner_id() AND public.pmu_enabled())
 WITH CHECK(owner_id=public.pmu_owner_id() AND public.pmu_enabled());
INSERT INTO public.pmu_settings(key,value) VALUES('desktop_sync_schema_version','1');
INSERT INTO public.pmu_settings(key,value) VALUES('schema_epoch',gen_random_uuid()::text) ON CONFLICT DO NOTHING;

CREATE FUNCTION public.pmu_bump_desktop_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ DECLARE uid uuid; BEGIN
 uid:=CASE WHEN TG_OP='DELETE' THEN OLD.owner_id ELSE NEW.owner_id END;
 IF uid IS DISTINCT FROM public.pmu_owner_id() OR NOT public.pmu_enabled()
 OR (TG_OP='UPDATE' AND OLD.owner_id IS DISTINCT FROM NEW.owner_id) THEN
  RAISE EXCEPTION '同步触发器禁止跨账号修改' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.pmu_data_versions(owner_id,version) VALUES(uid,1)
 ON CONFLICT(owner_id) DO UPDATE SET version=pmu_data_versions.version+1,changed_at=now();
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER desktop_sync_quotes AFTER INSERT OR UPDATE OR DELETE ON public.pmu_quotes
 FOR EACH ROW EXECUTE FUNCTION public.pmu_bump_desktop_version();
CREATE TRIGGER desktop_sync_customers AFTER INSERT OR UPDATE OR DELETE ON public.pmu_customers
 FOR EACH ROW EXECUTE FUNCTION public.pmu_bump_desktop_version();

CREATE FUNCTION public.pmu_sync_meta_v1() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('owner_id',public.pmu_owner_id(),
  'data_version',coalesce((SELECT version FROM public.pmu_data_versions WHERE owner_id=public.pmu_owner_id()),0)::text,
  'schema_epoch',(SELECT value FROM public.pmu_settings WHERE key='schema_epoch'),
  'sync_schema_version','1','business_date',(now() AT TIME ZONE 'Asia/Shanghai')::date,'server_time',now());
END $$;
CREATE FUNCTION public.pmu_mobile_snapshot_v1() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ DECLARE result jsonb; BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 WITH day AS(SELECT (now() AT TIME ZONE 'Asia/Shanghai')::date AS cutoff),ranked AS(
  SELECT q.*,c.revision AS customer_revision,ROW_NUMBER() OVER chosen AS rn,
   count(*) OVER(PARTITION BY q.identity) AS history_count,
   sum(CASE WHEN effective_date>day.cutoff AND source_type NOT IN ('文件导入','图片导入','导入更新') THEN 1 ELSE 0 END)
    OVER(PARTITION BY q.identity) AS future_count,
   LEAD(price) OVER chosen AS previous_price,LEAD(effective_date) OVER chosen AS previous_date,
   LEAD(source_type) OVER chosen AS previous_source_type
  FROM public.pmu_quotes q JOIN public.pmu_customers c USING(owner_id,customer_key) CROSS JOIN day
  WHERE q.owner_id=public.pmu_owner_id() AND c.status='active'
  WINDOW chosen AS(PARTITION BY q.identity ORDER BY
   (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=day.cutoff) DESC,effective_date DESC,id DESC)),
 customers AS(SELECT c.*,count(q.id) AS records,count(DISTINCT q.identity) AS specs
  FROM public.pmu_customers c LEFT JOIN public.pmu_quotes q USING(owner_id,customer_key)
  WHERE c.owner_id=public.pmu_owner_id() AND c.status='active' GROUP BY c.owner_id,c.customer_key)
 SELECT jsonb_build_object('owner_id',public.pmu_owner_id(),
  'data_version',coalesce((SELECT version FROM public.pmu_data_versions WHERE owner_id=public.pmu_owner_id()),0)::text,
  'schema_epoch',(SELECT value FROM public.pmu_settings WHERE key='schema_epoch'),
  'business_date',(SELECT cutoff FROM day),'server_time',now(),
  'customers',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('revision',c.revision::text) ORDER BY display_name) FROM customers c),'[]'::jsonb),
  'quotes',coalesce((SELECT jsonb_agg((to_jsonb(r)-'rn')||jsonb_build_object('id',r.id::text,'customer_revision',r.customer_revision::text)
   ORDER BY customer,grade,color,tax_type) FROM ranked r WHERE rn=1),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
-- PG17's managed ADMIN membership has SET=false; borrow SET only inside this transaction.
GRANT pmu_executor TO postgres WITH INHERIT FALSE, SET TRUE;
GRANT CREATE ON SCHEMA public TO pmu_executor;
ALTER FUNCTION public.pmu_bump_desktop_version() OWNER TO pmu_executor;
ALTER FUNCTION public.pmu_sync_meta_v1() OWNER TO pmu_executor;
ALTER FUNCTION public.pmu_mobile_snapshot_v1() OWNER TO pmu_executor;
-- The managed postgres grant has INHERIT=false: execute ACL changes as the owner.
SET LOCAL ROLE pmu_executor;
REVOKE ALL ON FUNCTION public.pmu_bump_desktop_version(),public.pmu_sync_meta_v1(),public.pmu_mobile_snapshot_v1()
 FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pmu_sync_meta_v1(),public.pmu_mobile_snapshot_v1() TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM pmu_executor;
REVOKE pmu_executor FROM postgres GRANTED BY postgres;
COMMIT;
