-- Project progress ledger v1. Additive, owner-isolated and synchronized through desktop data versions.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
 IF (SELECT value FROM public.pmu_settings WHERE key='multiuser_version') IS DISTINCT FROM '1.7.0'
 OR (SELECT value FROM public.pmu_settings WHERE key='quote_workflow_version') IS DISTINCT FROM '1.6.0'
 OR (SELECT value FROM public.pmu_settings WHERE key='desktop_sync_schema_version') IS DISTINCT FROM '1'
 OR to_regprocedure('public.pmu_owner_id()') IS NULL
 OR to_regprocedure('public.pmu_enabled()') IS NULL
 OR to_regprocedure('public.pmu_bump_desktop_version()') IS NULL THEN
  RAISE EXCEPTION '需要已验证的个人账号、报价和桌面同步结构';
 END IF;
 IF to_regclass('public.pmu_project_progress') IS NOT NULL
 OR to_regclass('public.pmu_project_progress_rules') IS NOT NULL
 OR to_regprocedure('public.pmu_project_progress_v1()') IS NOT NULL
 OR to_regprocedure('public.pmu_save_project_progress_v1(uuid,bigint,jsonb)') IS NOT NULL THEN
  RAISE EXCEPTION '项目进度结构已存在，请先核对后再迁移';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pmu_executor' AND rolbypassrls=false)
 OR has_schema_privilege('pmu_executor','public','CREATE') THEN
  RAISE EXCEPTION '执行角色权限与预期不同，停止升级';
 END IF;
 IF EXISTS(
  SELECT 1 FROM pg_auth_members m
  JOIN pg_roles grantee ON grantee.oid=m.member
  JOIN pg_roles granted_role ON granted_role.oid=m.roleid
  JOIN pg_roles grantor ON grantor.oid=m.grantor
  WHERE grantee.rolname='postgres' AND granted_role.rolname='pmu_executor'
    AND grantor.rolname='postgres'
 ) THEN
  RAISE EXCEPTION '存在 postgres 自有的执行角色授权，停止升级';
 END IF;
END $$;

CREATE TABLE public.pmu_project_progress_rules(
 owner_id uuid PRIMARY KEY REFERENCES public.pmu_members(user_id),
 rules jsonb NOT NULL CHECK(jsonb_typeof(rules)='object'),
 updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.pmu_project_progress(
 project_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL DEFAULT public.pmu_owner_id() REFERENCES public.pmu_members(user_id),
 industry text NOT NULL CHECK(length(btrim(industry)) BETWEEN 1 AND 120),
 customer_type text NOT NULL CHECK(customer_type IN ('oem','non_auto')),
 customer_name text NOT NULL CHECK(length(btrim(customer_name)) BETWEEN 1 AND 240),
 material text NOT NULL CHECK(length(btrim(material)) BETWEEN 1 AND 120),
 recommended_grade text NOT NULL DEFAULT '' CHECK(length(recommended_grade)<=120),
 material_value text NOT NULL CHECK(material_value IN ('special','reinforced','general')),
 color text NOT NULL DEFAULT '' CHECK(length(color)<=120),
 competitor text NOT NULL DEFAULT '' CHECK(length(competitor)<=240),
 product_name text NOT NULL DEFAULT '' CHECK(length(product_name)<=240),
 stage_code smallint NOT NULL CHECK(stage_code BETWEEN 1 AND 5),
 customer_value text NOT NULL CHECK(customer_value IN ('geely_strategic','oem_t1_important','oem_t1_regular','non_auto')),
 competition text NOT NULL CHECK(competition IN ('awarded','open','intense','lost')),
 next_action text NOT NULL DEFAULT '' CHECK(length(next_action)<=1000),
 milestone_date date,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>=1),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((customer_type='non_auto')=(customer_value='non_auto')));
CREATE INDEX pmu_project_progress_owner_updated ON public.pmu_project_progress(owner_id,updated_at DESC,project_id);

ALTER TABLE public.pmu_project_progress_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_project_progress_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_project_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_project_progress FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pmu_project_progress_rules,public.pmu_project_progress FROM public,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.pmu_project_progress_rules,public.pmu_project_progress TO pmu_executor;
CREATE POLICY own_project_rules ON public.pmu_project_progress_rules TO pmu_executor
 USING(owner_id=public.pmu_owner_id() AND public.pmu_enabled())
 WITH CHECK(owner_id=public.pmu_owner_id() AND public.pmu_enabled());
