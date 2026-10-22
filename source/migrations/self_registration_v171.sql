-- App-specific registration; shared Auth signup settings are unchanged.
BEGIN;
SET LOCAL lock_timeout = '10s';
DO $$ BEGIN
  IF (SELECT value FROM public.pmu_settings WHERE key='multiuser_version') IS DISTINCT FROM '1.7.0' THEN
    RAISE EXCEPTION '需要先安装15人个人账号结构';
  END IF;
END $$;

-- Only the server-side registration function can read capacity/identity state.
CREATE FUNCTION public.pmu_registration_check(p_username text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_username IS NULL OR p_username !~ '^[a-z0-9_]{3,32}$' THEN
    RETURN jsonb_build_object('code','invalid_username');
  END IF;
  IF EXISTS(SELECT 1 FROM public.pmu_members WHERE username=p_username)
    OR EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=p_username||'@price-manager.invalid') THEN
    RETURN jsonb_build_object('code','account_exists');
  END IF;
  IF (SELECT count(*) FROM public.pmu_members WHERE enabled)>=15 THEN
    RETURN jsonb_build_object('code','capacity_full');
  END IF;
  RETURN jsonb_build_object('code','available');
END $$;
REVOKE ALL ON FUNCTION public.pmu_registration_check(text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pmu_registration_check(text) TO service_role;

-- Auth insert + membership + the existing locked 15-seat check form one transaction.
-- Other applications' users are ignored, including users with other metadata.
CREATE FUNCTION public.pmu_enroll_registered_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE app_username text;
BEGIN
  IF coalesce(NEW.raw_user_meta_data->>'pmu_registration','') <> '1.7.1' THEN
    RETURN NEW;
  END IF;
  app_username := split_part(coalesce(NEW.email,''),'@',1);
  IF app_username !~ '^[a-z0-9_]{3,32}$'
    OR NEW.email IS DISTINCT FROM app_username||'@price-manager.invalid' THEN
    RAISE EXCEPTION '程序账号格式无效' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.pmu_members(user_id,username,enabled) VALUES(NEW.id,app_username,true);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pmu_enroll_registered_user() FROM public,anon,authenticated,service_role;
CREATE TRIGGER pmu_enroll_registered_user AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.pmu_enroll_registered_user();

INSERT INTO public.pmu_settings(key,value) VALUES('registration_version','1.7.1');
COMMIT;
