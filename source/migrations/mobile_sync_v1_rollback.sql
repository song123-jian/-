-- Incremental rollback only. Maintenance window, backup and authorization required.
-- Keeps every quote/customer/member and every committed mobile request.
BEGIN;
SET LOCAL lock_timeout='10s';
LOCK TABLE public.pmu_quotes,public.pmu_customers IN ACCESS EXCLUSIVE MODE;
DROP TRIGGER IF EXISTS sync_quotes ON public.pmu_quotes;
DROP TRIGGER IF EXISTS sync_customers ON public.pmu_customers;
-- Managed postgres is not a superuser. Temporarily inherit the original RPC owner.
GRANT pmu_executor TO postgres;
GRANT CREATE ON SCHEMA public TO pmu_executor;
DO $$ DECLARE item record; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.pmu_settings WHERE key='sync_schema_version' AND value='1') THEN
 RAISE EXCEPTION '需要已安装同步v1，请勿在未知版本回滚'; END IF;
 FOR item IN SELECT definition FROM public.pmu_sync_migration_backup ORDER BY signature LOOP
 EXECUTE item.definition;
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM pmu_executor;
REVOKE pmu_executor FROM postgres;
REVOKE ALL ON FUNCTION public.pmu_sync_meta_v1(),public.pmu_mobile_snapshot_v1(),
 public.pmu_mobile_history_v1(bigint,integer,date,bigint,bigint,text,date),
 public.pmu_mobile_save_quote_v1(uuid,jsonb,bigint,bigint) FROM authenticated;
DELETE FROM public.pmu_settings WHERE key IN ('sync_schema_version','minimum_desktop_sync_version');
UPDATE public.pmu_settings SET value=gen_random_uuid()::text WHERE key='schema_epoch';
COMMIT;
