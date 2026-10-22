-- Incremental rollback: retain all members/customers/quotes and version metadata.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
 IF (SELECT value FROM public.pmu_settings WHERE key='desktop_sync_schema_version') IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION '未安装桌面同步v1，停止回滚';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles a ON a.oid=m.member
  JOIN pg_roles b ON b.oid=m.roleid JOIN pg_roles g ON g.oid=m.grantor
  WHERE a.rolname='postgres' AND b.rolname='pmu_executor' AND g.rolname='postgres') THEN
  RAISE EXCEPTION '存在自有角色授权，停止自动变更';
 END IF;
END $$;
DROP TRIGGER desktop_sync_quotes ON public.pmu_quotes;
DROP TRIGGER desktop_sync_customers ON public.pmu_customers;
GRANT pmu_executor TO postgres WITH INHERIT FALSE, SET TRUE;
DROP FUNCTION public.pmu_bump_desktop_version();
DROP FUNCTION public.pmu_sync_meta_v1();
DROP FUNCTION public.pmu_mobile_snapshot_v1();
REVOKE pmu_executor FROM postgres GRANTED BY postgres;
DELETE FROM public.pmu_settings WHERE key='desktop_sync_schema_version';
COMMIT;
