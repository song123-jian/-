-- Pause pmu-mobile before rollback; only ephemeral request budgets are removed.
BEGIN;
SET LOCAL lock_timeout='10s';
REVOKE ALL ON FUNCTION public.pmu_mobile_rate_limit_v1(boolean) FROM authenticated;
DROP FUNCTION public.pmu_mobile_rate_limit_v1(boolean);
DROP TABLE public.pmu_mobile_rate_limits;
COMMIT;
