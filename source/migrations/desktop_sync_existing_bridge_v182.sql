-- Extend an existing mobile sync installation without replacing its RPCs or triggers.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
 IF to_regclass('public.pmu_data_versions') IS NULL
 OR to_regprocedure('public.pmu_sync_meta_v1()') IS NULL
 OR to_regprocedure('public.pmu_bump_version()') IS NULL
 OR to_regprocedure('public.pmu_owner_id()') IS NULL
 OR to_regprocedure('public.pmu_enabled()') IS NULL
 OR (SELECT value FROM public.pmu_settings WHERE key='multiuser_version') IS DISTINCT FROM '1.7.0'
 OR (SELECT value FROM public.pmu_settings WHERE key='quote_workflow_version') IS DISTINCT FROM '1.6.0'
 OR NOT EXISTS(SELECT 1 FROM public.pmu_settings WHERE key='schema_epoch') THEN
  RAISE EXCEPTION '现有账号和同步结构不完整，停止桥接';
 END IF;
 IF to_regprocedure('public.pmu_bump_desktop_version()') IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.pmu_settings WHERE key='desktop_sync_schema_version')
 OR has_schema_privilege('pmu_executor','public','CREATE') THEN
  RAISE EXCEPTION '桥接对象已存在或角色权限异常';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles a ON a.oid=m.member
 JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles g ON g.oid=m.grantor
 WHERE a.rolname='postgres' AND r.rolname='pmu_executor' AND g.rolname='postgres') THEN
  RAISE EXCEPTION '存在自有角色授权，停止桥接';
 END IF;
END $$;
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
GRANT pmu_executor TO postgres WITH INHERIT FALSE,SET TRUE;
GRANT CREATE ON SCHEMA public TO pmu_executor;
ALTER FUNCTION public.pmu_bump_desktop_version() OWNER TO pmu_executor;
SET LOCAL ROLE pmu_executor;
REVOKE ALL ON FUNCTION public.pmu_bump_desktop_version() FROM public,anon,authenticated,service_role;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM pmu_executor;
REVOKE pmu_executor FROM postgres GRANTED BY postgres;
INSERT INTO public.pmu_settings(key,value) VALUES('desktop_sync_schema_version','1');
COMMIT;
