-- Run once on an existing schema 2 project. No quote changes at installation.
BEGIN;
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
  IF (SELECT value FROM public.pm_settings WHERE key='schema_version') IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION '需要 schema 2，请先完成客户回收站迁移';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pm_save_quote_v160(p_record jsonb,p_base_id bigint DEFAULT NULL,p_history_keys jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.pm_quotes%rowtype; base public.pm_quotes%rowtype; saved public.pm_quotes%rowtype;
  has_prior boolean; new_id bigint; old_group text; new_group text := p_record->>'identity';
  k jsonb; revision_now bigint; did_add boolean := false; write_source text;
  day_now date := (now() AT TIME ZONE 'Asia/Shanghai')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('customer:'||(p_record->>'customer_key'),0));
  PERFORM public.pm_require_customer(p_record,(p_record->>'customer_revision')::bigint);
  IF p_history_keys IS NOT NULL THEN
    SELECT * INTO base FROM public.pm_quotes WHERE id=p_base_id;
    IF NOT found OR base.customer_key<>p_record->>'customer_key'
      OR base.customer<>p_record->>'customer' OR base.grade<>p_record->>'grade' THEN
      RAISE EXCEPTION '报价基准已变化，请刷新后重新打开' USING errcode='P0001';
    END IF;
    old_group:=base.identity;
    IF old_group=new_group OR new_group IS NULL OR new_group !~ '^[a-f0-9]{64}$'
      OR (base.color<>'' AND base.color IS DISTINCT FROM p_record->>'color')
      OR (base.tax_type<>'未注明' AND base.tax_type IS DISTINCT FROM p_record->>'tax_type')
      OR (p_record->>'color') IS NULL OR (p_record->>'tax_type') NOT IN ('含税','未税','未注明') THEN
      RAISE EXCEPTION '仅能补齐原来空白的颜色或未注明税口径' USING errcode='22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(least(old_group,new_group),0));
    PERFORM pg_advisory_xact_lock(hashtextextended(greatest(old_group,new_group),0));
    SELECT * INTO prior FROM public.pm_quotes WHERE identity=old_group
      ORDER BY (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=day_now) DESC,effective_date DESC,id DESC LIMIT 1;
    IF prior.id IS DISTINCT FROM p_base_id OR EXISTS(SELECT 1 FROM public.pm_quotes WHERE identity=new_group) THEN
      RAISE EXCEPTION '报价已变化或目标颜色和税口径已有报价，请刷新后核对' USING errcode='P0001';
    END IF;
    IF jsonb_typeof(p_history_keys) IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_history_keys)<>(SELECT count(*) FROM public.pm_quotes WHERE identity=old_group)
      OR EXISTS(SELECT 1 FROM public.pm_quotes q WHERE identity=old_group AND NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(p_history_keys) e WHERE (e->>'id')::bigint=q.id))
      OR EXISTS(SELECT 1 FROM public.pm_quotes q JOIN jsonb_array_elements(p_history_keys) e ON (e->>'id')::bigint=q.id
        WHERE q.identity=old_group AND (q.import_key IS NULL) IS DISTINCT FROM ((e->>'import_key') IS NULL))
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_history_keys) e GROUP BY e->>'id' HAVING count(*)<>1) THEN
      RAISE EXCEPTION '历史记录已变化，请重新打开补填窗口' USING errcode='P0001';
    END IF;
    FOR k IN SELECT value FROM jsonb_array_elements(p_history_keys) LOOP
      IF (k->>'import_key') IS NOT NULL AND (k->>'import_key') !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION '导入指纹无效' USING errcode='22023';
      END IF;
      UPDATE public.pm_quotes SET identity=new_group,color=p_record->>'color',tax_type=p_record->>'tax_type',
        import_key=k->>'import_key' WHERE id=(k->>'id')::bigint AND identity=old_group;
    END LOOP;
    UPDATE public.pm_customers SET revision=revision+1 WHERE customer_key=p_record->>'customer_key';
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(new_group,0));
  END IF;
  SELECT * INTO prior FROM public.pm_quotes WHERE identity=new_group
    ORDER BY (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=day_now) DESC,effective_date DESC,id DESC LIMIT 1;
  has_prior:=found;
  IF p_base_id IS NOT NULL THEN
    IF NOT has_prior OR prior.id<>p_base_id THEN
      RAISE EXCEPTION '该报价已变化，请刷新后再操作' USING errcode='P0001';
    END IF;
    IF length(trim(coalesce(p_record->>'reason','')))=0 THEN
      RAISE EXCEPTION '请填写调价或补录原因' USING errcode='22023';
    END IF;
  ELSIF has_prior THEN
    RAISE EXCEPTION '该客户牌号已有报价，请从查询结果中更新价格' USING errcode='P0001';
  END IF;
  IF NOT has_prior OR prior.price IS DISTINCT FROM p_record->>'price'
    OR prior.effective_date IS DISTINCT FROM (p_record->>'effective_date')::date
    OR prior.material IS DISTINCT FROM coalesce(p_record->>'material','')
    OR prior.note IS DISTINCT FROM coalesce(p_record->>'note','') THEN
    write_source:=CASE WHEN coalesce((p_record->>'import_immediate')::boolean,false) THEN '图片导入'
      WHEN prior.source_type IN ('文件导入','图片导入','导入更新') THEN '导入更新' ELSE '手工录入' END;
    INSERT INTO public.pm_quotes(identity,customer,grade,material,color,price,tax_type,effective_date,note,reason,source_file,source_sheet,source_row,source_type,customer_key)
      VALUES(new_group,p_record->>'customer',p_record->>'grade',coalesce(p_record->>'material',''),coalesce(p_record->>'color',''),
        p_record->>'price',p_record->>'tax_type',(p_record->>'effective_date')::date,coalesce(p_record->>'note',''),
        coalesce(p_record->>'reason',''),CASE WHEN write_source='图片导入' THEN coalesce(p_record->>'source_file','') ELSE '' END,
        CASE WHEN write_source='图片导入' THEN coalesce(p_record->>'source_sheet','') ELSE '' END,
        CASE WHEN write_source='图片导入' THEN coalesce((p_record->>'source_row')::integer,0) ELSE 0 END,write_source,p_record->>'customer_key') RETURNING id INTO new_id;
    UPDATE public.pm_customers SET revision=revision+1 WHERE customer_key=p_record->>'customer_key';
    did_add:=true;
  ELSE new_id:=prior.id; END IF;
  SELECT * INTO saved FROM public.pm_quotes WHERE identity=new_group
    ORDER BY (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=day_now) DESC,effective_date DESC,id DESC LIMIT 1;
  SELECT revision INTO revision_now FROM public.pm_customers WHERE customer_key=p_record->>'customer_key';
  RETURN jsonb_build_object('added',did_add,'id',new_id,
    'record',to_jsonb(saved)||jsonb_build_object('customer_revision',revision_now),
    'message',CASE WHEN p_history_keys IS NOT NULL THEN '已补齐缺失字段，历史价格和日期保留'
      WHEN did_add THEN '已保存新报价，原有历史完整保留' ELSE '报价内容未变化，无需重复保存' END);
END $$;

CREATE OR REPLACE FUNCTION public.pm_add_quote(p_record jsonb,p_base_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.pm_save_quote_v160(p_record,p_base_id,NULL);
$$;
REVOKE ALL ON FUNCTION public.pm_save_quote_v160(jsonb,bigint,jsonb),public.pm_add_quote(jsonb,bigint) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pm_save_quote_v160(jsonb,bigint,jsonb),public.pm_add_quote(jsonb,bigint) TO service_role;
INSERT INTO public.pm_settings VALUES('quote_workflow_version','1.6.0') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
COMMIT;

SELECT value AS quote_workflow_version FROM public.pm_settings WHERE key='quote_workflow_version';
