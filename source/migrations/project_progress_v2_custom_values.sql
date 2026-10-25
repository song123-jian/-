-- Add free-text project classifications while keeping the v1 RPCs available to older clients.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ DECLARE current_version text; BEGIN
 IF to_regclass('public.pmu_settings') IS NULL THEN
  RAISE EXCEPTION '程序账号设置表缺失，停止迁移';
 END IF;
 SELECT value INTO current_version FROM public.pmu_settings
  WHERE key='project_progress_version' FOR UPDATE;
 IF current_version IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION '项目进度当前版本为 %，预期版本为1；停止迁移',coalesce(current_version,'未安装');
 END IF;
 IF to_regclass('public.pmu_project_progress') IS NULL
 OR to_regclass('public.pmu_project_progress_rules') IS NULL
 OR to_regprocedure('public.pmu_project_progress_v1()') IS NULL
 OR to_regprocedure('public.pmu_save_project_progress_v1(uuid,bigint,jsonb)') IS NULL
 OR to_regprocedure('public.pmu_owner_id()') IS NULL
 OR to_regprocedure('public.pmu_enabled()') IS NULL THEN
  RAISE EXCEPTION '项目进度 v1 结构不存在或不完整，停止迁移';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pmu_executor' AND rolbypassrls=false) THEN
  RAISE EXCEPTION '项目执行角色缺失或权限不符合要求，停止迁移';
 END IF;
END $$;

GRANT pmu_executor TO postgres WITH INHERIT FALSE, SET TRUE;
GRANT CREATE ON SCHEMA public TO pmu_executor;
SET LOCAL ROLE pmu_executor;
ALTER TABLE public.pmu_project_progress
 ADD COLUMN IF NOT EXISTS custom_stage_label text NOT NULL DEFAULT '' CHECK(length(custom_stage_label)<=120),
 ADD COLUMN IF NOT EXISTS custom_customer_value text NOT NULL DEFAULT '' CHECK(length(custom_customer_value)<=240),
 ADD COLUMN IF NOT EXISTS custom_material_value text NOT NULL DEFAULT '' CHECK(length(custom_material_value)<=240),
 ADD COLUMN IF NOT EXISTS custom_competition text NOT NULL DEFAULT '' CHECK(length(custom_competition)<=240);

CREATE OR REPLACE FUNCTION public.pmu_project_progress_v2() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid:=public.pmu_owner_id(); cfg jsonb; projects jsonb;
BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 INSERT INTO public.pmu_project_progress_rules(owner_id,rules)
 VALUES(uid,public.pmu_project_progress_default_rules()) ON CONFLICT(owner_id) DO NOTHING;
 SELECT rules INTO cfg FROM public.pmu_project_progress_rules WHERE owner_id=uid;
 WITH scored AS (
  SELECT p.*,
   CASE WHEN p.custom_stage_label<>'' THEN 0 ELSE (cfg->'stage_scores'->(p.stage_code::text)->>'score')::integer END AS stage_score,
   CASE WHEN p.custom_customer_value<>'' THEN 0 ELSE (cfg->'customer_values'->p.customer_value->>'score')::integer END AS customer_score,
   CASE WHEN p.custom_competition<>'' THEN 0 ELSE (cfg->'competition_scores'->p.competition->>'score')::integer END AS competition_score,
   CASE WHEN p.custom_material_value<>'' THEN 0 ELSE (cfg->'material_values'->p.material_value->>'score')::integer END AS material_score
  FROM public.pmu_project_progress p WHERE p.owner_id=uid
 ), totals AS (
  SELECT s.*,stage_score+customer_score+competition_score+material_score AS total_score FROM scored s
 )
 SELECT coalesce(jsonb_agg(to_jsonb(t)-'owner_id'||jsonb_build_object('tier',(
   SELECT tier->>'code' FROM jsonb_array_elements(cfg->'tiers') AS tiers(tier)
   WHERE t.total_score >= (tier->>'min')::integer ORDER BY (tier->>'min')::integer DESC LIMIT 1))
   ORDER BY updated_at DESC,project_id),'[]'::jsonb) INTO projects FROM totals t;
 RETURN jsonb_build_object('owner_id',uid,'rules',cfg,'projects',projects);
END $$;

