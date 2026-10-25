-- Owner-scoped customer master records for desktop account mode.
BEGIN;
SET LOCAL lock_timeout='10s';

DO $$ BEGIN
 IF to_regclass('public.pmu_settings') IS NULL
 OR to_regclass('public.pmu_members') IS NULL
 OR to_regprocedure('public.pmu_owner_id()') IS NULL
 OR to_regprocedure('public.pmu_enabled()') IS NULL
 OR to_regprocedure('public.pmu_bump_desktop_version()') IS NULL THEN
  RAISE EXCEPTION '个人账号或桌面同步结构缺失，停止客户资料迁移';
 END IF;
 IF to_regclass('public.pmu_customer_profiles') IS NOT NULL
 OR to_regprocedure('public.pmu_customer_profiles_v1()') IS NOT NULL
 OR to_regprocedure('public.pmu_save_customer_profiles_v1(jsonb)') IS NOT NULL THEN
  RAISE EXCEPTION '客户资料结构已存在，请先核对后再迁移';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pmu_executor' AND rolbypassrls=false)
 OR has_schema_privilege('pmu_executor','public','CREATE') THEN
  RAISE EXCEPTION '个人账号执行角色权限与预期不同，停止迁移';
 END IF;
END $$;

CREATE TABLE public.pmu_customer_profiles(
 profile_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL DEFAULT public.pmu_owner_id() REFERENCES public.pmu_members(user_id),
 name text NOT NULL DEFAULT '' CHECK(length(name)<=240),
 contact text NOT NULL DEFAULT '' CHECK(length(contact)<=120),
 phone text NOT NULL DEFAULT '' CHECK(length(phone)<=80),
 industry text NOT NULL DEFAULT '' CHECK(length(industry)<=120),
 address text NOT NULL DEFAULT '' CHECK(length(address)<=500),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pmu_customer_profiles_owner_name
 ON public.pmu_customer_profiles(owner_id,name,profile_id);

ALTER TABLE public.pmu_customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_customer_profiles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pmu_customer_profiles FROM public,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.pmu_customer_profiles TO pmu_executor;
CREATE POLICY own_customer_profiles ON public.pmu_customer_profiles TO pmu_executor
 USING(owner_id=public.pmu_owner_id() AND public.pmu_enabled())
 WITH CHECK(owner_id=public.pmu_owner_id() AND public.pmu_enabled());

CREATE FUNCTION public.pmu_customer_profiles_v1() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid:=public.pmu_owner_id(); profiles jsonb;
BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(p)-'owner_id' ORDER BY lower(p.name),p.profile_id),'[]'::jsonb)
 INTO profiles FROM public.pmu_customer_profiles p WHERE p.owner_id=uid;
 RETURN jsonb_build_object('profiles',profiles);
END $$;