CREATE POLICY own_project_progress ON public.pmu_project_progress TO pmu_executor
 USING(owner_id=public.pmu_owner_id() AND public.pmu_enabled())
 WITH CHECK(owner_id=public.pmu_owner_id() AND public.pmu_enabled());

CREATE FUNCTION public.pmu_project_progress_default_rules() RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog AS $$
 SELECT '{
  "version":1,
  "stage_scores":{"1":{"label":"项目接触","score":6,"detail":"立项接触、信息获取、首次报价"},"2":{"label":"送样 / 试料","score":12,"detail":"寄样、试模、小批试样"},"3":{"label":"测试 / 认证","score":18,"detail":"客户测试、第三方认证、合格性验证"},"4":{"label":"定点 / 小批","score":24,"detail":"定点通知、小批量供货"},"5":{"label":"量产","score":30,"detail":"批量供货、持续订单"}},
  "customer_values":{"geely_strategic":{"label":"吉利系 / 战略客户项目","score":30},"oem_t1_important":{"label":"主机厂 T1 重要客户","score":22},"oem_t1_regular":{"label":"主机厂 T1 普通客户","score":15},"non_auto":{"label":"非汽车客户","score":8}},
  "competition_scores":{"awarded":{"label":"已定点我司 / 独供","score":20},"open":{"label":"有竞争未定点","score":12},"intense":{"label":"竞争激烈暂无优势","score":8},"lost":{"label":"已失单 / 无望","score":0}},
  "material_values":{"special":{"label":"特种高价值（长玻纤 / 高增强 / 阻燃）","score":20},"reinforced":{"label":"常规增强改性","score":12},"general":{"label":"低附加值通用料","score":6}},
  "tiers":[{"code":"A","min":80,"label":"重点攻坚"},{"code":"B","min":65,"label":"重点跟进"},{"code":"C","min":45,"label":"常规推进"},{"code":"D","min":0,"label":"观察暂缓"}],
  "resource_allocation":{"A":50,"B":30,"C":20,"D":0},
  "strategy":{"core":"A档主机厂项目集中攻认证、定点和样板复制；B档项目持续清卡点；非汽车客户用主机厂案例做背书，先小批验证再放量，同时把回款管理纳入每周节奏。","geely":"备齐对应材料报告后主动跟进吉利系项目；新项目统一参与报价。","non_auto":"以主机厂A/B档定点与量产记录做背书，老客稳供，新客先小批验证再放量，回款异常每周对账。","weekly":["周一更新项目进度与评分","周三协调样品、测试、商务卡点","周五输出周报并核对回款"]}
 }'::jsonb;
$$;

INSERT INTO public.pmu_project_progress_rules(owner_id,rules)
 SELECT user_id,public.pmu_project_progress_default_rules() FROM public.pmu_members WHERE enabled
 ON CONFLICT(owner_id) DO NOTHING;

CREATE FUNCTION public.pmu_bump_project_progress_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF (CASE WHEN TG_OP='DELETE' THEN OLD.owner_id ELSE NEW.owner_id END) IS DISTINCT FROM public.pmu_owner_id()
 OR NOT public.pmu_enabled()
 OR (TG_OP='UPDATE' AND OLD.owner_id IS DISTINCT FROM NEW.owner_id) THEN
  RAISE EXCEPTION '同步触发器禁止跨账号修改' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.pmu_data_versions(owner_id,version)
 VALUES(public.pmu_owner_id(),1)
 ON CONFLICT(owner_id) DO UPDATE SET version=pmu_data_versions.version+1,changed_at=now();
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER project_progress_version AFTER INSERT OR UPDATE OR DELETE ON public.pmu_project_progress
 FOR EACH ROW EXECUTE FUNCTION public.pmu_bump_project_progress_version();