CREATE OR REPLACE FUNCTION public.pmu_save_project_progress_v2(p_project_id uuid,p_expected_revision bigint,p_record jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid:=public.pmu_owner_id(); cfg jsonb; project_id uuid; next_revision bigint;
BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 IF p_record IS NULL OR jsonb_typeof(p_record)<>'object' THEN
  RAISE EXCEPTION '项目资料格式无效' USING ERRCODE='22023';
 END IF;
 SELECT rules INTO cfg FROM public.pmu_project_progress_rules WHERE owner_id=uid;
 IF cfg IS NULL THEN RAISE EXCEPTION '项目评分规则未初始化' USING ERRCODE='22023'; END IF;
 IF NOT (cfg->'stage_scores' ? (p_record->>'stage_code'))
 OR NOT (cfg->'customer_values' ? (p_record->>'customer_value'))
 OR NOT (cfg->'competition_scores' ? (p_record->>'competition'))
 OR NOT (cfg->'material_values' ? (p_record->>'material_value'))
 OR p_record->>'customer_type' NOT IN ('oem','non_auto')
 OR ((p_record->>'customer_type'='non_auto') IS DISTINCT FROM (p_record->>'customer_value'='non_auto')) THEN
  RAISE EXCEPTION '项目阶段、客户类型、竞争或材料价值选项无效' USING ERRCODE='22023';
 END IF;
 IF nullif(btrim(p_record->>'industry'),'') IS NULL
 OR nullif(btrim(p_record->>'customer_name'),'') IS NULL
 OR nullif(btrim(p_record->>'material'),'') IS NULL
 OR length(p_record->>'industry')>120 OR length(p_record->>'customer_name')>240
 OR length(p_record->>'material')>120 OR length(coalesce(p_record->>'recommended_grade',''))>120
 OR length(coalesce(p_record->>'color',''))>120 OR length(coalesce(p_record->>'competitor',''))>240
 OR length(coalesce(p_record->>'product_name',''))>240 OR length(coalesce(p_record->>'next_action',''))>1000
 OR length(coalesce(p_record->>'notes',''))>4000
 OR length(coalesce(p_record->>'custom_stage_label',''))>120
 OR length(coalesce(p_record->>'custom_customer_value',''))>240
 OR length(coalesce(p_record->>'custom_material_value',''))>240
 OR length(coalesce(p_record->>'custom_competition',''))>240 THEN
  RAISE EXCEPTION '项目字段缺失或超过允许长度' USING ERRCODE='22023';
 END IF;
 IF p_project_id IS NULL THEN
  IF p_expected_revision IS NOT NULL THEN RAISE EXCEPTION '新增项目版本参数无效' USING ERRCODE='22023'; END IF;
  INSERT INTO public.pmu_project_progress(
   owner_id,industry,customer_type,customer_name,material,recommended_grade,material_value,color,competitor,
   product_name,stage_code,customer_value,competition,custom_stage_label,custom_customer_value,
   custom_material_value,custom_competition,next_action,milestone_date,notes)
  VALUES(uid,btrim(p_record->>'industry'),p_record->>'customer_type',btrim(p_record->>'customer_name'),
   btrim(p_record->>'material'),coalesce(p_record->>'recommended_grade',''),p_record->>'material_value',
   coalesce(p_record->>'color',''),coalesce(p_record->>'competitor',''),coalesce(p_record->>'product_name',''),
   (p_record->>'stage_code')::smallint,p_record->>'customer_value',p_record->>'competition',
   coalesce(p_record->>'custom_stage_label',''),coalesce(p_record->>'custom_customer_value',''),
   coalesce(p_record->>'custom_material_value',''),coalesce(p_record->>'custom_competition',''),
   coalesce(p_record->>'next_action',''),nullif(p_record->>'milestone_date','')::date,coalesce(p_record->>'notes',''))
  RETURNING pmu_project_progress.project_id,pmu_project_progress.revision INTO project_id,next_revision;
 ELSE
  IF p_expected_revision IS NULL OR p_expected_revision<1 THEN
   RAISE EXCEPTION '缺少项目版本，请刷新后重新编辑' USING ERRCODE='P0001';
  END IF;
  UPDATE public.pmu_project_progress SET
   industry=btrim(p_record->>'industry'),customer_type=p_record->>'customer_type',customer_name=btrim(p_record->>'customer_name'),
   material=btrim(p_record->>'material'),recommended_grade=coalesce(p_record->>'recommended_grade',''),
   material_value=p_record->>'material_value',color=coalesce(p_record->>'color',''),competitor=coalesce(p_record->>'competitor',''),
   product_name=coalesce(p_record->>'product_name',''),stage_code=(p_record->>'stage_code')::smallint,
   customer_value=p_record->>'customer_value',competition=p_record->>'competition',
   custom_stage_label=coalesce(p_record->>'custom_stage_label',''),
   custom_customer_value=coalesce(p_record->>'custom_customer_value',''),
   custom_material_value=coalesce(p_record->>'custom_material_value',''),
   custom_competition=coalesce(p_record->>'custom_competition',''),
   next_action=coalesce(p_record->>'next_action',''),milestone_date=nullif(p_record->>'milestone_date','')::date,
   notes=coalesce(p_record->>'notes',''),revision=revision+1,updated_at=now()
  WHERE owner_id=uid AND pmu_project_progress.project_id=p_project_id AND revision=p_expected_revision
  RETURNING pmu_project_progress.project_id,pmu_project_progress.revision INTO project_id,next_revision;
  IF NOT FOUND THEN RAISE EXCEPTION '项目已被其他用户修改，请刷新后重新编辑' USING ERRCODE='P0001'; END IF;
 END IF;
 RETURN jsonb_build_object('project_id',project_id,'revision',next_revision);
END $$;

RESET ROLE;
UPDATE public.pmu_settings SET value=gen_random_uuid()::text WHERE key='schema_epoch';
INSERT INTO public.pmu_settings(key,value) VALUES('project_progress_version','2')
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;

SET LOCAL ROLE pmu_executor;
ALTER FUNCTION public.pmu_project_progress_v2() OWNER TO pmu_executor;
ALTER FUNCTION public.pmu_save_project_progress_v2(uuid,bigint,jsonb) OWNER TO pmu_executor;
REVOKE ALL ON FUNCTION public.pmu_project_progress_v2(),public.pmu_save_project_progress_v2(uuid,bigint,jsonb)
 FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pmu_project_progress_v2(),public.pmu_save_project_progress_v2(uuid,bigint,jsonb) TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM pmu_executor;
REVOKE pmu_executor FROM postgres GRANTED BY postgres;
COMMIT;
