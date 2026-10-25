-- Roll back only after the custom project text has been exported and verified empty.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ DECLARE current_version text; BEGIN
 IF to_regclass('public.pmu_settings') IS NULL THEN
  RAISE EXCEPTION '程序账号设置表缺失，停止回滚';
 END IF;
 SELECT value INTO current_version FROM public.pmu_settings
  WHERE key='project_progress_version' FOR UPDATE;
 IF current_version IS DISTINCT FROM '2' THEN
  RAISE EXCEPTION '项目进度当前版本为 %，预期版本为2；停止回滚',coalesce(current_version,'未安装');
 END IF;
 IF to_regclass('public.pmu_project_progress') IS NULL
 OR to_regprocedure('public.pmu_project_progress_v2()') IS NULL
 OR to_regprocedure('public.pmu_save_project_progress_v2(uuid,bigint,jsonb)') IS NULL THEN
  RAISE EXCEPTION '项目进度 v2 结构不存在，无需回滚';
 END IF;
 IF EXISTS(SELECT 1 FROM public.pmu_project_progress WHERE
  custom_stage_label<>'' OR custom_customer_value<>'' OR custom_material_value<>'' OR custom_competition<>'') THEN
  RAISE EXCEPTION '存在自定义项目资料；先导出并核对，再制定数据保留方案';
 END IF;
END $$;
DROP FUNCTION public.pmu_save_project_progress_v2(uuid,bigint,jsonb);
DROP FUNCTION public.pmu_project_progress_v2();
ALTER TABLE public.pmu_project_progress
 DROP COLUMN IF EXISTS custom_stage_label,
 DROP COLUMN IF EXISTS custom_customer_value,
 DROP COLUMN IF EXISTS custom_material_value,
 DROP COLUMN IF EXISTS custom_competition;
INSERT INTO public.pmu_settings(key,value) VALUES('project_progress_version','1')
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;
UPDATE public.pmu_settings SET value=gen_random_uuid()::text WHERE key='schema_epoch';
COMMIT;
