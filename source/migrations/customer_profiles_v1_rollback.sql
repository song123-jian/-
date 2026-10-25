-- Refuse rollback after any business customer profile has been retained.
BEGIN;
SET LOCAL lock_timeout='10s';
GRANT pmu_executor TO postgres WITH INHERIT FALSE,SET TRUE;
SET LOCAL ROLE pmu_executor;
GRANT SELECT ON public.pmu_customer_profiles TO postgres;
RESET ROLE;
DO $$ BEGIN
 IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) THEN
  RAISE EXCEPTION '回滚须使用有BYPASSRLS的管理角色检查全部资料';
 END IF;
 IF EXISTS(SELECT 1 FROM public.pmu_customer_profiles) THEN
  RAISE EXCEPTION '客户资料已有记录，请先导出并制定保留方案';
 END IF;
END $$;
SET LOCAL ROLE pmu_executor;
DROP TRIGGER IF EXISTS customer_profiles_desktop_version ON public.pmu_customer_profiles;
DROP FUNCTION IF EXISTS public.pmu_save_customer_profiles_v1(jsonb);
DROP FUNCTION IF EXISTS public.pmu_customer_profiles_v1();
DROP TABLE IF EXISTS public.pmu_customer_profiles;
RESET ROLE;
REVOKE pmu_executor FROM postgres GRANTED BY postgres;
DELETE FROM public.pmu_settings WHERE key='customer_profiles_version';
UPDATE public.pmu_settings SET value=gen_random_uuid()::text WHERE key='schema_epoch';
COMMIT;
