-- Offline-first desktop document records for the authenticated personal account.
-- The client keeps a local queue; these RPCs only accept owner-scoped, revision-checked writes.
BEGIN;
DO $$ BEGIN
 IF (SELECT value FROM public.pmu_settings WHERE key='multiuser_version') IS DISTINCT FROM '1.7.0'
 OR (SELECT value FROM public.pmu_settings WHERE key='quote_workflow_version') IS DISTINCT FROM '1.6.0'
 OR (SELECT value FROM public.pmu_settings WHERE key='desktop_sync_schema_version') IS DISTINCT FROM '1'
 OR to_regprocedure('public.pmu_owner_id()') IS NULL
 OR to_regprocedure('public.pmu_enabled()') IS NULL
 OR to_regprocedure('public.pmu_bump_desktop_version()') IS NULL THEN
  RAISE EXCEPTION '需要已验证的个人账号、报价和桌面同步结构';
 END IF;
 IF to_regclass('public.pmu_business_documents') IS NOT NULL
 OR to_regprocedure('public.pmu_business_document_list_v1(text)') IS NOT NULL
 OR to_regprocedure('public.pmu_save_business_document_v1(uuid,bigint,text,text,jsonb)') IS NOT NULL
 OR to_regprocedure('public.pmu_delete_business_document_v1(text,uuid,bigint)') IS NOT NULL THEN
  RAISE EXCEPTION '制作记录同步结构已存在，请先核对后再迁移';
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

CREATE TABLE public.pmu_business_documents(
 document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL DEFAULT public.pmu_owner_id() REFERENCES public.pmu_members(user_id),
 kind text NOT NULL CHECK(kind IN ('quotation','contract')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),
 document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND pg_column_size(document)<=300000),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pmu_business_documents_owner_updated
 ON public.pmu_business_documents(owner_id,updated_at DESC,document_id);

ALTER TABLE public.pmu_business_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_business_documents FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pmu_business_documents FROM public,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.pmu_business_documents TO pmu_executor;
CREATE POLICY own_business_documents ON public.pmu_business_documents TO pmu_executor
 USING(owner_id=public.pmu_owner_id() AND public.pmu_enabled())
 WITH CHECK(owner_id=public.pmu_owner_id() AND public.pmu_enabled());

-- The existing trigger function is owned by pmu_executor. Use that owner to
-- grant the migration session a temporary execute right before attaching it.
GRANT pmu_executor TO postgres WITH INHERIT FALSE, SET TRUE;
SET LOCAL ROLE pmu_executor;
GRANT EXECUTE ON FUNCTION public.pmu_bump_desktop_version() TO postgres;
RESET ROLE;
CREATE TRIGGER business_documents_desktop_version
 AFTER INSERT OR UPDATE OR DELETE ON public.pmu_business_documents
 FOR EACH ROW EXECUTE FUNCTION public.pmu_bump_desktop_version();

CREATE FUNCTION public.pmu_business_document_list_v1(p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid:=public.pmu_owner_id(); records jsonb;
BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 IF coalesce(p_kind,'') NOT IN ('quotation','contract') THEN
  RAISE EXCEPTION '不支持的制作记录类型' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',d.document_id,'title',d.title,'created_at',d.created_at,'updated_at',d.updated_at,
   'revision',d.revision,'document',d.document
 ) ORDER BY d.updated_at DESC,d.document_id),'[]'::jsonb)
 INTO records FROM public.pmu_business_documents d
 WHERE d.owner_id=uid AND d.kind=p_kind;
 RETURN jsonb_build_object('owner_id',uid,'kind',p_kind,'records',records);
END $$;

