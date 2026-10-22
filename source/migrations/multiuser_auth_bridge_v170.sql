-- Repair only the app's current-user lookup on Supabase's managed auth schema.
BEGIN;
SET LOCAL lock_timeout='10s';
CREATE OR REPLACE FUNCTION public.pmu_owner_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ SELECT auth.uid(); $$;
REVOKE ALL ON FUNCTION public.pmu_owner_id() FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pmu_owner_id() TO pmu_executor;
GRANT pmu_executor TO postgres;
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND left(p.proname,4)='pmu_'
      AND p.proname NOT IN ('pmu_enabled','pmu_limit_members','pmu_owner_id')
      AND p.prosrc LIKE '%auth.uid()%' LOOP
    EXECUTE replace(pg_get_functiondef(f.oid),'auth.uid()','public.pmu_owner_id()');
  END LOOP;
END $$;
REVOKE pmu_executor FROM postgres;
COMMIT;
SELECT '1.7.0' AS multiuser_version,15 AS max_active_users,
  NOT rolbypassrls AND NOT rolsuper AND NOT rolcanlogin AS executor_still_restricted
FROM pg_roles WHERE rolname='pmu_executor';