CREATE FUNCTION public.pmu_project_progress_v1() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid:=public.pmu_owner_id(); cfg jsonb; projects jsonb;
BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 INSERT INTO public.pmu_project_progress_rules(owner_id,rules)
 VALUES(uid,public.pmu_project_progress_default_rules()) ON CONFLICT(owner_id) DO NOTHING;
 SELECT rules INTO cfg FROM public.pmu_project_progress_rules WHERE owner_id=uid;
 WITH scored AS (
  SELECT p.*,
   (cfg->'stage_scores'->(p.stage_code::text)->>'score')::integer AS stage_score,
   (cfg->'customer_values'->p.customer_value->>'score')::integer AS customer_score,
   (cfg->'competition_scores'->p.competition->>'score')::integer AS competition_score,
   (cfg->'material_values'->p.material_value->>'score')::integer AS material_score
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

CREATE FUNCTION public.pmu_save_project_progress_v1(p_project_id uuid,p_expected_revision bigint,p_record jsonb)
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
 OR length(coalesce(p_record->>'notes',''))>4000 THEN
  RAISE EXCEPTION '项目字段缺失或超过允许长度' USING ERRCODE='22023';
 END IF;
 IF p_project_id IS NULL THEN
  IF p_expected_revision IS NOT NULL THEN RAISE EXCEPTION '新增项目版本参数无效' USING ERRCODE='22023'; END IF;
  INSERT INTO public.pmu_project_progress(
   owner_id,industry,customer_type,customer_name,material,recommended_grade,material_value,color,competitor,
   product_name,stage_code,customer_value,competition,next_action,milestone_date,notes)
  VALUES(uid,btrim(p_record->>'industry'),p_record->>'customer_type',btrim(p_record->>'customer_name'),
   btrim(p_record->>'material'),coalesce(p_record->>'recommended_grade',''),p_record->>'material_value',
   coalesce(p_record->>'color',''),coalesce(p_record->>'competitor',''),coalesce(p_record->>'product_name',''),
   (p_record->>'stage_code')::smallint,p_record->>'customer_value',p_record->>'competition',
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
   customer_value=p_record->>'customer_value',competition=p_record->>'competition',next_action=coalesce(p_record->>'next_action',''),
   milestone_date=nullif(p_record->>'milestone_date','')::date,notes=coalesce(p_record->>'notes',''),
   revision=revision+1,updated_at=now()
  WHERE owner_id=uid AND pmu_project_progress.project_id=p_project_id AND revision=p_expected_revision
  RETURNING pmu_project_progress.project_id,pmu_project_progress.revision INTO project_id,next_revision;
  IF NOT FOUND THEN RAISE EXCEPTION '项目已被其他用户修改，请刷新后重新编辑' USING ERRCODE='P0001'; END IF;
 END IF;
 RETURN jsonb_build_object('project_id',project_id,'revision',next_revision);
END $$;

UPDATE public.pmu_settings SET value=gen_random_uuid()::text WHERE key='schema_epoch';
INSERT INTO public.pmu_settings(key,value) VALUES('project_progress_version','1')
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;

-- Managed PostgreSQL 17 requires temporary SET membership to transfer object ownership.
GRANT pmu_executor TO postgres WITH INHERIT FALSE, SET TRUE;
GRANT CREATE ON SCHEMA public TO pmu_executor;
ALTER TABLE public.pmu_project_progress_rules OWNER TO pmu_executor;
ALTER TABLE public.pmu_project_progress OWNER TO pmu_executor;
ALTER FUNCTION public.pmu_project_progress_default_rules() OWNER TO pmu_executor;
ALTER FUNCTION public.pmu_bump_project_progress_version() OWNER TO pmu_executor;
ALTER FUNCTION public.pmu_project_progress_v1() OWNER TO pmu_executor;
ALTER FUNCTION public.pmu_save_project_progress_v1(uuid,bigint,jsonb) OWNER TO pmu_executor;
SET LOCAL ROLE pmu_executor;
REVOKE ALL ON FUNCTION public.pmu_project_progress_default_rules(),public.pmu_bump_project_progress_version(),
 public.pmu_project_progress_v1(),public.pmu_save_project_progress_v1(uuid,bigint,jsonb)
 FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pmu_project_progress_v1(),public.pmu_save_project_progress_v1(uuid,bigint,jsonb) TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM pmu_executor;
REVOKE pmu_executor FROM postgres GRANTED BY postgres;
COMMIT;
