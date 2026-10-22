-- Correct only the ACL of the three desktop sync functions already installed.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
 IF (SELECT value FROM public.pmu_settings WHERE key='desktop_sync_schema_version') IS DISTINCT FROM '1'
 OR (SELECT count(*)<>3 OR NOT bool_and(r.rolname='pmu_executor')
 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid IN (
 'public.pmu_sync_meta_v1()'::regprocedure,'public.pmu_mobile_snapshot_v1()'::regprocedure,
 'public.pmu_bump_desktop_version()'::regprocedure)) THEN
  RAISE EXCEPTION '桌面同步函数及所有者不符合预期';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles a ON a.oid=m.member
  JOIN pg_roles b ON b.oid=m.roleid JOIN pg_roles g ON g.oid=m.grantor
  WHERE a.rolname='postgres' AND b.rolname='pmu_executor' AND g.rolname='postgres') THEN
  RAISE EXCEPTION '存在自有角色授权，停止自动变更';
 END IF;
END $$;
GRANT pmu_executor TO postgres WITH INHERIT FALSE, SET TRUE;
SET LOCAL ROLE pmu_executor;
REVOKE ALL ON FUNCTION public.pmu_bump_desktop_version(),public.pmu_sync_meta_v1(),public.pmu_mobile_snapshot_v1()
 FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pmu_sync_meta_v1(),public.pmu_mobile_snapshot_v1() TO authenticated;
RESET ROLE;
REVOKE pmu_executor FROM postgres GRANTED BY postgres;
COMMIT;