CREATE FUNCTION public.pmu_save_customer_profiles_v1(p_profiles jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 uid uuid:=public.pmu_owner_id(); item jsonb; item_key text;
 requested_id uuid; expected_revision bigint; current_row public.pmu_customer_profiles%ROWTYPE;
 saved_row public.pmu_customer_profiles%ROWTYPE; profiles jsonb:='[]'::jsonb;
 name_value text; contact_value text; phone_value text; industry_value text; address_value text;
 created_count integer:=0; updated_count integer:=0; skipped_count integer:=0;
BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 IF p_profiles IS NULL OR jsonb_typeof(p_profiles)<>'array' OR jsonb_array_length(p_profiles)>20000 THEN
  RAISE EXCEPTION '客户资料批次格式无效或超过20000条' USING ERRCODE='22023';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_profiles)
 LOOP
  IF jsonb_typeof(item)<>'object' THEN RAISE EXCEPTION '客户资料格式无效' USING ERRCODE='22023'; END IF;
  IF EXISTS (
   SELECT 1 FROM jsonb_object_keys(item) AS keys(key)
   WHERE key NOT IN ('profile_id','revision','name','contact','phone','industry','address')
  ) THEN RAISE EXCEPTION '客户资料包含不支持的字段' USING ERRCODE='22023'; END IF;
  FOREACH item_key IN ARRAY ARRAY['name','contact','phone','industry','address'] LOOP
   IF item ? item_key AND jsonb_typeof(item->item_key) NOT IN ('string','null') THEN
    RAISE EXCEPTION '客户资料字段格式无效：%',item_key USING ERRCODE='22023';
   END IF;
  END LOOP;
  name_value:=btrim(coalesce(item->>'name',''));
  contact_value:=btrim(coalesce(item->>'contact',''));
  phone_value:=btrim(coalesce(item->>'phone',''));
  industry_value:=btrim(coalesce(item->>'industry',''));
  address_value:=btrim(coalesce(item->>'address',''));
  IF length(name_value)>240 OR length(contact_value)>120 OR length(phone_value)>80
  OR length(industry_value)>120 OR length(address_value)>500 THEN
   RAISE EXCEPTION '客户资料字段超过允许长度' USING ERRCODE='22023';
  END IF;
  requested_id:=nullif(item->>'profile_id','')::uuid;
  expected_revision:=null;
  IF item ? 'revision' AND jsonb_typeof(item->'revision') NOT IN ('null') THEN
   IF jsonb_typeof(item->'revision')<>'number' OR (item->>'revision') !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION '客户资料版本无效' USING ERRCODE='22023';
   END IF;
   expected_revision:=(item->>'revision')::bigint;
  END IF;

  IF requested_id IS NULL THEN
   INSERT INTO public.pmu_customer_profiles(owner_id,name,contact,phone,industry,address)
   VALUES(uid,name_value,contact_value,phone_value,industry_value,address_value) RETURNING * INTO saved_row;
   created_count:=created_count+1;
  ELSE
   SELECT * INTO current_row FROM public.pmu_customer_profiles
   WHERE profile_id=requested_id AND owner_id=uid FOR UPDATE;
   IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.pmu_customer_profiles WHERE profile_id=requested_id) THEN
     RAISE EXCEPTION '客户资料不属于当前账号' USING ERRCODE='42501';
    END IF;
    INSERT INTO public.pmu_customer_profiles(profile_id,owner_id,name,contact,phone,industry,address)
    VALUES(requested_id,uid,name_value,contact_value,phone_value,industry_value,address_value)
    RETURNING * INTO saved_row;
    created_count:=created_count+1;
   ELSE
    IF expected_revision IS NULL OR expected_revision<>current_row.revision THEN
     RAISE EXCEPTION '客户资料已变化，请刷新后重试' USING ERRCODE='40001';
    END IF;
    IF (current_row.name,current_row.contact,current_row.phone,current_row.industry,current_row.address)
       IS NOT DISTINCT FROM (name_value,contact_value,phone_value,industry_value,address_value) THEN
     saved_row:=current_row;
     skipped_count:=skipped_count+1;
    ELSE
     UPDATE public.pmu_customer_profiles SET name=name_value,contact=contact_value,phone=phone_value,
      industry=industry_value,address=address_value,revision=revision+1,updated_at=now()
     WHERE profile_id=requested_id AND owner_id=uid RETURNING * INTO saved_row;
     updated_count:=updated_count+1;
    END IF;
   END IF;
  END IF;
  profiles:=profiles||jsonb_build_array(to_jsonb(saved_row)-'owner_id');
 END LOOP;
 RETURN jsonb_build_object('created',created_count,'updated',updated_count,'skipped',skipped_count,
                           'profiles',profiles);
END $$;

GRANT pmu_executor TO postgres WITH INHERIT FALSE, SET TRUE;
GRANT CREATE ON SCHEMA public TO pmu_executor;
ALTER TABLE public.pmu_customer_profiles OWNER TO pmu_executor;
ALTER FUNCTION public.pmu_customer_profiles_v1() OWNER TO pmu_executor;
ALTER FUNCTION public.pmu_save_customer_profiles_v1(jsonb) OWNER TO pmu_executor;
SET LOCAL ROLE pmu_executor;
CREATE TRIGGER customer_profiles_desktop_version
 AFTER INSERT OR UPDATE OR DELETE ON public.pmu_customer_profiles
 FOR EACH ROW EXECUTE FUNCTION public.pmu_bump_desktop_version();

REVOKE ALL ON FUNCTION public.pmu_customer_profiles_v1() FROM public,anon;
REVOKE ALL ON FUNCTION public.pmu_save_customer_profiles_v1(jsonb) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.pmu_customer_profiles_v1(),
 public.pmu_save_customer_profiles_v1(jsonb) TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM pmu_executor;
REVOKE pmu_executor FROM postgres GRANTED BY postgres;
INSERT INTO public.pmu_settings(key,value) VALUES('customer_profiles_version','1');
UPDATE public.pmu_settings SET value=gen_random_uuid()::text WHERE key='schema_epoch';
COMMIT;
