-- Empty-project rehearsal only. All fixtures are rolled back, with no passwords.
BEGIN;
DO $$
DECLARE i integer; member_id uuid; blocked boolean:=false;
BEGIN
  IF EXISTS(SELECT 1 FROM public.pmu_members)
    OR EXISTS(SELECT 1 FROM auth.users WHERE lower(email) LIKE '%@price-manager.invalid') THEN
    RAISE EXCEPTION '验证只允许在程序账号为空时进行；未修改现有账号';
  END IF;
  INSERT INTO auth.users(id,email,raw_user_meta_data)
    VALUES(gen_random_uuid(),'pmu_verify_01@price-manager.invalid','{"pmu_registration":"1.7.1"}');
  IF public.pmu_registration_check('pmu_verify_01')->>'code' <> 'account_exists' THEN
    RAISE EXCEPTION '重复账号检查失败';
  END IF;
  BEGIN
    INSERT INTO auth.users(id,email,raw_user_meta_data)
      VALUES(gen_random_uuid(),'pmu_verify_01@price-manager.invalid','{"pmu_registration":"1.7.1"}');
  EXCEPTION WHEN unique_violation THEN blocked:=true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION '重复注册未被拒绝'; END IF;
  FOR i IN 2..15 LOOP
    INSERT INTO auth.users(id,email,raw_user_meta_data)
      VALUES(gen_random_uuid(),'pmu_verify_'||lpad(i::text,2,'0')||'@price-manager.invalid',
        '{"pmu_registration":"1.7.1"}');
  END LOOP;
  SELECT user_id INTO member_id FROM public.pmu_members WHERE username='pmu_verify_01';
  UPDATE public.pmu_members SET enabled=false WHERE user_id=member_id;
  IF public.pmu_registration_check('pmu_verify_16')->>'code' <> 'capacity_full' THEN
    RAISE EXCEPTION '停用账号未计入15个总账号限制';
  END IF;
  blocked:=false;
  BEGIN
    INSERT INTO auth.users(id,email,raw_user_meta_data)
      VALUES(gen_random_uuid(),'pmu_verify_16@price-manager.invalid','{"pmu_registration":"1.7.1"}');
  EXCEPTION WHEN SQLSTATE '22023' THEN blocked:=true;
  END;
  IF NOT blocked OR (SELECT count(*) FROM public.pmu_members)<>15
    OR EXISTS(SELECT 1 FROM auth.users WHERE email='pmu_verify_16@price-manager.invalid') THEN
    RAISE EXCEPTION '第16个账号未被原子拒绝';
  END IF;
END $$;
SELECT 'passed' AS duplicate_and_total_15_limit, count(*) AS temporary_members
FROM public.pmu_members;
ROLLBACK;
