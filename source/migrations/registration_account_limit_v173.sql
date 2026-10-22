-- Count all application memberships, including disabled accounts.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
  IF (SELECT value FROM public.pmu_settings WHERE key='registration_version') IS DISTINCT FROM '1.7.1' THEN
    RAISE EXCEPTION '需要先安装个人账号自助注册结构';
  END IF;
END $$;
LOCK TABLE public.pmu_members IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.pmu_members)>15 THEN
    RAISE EXCEPTION '现有账号已超过15个，请先由管理人员核对；未删除任何账号';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pmu_limit_members() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  -- Keep the existing lock key so old and new callers share one transaction lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('pmu:15-active-members',0));
  IF (SELECT count(*) FROM public.pmu_members WHERE user_id<>NEW.user_id)>=15 THEN
    RAISE EXCEPTION '最多注册15个程序账号（含停用账号）' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.pmu_limit_members() FROM public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pmu_registration_check(p_username text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  IF p_username IS NULL OR p_username !~ '^[a-z0-9_]{3,32}$' THEN
    RETURN jsonb_build_object('code','invalid_username');
  END IF;
  IF EXISTS(SELECT 1 FROM public.pmu_members WHERE username=p_username)
    OR EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=p_username||'@price-manager.invalid') THEN
    RETURN jsonb_build_object('code','account_exists');
  END IF;
  IF (SELECT count(*) FROM public.pmu_members)>=15 THEN
    RETURN jsonb_build_object('code','capacity_full');
  END IF;
  RETURN jsonb_build_object('code','available');
END $$;
REVOKE ALL ON FUNCTION public.pmu_registration_check(text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pmu_registration_check(text) TO service_role;
INSERT INTO public.pmu_settings(key,value) VALUES('max_registered_users','15'),('registration_limit_version','1.7.3')
ON CONFLICT(key) DO UPDATE SET value=excluded.value;
COMMIT;
