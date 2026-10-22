-- 客户价格查询1.6.5：可选只读优化。已有schema 2项目使用；不修改报价/客户/审计。
-- 未安装时客户端自动使用旧读取方式。执行后重启客户端以重新识别接口。
BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pm_settings WHERE key='schema_version' AND value='2') THEN
    RAISE EXCEPTION '请先完成schema 2迁移' USING ERRCODE='22023';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pm_current_quotes_v165(p_today date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_today IS NULL OR p_today NOT BETWEEN DATE '1900-01-01' AND DATE '2200-12-31' THEN
    RAISE EXCEPTION '查询日期无效' USING ERRCODE='22023';
  END IF;
  RETURN (
    WITH ranked AS (
      SELECT q.*, c.revision AS customer_revision, ROW_NUMBER() OVER chosen AS rn,
        COUNT(*) OVER (PARTITION BY identity) AS history_count,
        SUM(CASE WHEN effective_date>p_today AND source_type NOT IN ('文件导入','图片导入','导入更新') THEN 1 ELSE 0 END)
          OVER (PARTITION BY identity) AS future_count,
        LEAD(price) OVER chosen AS previous_price,
        LEAD(effective_date) OVER chosen AS previous_date,
        LEAD(source_type) OVER chosen AS previous_source_type
      FROM public.pm_quotes q JOIN public.pm_customers c USING(customer_key) WHERE c.status='active'
      WINDOW chosen AS (PARTITION BY identity ORDER BY
        (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=p_today) DESC,effective_date DESC,id DESC)
    )
    SELECT coalesce(jsonb_agg(to_jsonb(r)-'rn' ORDER BY customer,grade,color,tax_type),'[]'::jsonb)
    FROM ranked r WHERE rn=1
  );
END $$;

CREATE OR REPLACE FUNCTION public.pm_customer_summaries_v165(p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('active','deleted') THEN
    RAISE EXCEPTION '客户状态无效' USING ERRCODE='22023';
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY display_name),'[]'::jsonb) FROM (
      SELECT c.*,count(DISTINCT q.identity) AS specs,count(q.id) AS records
      FROM public.pm_customers c LEFT JOIN public.pm_quotes q USING(customer_key)
      WHERE c.status=p_status GROUP BY c.customer_key
    ) r
  );
END $$;

CREATE OR REPLACE FUNCTION public.pm_customer_details_v165(p_customer_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF p_customer_key IS NULL OR p_customer_key !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION '客户编号无效' USING ERRCODE='22023';
  END IF;
  SELECT to_jsonb(c)||jsonb_build_object(
    'items',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY effective_date DESC,id DESC)
                     FROM public.pm_quotes q WHERE q.customer_key=p_customer_key),'[]'::jsonb),
    'specs',(SELECT count(DISTINCT identity) FROM public.pm_quotes WHERE customer_key=p_customer_key),
    'records',(SELECT count(*) FROM public.pm_quotes WHERE customer_key=p_customer_key),
    'future_records',(SELECT count(*) FROM public.pm_quotes WHERE customer_key=p_customer_key
                      AND effective_date>(now() AT TIME ZONE 'Asia/Shanghai')::date)
  ) INTO result FROM public.pm_customers c WHERE c.customer_key=p_customer_key;
  IF result IS NULL THEN
    RAISE EXCEPTION '客户不存在，请刷新客户目录' USING ERRCODE='22023';
  END IF;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.pm_current_quotes_v165(date),public.pm_customer_summaries_v165(text),
  public.pm_customer_details_v165(text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pm_current_quotes_v165(date),public.pm_customer_summaries_v165(text),
  public.pm_customer_details_v165(text) TO service_role;
INSERT INTO public.pm_settings VALUES('read_optimization_version','1.6.5')
  ON CONFLICT(key) DO UPDATE SET value=excluded.value;
COMMIT;