CREATE FUNCTION public.pmu_save_business_document_v1(
 p_document_id uuid,p_expected_revision bigint,p_kind text,p_title text,p_document jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid:=public.pmu_owner_id(); row_id uuid; row_revision bigint;
 row_created timestamptz; row_updated timestamptz; clean_title text;
BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 clean_title:=nullif(btrim(p_title),'');
 IF coalesce(p_kind,'') NOT IN ('quotation','contract')
 OR clean_title IS NULL OR length(clean_title)>120
 OR p_document IS NULL OR jsonb_typeof(p_document)<>'object'
 OR p_document->>'kind' IS DISTINCT FROM p_kind
 OR pg_column_size(p_document)>300000 THEN
  RAISE EXCEPTION '制作记录格式无效' USING ERRCODE='22023';
 END IF;
 IF p_document_id IS NULL THEN
  IF p_expected_revision IS NOT NULL THEN
   RAISE EXCEPTION '新增制作记录版本参数无效' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.pmu_business_documents(owner_id,kind,title,document)
  VALUES(uid,p_kind,clean_title,p_document)
  RETURNING document_id,revision,created_at,updated_at
  INTO row_id,row_revision,row_created,row_updated;
 ELSE
  IF p_expected_revision IS NULL OR p_expected_revision<1 THEN
   RAISE EXCEPTION '缺少制作记录版本，请刷新后重新编辑' USING ERRCODE='P0001';
  END IF;
  UPDATE public.pmu_business_documents d SET title=clean_title,document=p_document,
   revision=d.revision+1,updated_at=now()
  WHERE d.owner_id=uid AND d.document_id=p_document_id AND d.kind=p_kind
    AND d.revision=p_expected_revision
  RETURNING d.document_id,d.revision,d.created_at,d.updated_at
  INTO row_id,row_revision,row_created,row_updated;
  IF NOT FOUND THEN
   RAISE EXCEPTION '制作记录已被其他设备修改，请刷新后重新编辑' USING ERRCODE='P0001';
  END IF;
 END IF;
 RETURN jsonb_build_object('id',row_id,'title',clean_title,'created_at',row_created,
  'updated_at',row_updated,'revision',row_revision,'document',p_document);
END $$;

CREATE FUNCTION public.pmu_delete_business_document_v1(
 p_kind text,p_document_id uuid,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE uid uuid:=public.pmu_owner_id(); deleted_id uuid;
BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 IF coalesce(p_kind,'') NOT IN ('quotation','contract') OR p_document_id IS NULL
 OR p_expected_revision IS NULL OR p_expected_revision<1 THEN
  RAISE EXCEPTION '制作记录删除参数无效' USING ERRCODE='22023';
 END IF;
 DELETE FROM public.pmu_business_documents d
 WHERE d.owner_id=uid AND d.document_id=p_document_id AND d.kind=p_kind
   AND d.revision=p_expected_revision
 RETURNING d.document_id INTO deleted_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION '制作记录已被其他设备修改，请刷新后重新编辑' USING ERRCODE='P0001';
 END IF;
 RETURN jsonb_build_object('deleted',true,'id',deleted_id);
END $$;

INSERT INTO public.pmu_settings(key,value) VALUES('business_documents_version','1')
 ON CONFLICT(key) DO UPDATE SET value=excluded.value;
UPDATE public.pmu_settings SET value=gen_random_uuid()::text WHERE key='schema_epoch';

GRANT CREATE ON SCHEMA public TO pmu_executor;
ALTER TABLE public.pmu_business_documents OWNER TO pmu_executor;
ALTER FUNCTION public.pmu_business_document_list_v1(text) OWNER TO pmu_executor;
ALTER FUNCTION public.pmu_save_business_document_v1(uuid,bigint,text,text,jsonb) OWNER TO pmu_executor;
ALTER FUNCTION public.pmu_delete_business_document_v1(text,uuid,bigint) OWNER TO pmu_executor;
SET LOCAL ROLE pmu_executor;
REVOKE ALL ON FUNCTION public.pmu_business_document_list_v1(text),
 public.pmu_save_business_document_v1(uuid,bigint,text,text,jsonb),
 public.pmu_delete_business_document_v1(text,uuid,bigint)
 FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pmu_business_document_list_v1(text),
 public.pmu_save_business_document_v1(uuid,bigint,text,text,jsonb),
 public.pmu_delete_business_document_v1(text,uuid,bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.pmu_bump_desktop_version() FROM postgres;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM pmu_executor;
REVOKE pmu_executor FROM postgres GRANTED BY postgres;
COMMIT;
