-- Roll back project progress only after all project rows have been exported.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
 IF to_regclass('public.pmu_project_progress') IS NULL THEN
  RAISE EXCEPTION '项目进度表不存在，无需回滚';
 END IF;
 IF EXISTS(SELECT 1 FROM public.pmu_project_progress) THEN
  RAISE EXCEPTION '项目台账含有记录；先导出并核对记录，再制定数据保留方案';
 END IF;
END $$;
DROP FUNCTION public.pmu_save_project_progress_v1(uuid,bigint,jsonb);
DROP FUNCTION public.pmu_project_progress_v1();
DROP FUNCTION public.pmu_bump_project_progress_version();
DROP FUNCTION public.pmu_project_progress_default_rules();
DROP TABLE public.pmu_project_progress;
DROP TABLE public.pmu_project_progress_rules;
DELETE FROM public.pmu_settings WHERE key='project_progress_version';
UPDATE public.pmu_settings SET value=gen_random_uuid()::text WHERE key='schema_epoch';
COMMIT;
