-- Shared rolling budgets for the optional Supabase Edge gateway. No business data changes.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
 IF to_regprocedure('public.pmu_owner_id()') IS NULL OR to_regclass('public.pmu_members') IS NULL THEN
  RAISE EXCEPTION '需要已安装的个人账号结构与身份桥接';
 END IF;
 IF to_regclass('public.pmu_mobile_rate_limits') IS NOT NULL THEN
  RAISE EXCEPTION '限流结构已存在，禁止重复安装';
 END IF;
END $$;
CREATE TABLE public.pmu_mobile_rate_limits(
 owner_id uuid NOT NULL REFERENCES public.pmu_members(user_id),
 is_write boolean NOT NULL,events timestamptz[] NOT NULL DEFAULT ARRAY[]::timestamptz[],
 PRIMARY KEY(owner_id,is_write),CHECK(cardinality(events)<=120));
ALTER TABLE public.pmu_mobile_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_mobile_rate_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pmu_mobile_rate_limits FROM public,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.pmu_mobile_rate_limits TO pmu_executor;
CREATE POLICY own_rate_limit ON public.pmu_mobile_rate_limits TO pmu_executor
 USING(owner_id=auth.uid() AND public.pmu_enabled()) WITH CHECK(owner_id=auth.uid() AND public.pmu_enabled());
GRANT pmu_executor TO postgres;
GRANT CREATE ON SCHEMA public TO pmu_executor;
CREATE FUNCTION public.pmu_mobile_rate_limit_v1(p_write boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE owner uuid; checked_at timestamptz; recent timestamptz[]; budget integer; retry integer;
BEGIN
 IF p_write IS NULL THEN RAISE EXCEPTION '限流操作参数无效' USING ERRCODE='22023'; END IF;
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 owner:=public.pmu_owner_id();
 PERFORM pg_advisory_xact_lock(hashtextextended('pmu-rate:'||owner::text||':'||p_write::text,0));
 checked_at:=clock_timestamp(); budget:=CASE WHEN p_write THEN 30 ELSE 120 END;
 INSERT INTO public.pmu_mobile_rate_limits(owner_id,is_write) VALUES(owner,p_write) ON CONFLICT DO NOTHING;
 SELECT coalesce(array_agg(event ORDER BY event),ARRAY[]::timestamptz[]) INTO recent
 FROM public.pmu_mobile_rate_limits r CROSS JOIN LATERAL unnest(r.events) event
 WHERE r.owner_id=owner AND r.is_write=p_write AND event>checked_at-interval '60 seconds';
 IF cardinality(recent)>=budget THEN
  retry:=greatest(1,least(60,ceil(extract(epoch FROM recent[1]+interval '60 seconds'-checked_at))::integer));
  RETURN jsonb_build_object('allowed',false,'retry_after',retry);
 END IF;
 UPDATE public.pmu_mobile_rate_limits SET events=array_append(recent,checked_at) WHERE owner_id=owner AND is_write=p_write;
 RETURN jsonb_build_object('allowed',true,'retry_after',0);
END $$;
ALTER FUNCTION public.pmu_mobile_rate_limit_v1(boolean) OWNER TO pmu_executor;
REVOKE ALL ON FUNCTION public.pmu_mobile_rate_limit_v1(boolean) FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pmu_mobile_rate_limit_v1(boolean) TO authenticated;
REVOKE CREATE ON SCHEMA public FROM pmu_executor;
REVOKE pmu_executor FROM postgres;
COMMIT;
