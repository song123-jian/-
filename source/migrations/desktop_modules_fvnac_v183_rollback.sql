-- Applies only to the newly added modules; never removes pre-existing quote/mobile sync data.
BEGIN;
SET LOCAL lock_timeout='10s';
GRANT pmu_executor TO postgres WITH INHERIT FALSE,SET TRUE;
SET LOCAL ROLE pmu_executor;
GRANT SELECT ON public.pmu_customer_profiles,public.pmu_project_progress,public.pmu_business_documents TO postgres;
RESET ROLE;
DO $$ BEGIN
 IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) THEN
  RAISE EXCEPTION '回滚需要有BYPASSRLS的管理角色核对全部记录';
 END IF;
 IF EXISTS(SELECT 1 FROM public.pmu_customer_profiles)
 OR EXISTS(SELECT 1 FROM public.pmu_project_progress)
 OR EXISTS(SELECT 1 FROM public.pmu_business_documents) THEN
  RAISE EXCEPTION '新增模块已有业务记录，请先导出并制定保留方案';
 END IF;
END $$;
SET LOCAL ROLE pmu_executor;
DROP FUNCTION public.pmu_save_customer_profiles_v1(jsonb);
DROP FUNCTION public.pmu_customer_profiles_v1();
DROP TABLE public.pmu_customer_profiles;
DROP FUNCTION public.pmu_save_project_progress_v2(uuid,bigint,jsonb);
DROP FUNCTION public.pmu_project_progress_v2();
DROP FUNCTION public.pmu_save_project_progress_v1(uuid,bigint,jsonb);
DROP FUNCTION public.pmu_project_progress_v1();
DROP TABLE public.pmu_project_progress;
DROP TABLE public.pmu_project_progress_rules;
DROP FUNCTION public.pmu_bump_project_progress_version();
DROP FUNCTION public.pmu_project_progress_default_rules();
DROP FUNCTION public.pmu_delete_business_document_v1(text,uuid,bigint);
DROP FUNCTION public.pmu_save_business_document_v1(uuid,bigint,text,text,jsonb);
DROP FUNCTION public.pmu_business_document_list_v1(text);
DROP TABLE public.pmu_business_documents;
DROP FUNCTION public.pmu_bump_desktop_version();
RESET ROLE;
REVOKE pmu_executor FROM postgres GRANTED BY postgres;
DELETE FROM public.pmu_settings WHERE key IN ('customer_profiles_version','project_progress_version','business_documents_version','desktop_sync_schema_version');
UPDATE public.pmu_settings SET value=gen_random_uuid()::text WHERE key='schema_epoch';
COMMIT;
