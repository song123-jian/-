-- Rollback only before any cloud document has been retained.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
 IF (SELECT value FROM public.pmu_settings WHERE key='business_documents_version') IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION '未安装制作记录同步v1，停止回滚';
 END IF;
 IF EXISTS(SELECT 1 FROM public.pmu_business_documents) THEN
  RAISE EXCEPTION '制作记录表含有记录；先导出并核对记录，再制定数据保留方案';
 END IF;
END $$;
DROP TRIGGER business_documents_desktop_version ON public.pmu_business_documents;
DROP FUNCTION public.pmu_delete_business_document_v1(text,uuid,bigint);
DROP FUNCTION public.pmu_save_business_document_v1(uuid,bigint,text,text,jsonb);
DROP FUNCTION public.pmu_business_document_list_v1(text);
DROP TABLE public.pmu_business_documents;
DELETE FROM public.pmu_settings WHERE key='business_documents_version';
UPDATE public.pmu_settings SET value=gen_random_uuid()::text WHERE key='schema_epoch';
COMMIT;
