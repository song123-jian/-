-- Run only after dependent newly installed modules have been rolled back.
BEGIN;
SET LOCAL lock_timeout='10s';
GRANT pmu_executor TO postgres WITH INHERIT FALSE,SET TRUE;
SET LOCAL ROLE pmu_executor;
DROP FUNCTION public.pmu_bump_desktop_version();
RESET ROLE;
REVOKE pmu_executor FROM postgres GRANTED BY postgres;
DELETE FROM public.pmu_settings WHERE key='desktop_sync_schema_version';
COMMIT;
