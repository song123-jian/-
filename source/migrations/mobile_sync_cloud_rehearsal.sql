-- GENERATED deployment rehearsal; cloud execution requires explicit user authorization.
-- Execute this entire file once. It performs install + rollback checks inside one transaction.
-- ROLLBACK leaves the database at the original version; it is not a committed migration.
BEGIN;
SET LOCAL lock_timeout='10s';
CREATE TEMP TABLE pm_mobile_rehearsal_before(label text PRIMARY KEY,fingerprint text NOT NULL) ON COMMIT DROP;
DO $$ DECLARE table_name text; fingerprint text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['pmu_members','pmu_quotes','pmu_customers','pmu_customer_audit'] LOOP
  EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '''')) FROM public.%I t',table_name) INTO fingerprint;
  INSERT INTO pm_mobile_rehearsal_before VALUES(table_name,fingerprint);
 END LOOP;
 INSERT INTO pm_mobile_rehearsal_before
 SELECT 'write_functions',md5(string_agg(pg_get_functiondef(p.oid),E'\n' ORDER BY p.oid::regprocedure::text))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND p.proname IN ('pmu_save_quote_v160','pmu_import_quotes','pmu_change_customer');
END $$;
-- Source: mobile_sync_v1.sql; SHA256=9ffb52b5562e26db1d52f0c7314b5abad704d6b2a7a632d043af1c41bb50d968
-- Mobile sync v1; additive migration. Test and authorize before production execution.
SET LOCAL lock_timeout='10s';
DO $$ BEGIN
 IF (SELECT value FROM public.pmu_settings WHERE key='multiuser_version') IS DISTINCT FROM '1.7.0'
 OR (SELECT value FROM public.pmu_settings WHERE key='quote_workflow_version') IS DISTINCT FROM '1.6.0'
 THEN RAISE EXCEPTION '需要个人账号1.7.0和报价1.6.0结构'; END IF;
 IF EXISTS(SELECT 1 FROM public.pmu_settings WHERE key='sync_schema_version') THEN
 RAISE EXCEPTION '同步结构已安装，请勿重复执行'; END IF;
END $$;
CREATE TABLE public.pmu_sync_migration_backup(signature text PRIMARY KEY,definition text NOT NULL);
REVOKE ALL ON public.pmu_sync_migration_backup FROM public,anon,authenticated,service_role;
INSERT INTO public.pmu_sync_migration_backup SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('pmu_save_quote_v160','pmu_import_quotes','pmu_change_customer');
CREATE TABLE public.pmu_data_versions(
 owner_id uuid PRIMARY KEY REFERENCES public.pmu_members(user_id),
 version bigint NOT NULL DEFAULT 0 CHECK(version>=0),changed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.pmu_mobile_requests(
 owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.pmu_members(user_id),
 request_id uuid NOT NULL,payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 operation text NOT NULL CHECK(operation IN ('save_quote')),result_json jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,request_id));
INSERT INTO public.pmu_data_versions(owner_id) SELECT user_id FROM public.pmu_members;
ALTER TABLE public.pmu_data_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_data_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_mobile_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmu_mobile_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pmu_data_versions,public.pmu_mobile_requests FROM public,anon,authenticated,service_role;
GRANT SELECT ON public.pmu_data_versions,public.pmu_mobile_requests TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.pmu_data_versions,public.pmu_mobile_requests TO pmu_executor;
CREATE POLICY own_sync ON public.pmu_data_versions TO authenticated,pmu_executor
 USING(owner_id=auth.uid() AND public.pmu_enabled()) WITH CHECK(owner_id=auth.uid() AND public.pmu_enabled());
CREATE POLICY own_request ON public.pmu_mobile_requests TO authenticated,pmu_executor
 USING(owner_id=auth.uid() AND public.pmu_enabled()) WITH CHECK(owner_id=auth.uid() AND public.pmu_enabled());
INSERT INTO public.pmu_settings(key,value) VALUES('sync_schema_version','1'),
 ('schema_epoch',gen_random_uuid()::text),('minimum_desktop_sync_version','1.7.2');
GRANT pmu_executor TO postgres;
GRANT CREATE ON SCHEMA public TO pmu_executor;

CREATE FUNCTION public.pmu_lock_owner() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pmu-owner:'||public.pmu_owner_id()::text,0));
END $$;
DO $$ DECLARE f record; body text; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('pmu_save_quote_v160','pmu_import_quotes','pmu_change_customer')
 AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') LOOP
 body:=pg_get_functiondef(f.oid);
 body:=regexp_replace(body,'BEGIN','BEGIN'||E'\n  PERFORM public.pmu_lock_owner();','i');
 EXECUTE body;
 END LOOP;
END $$;

CREATE FUNCTION public.pmu_bump_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ DECLARE uid uuid; BEGIN
 uid:=CASE WHEN TG_OP='DELETE' THEN OLD.owner_id ELSE NEW.owner_id END;
 IF uid IS DISTINCT FROM public.pmu_owner_id() OR NOT public.pmu_enabled() THEN
 RAISE EXCEPTION '同步触发器禁止跨账号修改' USING ERRCODE='42501'; END IF;
 INSERT INTO public.pmu_data_versions(owner_id,version) VALUES(uid,1)
 ON CONFLICT(owner_id) DO UPDATE SET version=pmu_data_versions.version+1,changed_at=now();
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER sync_quotes AFTER INSERT OR UPDATE OR DELETE ON public.pmu_quotes FOR EACH ROW EXECUTE FUNCTION public.pmu_bump_version();
CREATE TRIGGER sync_customers AFTER INSERT OR UPDATE OR DELETE ON public.pmu_customers FOR EACH ROW EXECUTE FUNCTION public.pmu_bump_version();

CREATE FUNCTION public.pmu_python_norm(value text) RETURNS text LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,public AS $$ BEGIN
 value:=normalize(value,NFKC);
 value:=btrim(regexp_replace(value,'[	

                  　]+',' ','g'));
 value := translate(value,'abcdefghijklmnopqrstuvwxyzµàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿāăąćĉċčďđēĕėęěĝğġģĥħĩīĭįıĳĵķĺļľŀłńņňŋōŏőœŕŗřśŝşšţťŧũūŭůűųŵŷźżžſƀƃƅƈƌƒƕƙƚƞơƣƥƨƭưƴƶƹƽƿǅǆǈǉǋǌǎǐǒǔǖǘǚǜǝǟǡǣǥǧǩǫǭǯǲǳǵǹǻǽǿȁȃȅȇȉȋȍȏȑȓȕȗșțȝȟȣȥȧȩȫȭȯȱȳȼȿɀɂɇɉɋɍɏɐɑɒɓɔɖɗəɛɜɠɡɣɥɦɨɩɪɫɬɯɱɲɵɽʀʂʃʇʈʉʊʋʌʒʝʞͅͱͳͷͻͼͽάέήίαβγδεζηθικλμνξοπρςστυφχψωϊϋόύώϐϑϕϖϗϙϛϝϟϡϣϥϧϩϫϭϯϰϱϲϳϵϸϻабвгдежзийклмнопрстуфхцчшщъыьэюяѐёђѓєѕіїјљњћќѝўџѡѣѥѧѩѫѭѯѱѳѵѷѹѻѽѿҁҋҍҏґғҕҗҙқҝҟҡңҥҧҩҫҭүұҳҵҷҹһҽҿӂӄӆӈӊӌӎӏӑӓӕӗәӛӝӟӡӣӥӧөӫӭӯӱӳӵӷӹӻӽӿԁԃԅԇԉԋԍԏԑԓԕԗԙԛԝԟԡԣԥԧԩԫԭԯաբգդեզէըթժիլխծկհձղճմյնշոչպջռսվտրցւփքօֆაბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰჱჲჳჴჵჶჷჸჹჺჽჾჿᏸᏹᏺᏻᏼᏽᲀᲁᲂᲃᲄᲅᲆᲇᲈᵹᵽᶎḁḃḅḇḉḋḍḏḑḓḕḗḙḛḝḟḡḣḥḧḩḫḭḯḱḳḵḷḹḻḽḿṁṃṅṇṉṋṍṏṑṓṕṗṙṛṝṟṡṣṥṧṩṫṭṯṱṳṵṷṹṻṽṿẁẃẅẇẉẋẍẏẑẓẕẛạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹỻỽỿἀἁἂἃἄἅἆἇἐἑἒἓἔἕἠἡἢἣἤἥἦἧἰἱἲἳἴἵἶἷὀὁὂὃὄὅὑὓὕὗὠὡὢὣὤὥὦὧὰάὲέὴήὶίὸόὺύὼώᾰᾱιῐῑῠῡῥⅎⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹⅺⅻⅼⅽⅾⅿↄⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩⰰⰱⰲⰳⰴⰵⰶⰷⰸⰹⰺⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱉⱊⱋⱌⱍⱎⱏⱐⱑⱒⱓⱔⱕⱖⱗⱘⱙⱚⱛⱜⱝⱞⱟⱡⱥⱦⱨⱪⱬⱳⱶⲁⲃⲅⲇⲉⲋⲍⲏⲑⲓⲕⲗⲙⲛⲝⲟⲡⲣⲥⲧⲩⲫⲭⲯⲱⲳⲵⲷⲹⲻⲽⲿⳁⳃⳅⳇⳉⳋⳍⳏⳑⳓⳕⳗⳙⳛⳝⳟⳡⳣⳬⳮⳳⴀⴁⴂⴃⴄⴅⴆⴇⴈⴉⴊⴋⴌⴍⴎⴏⴐⴑⴒⴓⴔⴕⴖⴗⴘⴙⴚⴛⴜⴝⴞⴟⴠⴡⴢⴣⴤⴥⴧⴭꙁꙃꙅꙇꙉꙋꙍꙏꙑꙓꙕꙗꙙꙛꙝꙟꙡꙣꙥꙧꙩꙫꙭꚁꚃꚅꚇꚉꚋꚍꚏꚑꚓꚕꚗꚙꚛꜣꜥꜧꜩꜫꜭꜯꜳꜵꜷꜹꜻꜽꜿꝁꝃꝅꝇꝉꝋꝍꝏꝑꝓꝕꝗꝙꝛꝝꝟꝡꝣꝥꝧꝩꝫꝭꝯꝺꝼꝿꞁꞃꞅꞇꞌꞑꞓꞔꞗꞙꞛꞝꞟꞡꞣꞥꞧꞩꞵꞷꞹꞻꞽꞿꟁꟃꟈꟊꟑꟗꟙꟶꭓꭰꭱꭲꭳꭴꭵꭶꭷꭸꭹꭺꭻꭼꭽꭾꭿꮀꮁꮂꮃꮄꮅꮆꮇꮈꮉꮊꮋꮌꮍꮎꮏꮐꮑꮒꮓꮔꮕꮖꮗꮘꮙꮚꮛꮜꮝꮞꮟꮠꮡꮢꮣꮤꮥꮦꮧꮨꮩꮪꮫꮬꮭꮮꮯꮰꮱꮲꮳꮴꮵꮶꮷꮸꮹꮺꮻꮼꮽꮾꮿａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ𐐨𐐩𐐪𐐫𐐬𐐭𐐮𐐯𐐰𐐱𐐲𐐳𐐴𐐵𐐶𐐷𐐸𐐹𐐺𐐻𐐼𐐽𐐾𐐿𐑀𐑁𐑂𐑃𐑄𐑅𐑆𐑇𐑈𐑉𐑊𐑋𐑌𐑍𐑎𐑏𐓘𐓙𐓚𐓛𐓜𐓝𐓞𐓟𐓠𐓡𐓢𐓣𐓤𐓥𐓦𐓧𐓨𐓩𐓪𐓫𐓬𐓭𐓮𐓯𐓰𐓱𐓲𐓳𐓴𐓵𐓶𐓷𐓸𐓹𐓺𐓻𐖗𐖘𐖙𐖚𐖛𐖜𐖝𐖞𐖟𐖠𐖡𐖣𐖤𐖥𐖦𐖧𐖨𐖩𐖪𐖫𐖬𐖭𐖮𐖯𐖰𐖱𐖳𐖴𐖵𐖶𐖷𐖸𐖹𐖻𐖼𐳀𐳁𐳂𐳃𐳄𐳅𐳆𐳇𐳈𐳉𐳊𐳋𐳌𐳍𐳎𐳏𐳐𐳑𐳒𐳓𐳔𐳕𐳖𐳗𐳘𐳙𐳚𐳛𐳜𐳝𐳞𐳟𐳠𐳡𐳢𐳣𐳤𐳥𐳦𐳧𐳨𐳩𐳪𐳫𐳬𐳭𐳮𐳯𐳰𐳱𐳲𑣀𑣁𑣂𑣃𑣄𑣅𑣆𑣇𑣈𑣉𑣊𑣋𑣌𑣍𑣎𑣏𑣐𑣑𑣒𑣓𑣔𑣕𑣖𑣗𑣘𑣙𑣚𑣛𑣜𑣝𑣞𑣟𖹠𖹡𖹢𖹣𖹤𖹥𖹦𖹧𖹨𖹩𖹪𖹫𖹬𖹭𖹮𖹯𖹰𖹱𖹲𖹳𖹴𖹵𖹶𖹷𖹸𖹹𖹺𖹻𖹼𖹽𖹾𖹿𞤢𞤣𞤤𞤥𞤦𞤧𞤨𞤩𞤪𞤫𞤬𞤭𞤮𞤯𞤰𞤱𞤲𞤳𞤴𞤵𞤶𞤷𞤸𞤹𞤺𞤻𞤼𞤽𞤾𞤿𞥀𞥁𞥂𞥃','ABCDEFGHIJKLMNOPQRSTUVWXYZΜÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞŸĀĂĄĆĈĊČĎĐĒĔĖĘĚĜĞĠĢĤĦĨĪĬĮIĲĴĶĹĻĽĿŁŃŅŇŊŌŎŐŒŔŖŘŚŜŞŠŢŤŦŨŪŬŮŰŲŴŶŹŻŽSɃƂƄƇƋƑǶƘȽȠƠƢƤƧƬƯƳƵƸƼǷǄǄǇǇǊǊǍǏǑǓǕǗǙǛƎǞǠǢǤǦǨǪǬǮǱǱǴǸǺǼǾȀȂȄȆȈȊȌȎȐȒȔȖȘȚȜȞȢȤȦȨȪȬȮȰȲȻⱾⱿɁɆɈɊɌɎⱯⱭⱰƁƆƉƊƏƐꞫƓꞬƔꞍꞪƗƖꞮⱢꞭƜⱮƝƟⱤƦꟅƩꞱƮɄƱƲɅƷꞲꞰΙͰͲͶϽϾϿΆΈΉΊΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΣΤΥΦΧΨΩΪΫΌΎΏΒΘΦΠϏϘϚϜϞϠϢϤϦϨϪϬϮΚΡϹͿΕϷϺАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯЀЁЂЃЄЅІЇЈЉЊЋЌЍЎЏѠѢѤѦѨѪѬѮѰѲѴѶѸѺѼѾҀҊҌҎҐҒҔҖҘҚҜҞҠҢҤҦҨҪҬҮҰҲҴҶҸҺҼҾӁӃӅӇӉӋӍӀӐӒӔӖӘӚӜӞӠӢӤӦӨӪӬӮӰӲӴӶӸӺӼӾԀԂԄԆԈԊԌԎԐԒԔԖԘԚԜԞԠԢԤԦԨԪԬԮԱԲԳԴԵԶԷԸԹԺԻԼԽԾԿՀՁՂՃՄՅՆՇՈՉՊՋՌՍՎՏՐՑՒՓՔՕՖᲐᲑᲒᲓᲔᲕᲖᲗᲘᲙᲚᲛᲜᲝᲞᲟᲠᲡᲢᲣᲤᲥᲦᲧᲨᲩᲪᲫᲬᲭᲮᲯᲰᲱᲲᲳᲴᲵᲶᲷᲸᲹᲺᲽᲾᲿᏰᏱᏲᏳᏴᏵВДОСТТЪѢꙊꝽⱣꟆḀḂḄḆḈḊḌḎḐḒḔḖḘḚḜḞḠḢḤḦḨḪḬḮḰḲḴḶḸḺḼḾṀṂṄṆṈṊṌṎṐṒṔṖṘṚṜṞṠṢṤṦṨṪṬṮṰṲṴṶṸṺṼṾẀẂẄẆẈẊẌẎẐẒẔṠẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸỺỼỾἈἉἊἋἌἍἎἏἘἙἚἛἜἝἨἩἪἫἬἭἮἯἸἹἺἻἼἽἾἿὈὉὊὋὌὍὙὛὝὟὨὩὪὫὬὭὮὯᾺΆῈΈῊΉῚΊῸΌῪΎῺΏᾸᾹΙῘῙῨῩῬℲⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫⅬⅭⅮⅯↃⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏⰀⰁⰂⰃⰄⰅⰆⰇⰈⰉⰊⰋⰌⰍⰎⰏⰐⰑⰒⰓⰔⰕⰖⰗⰘⰙⰚⰛⰜⰝⰞⰟⰠⰡⰢⰣⰤⰥⰦⰧⰨⰩⰪⰫⰬⰭⰮⰯⱠȺȾⱧⱩⱫⱲⱵⲀⲂⲄⲆⲈⲊⲌⲎⲐⲒⲔⲖⲘⲚⲜⲞⲠⲢⲤⲦⲨⲪⲬⲮⲰⲲⲴⲶⲸⲺⲼⲾⳀⳂⳄⳆⳈⳊⳌⳎⳐⳒⳔⳖⳘⳚⳜⳞⳠⳢⳫⳭⳲႠႡႢႣႤႥႦႧႨႩႪႫႬႭႮႯႰႱႲႳႴႵႶႷႸႹႺႻႼႽႾႿჀჁჂჃჄჅჇჍꙀꙂꙄꙆꙈꙊꙌꙎꙐꙒꙔꙖꙘꙚꙜꙞꙠꙢꙤꙦꙨꙪꙬꚀꚂꚄꚆꚈꚊꚌꚎꚐꚒꚔꚖꚘꚚꜢꜤꜦꜨꜪꜬꜮꜲꜴꜶꜸꜺꜼꜾꝀꝂꝄꝆꝈꝊꝌꝎꝐꝒꝔꝖꝘꝚꝜꝞꝠꝢꝤꝦꝨꝪꝬꝮꝹꝻꝾꞀꞂꞄꞆꞋꞐꞒꟄꞖꞘꞚꞜꞞꞠꞢꞤꞦꞨꞴꞶꞸꞺꞼꞾꟀꟂꟇꟉꟐꟖꟘꟵꞳᎠᎡᎢᎣᎤᎥᎦᎧᎨᎩᎪᎫᎬᎭᎮᎯᎰᎱᎲᎳᎴᎵᎶᎷᎸᎹᎺᎻᎼᎽᎾᎿᏀᏁᏂᏃᏄᏅᏆᏇᏈᏉᏊᏋᏌᏍᏎᏏᏐᏑᏒᏓᏔᏕᏖᏗᏘᏙᏚᏛᏜᏝᏞᏟᏠᏡᏢᏣᏤᏥᏦᏧᏨᏩᏪᏫᏬᏭᏮᏯＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ𐐀𐐁𐐂𐐃𐐄𐐅𐐆𐐇𐐈𐐉𐐊𐐋𐐌𐐍𐐎𐐏𐐐𐐑𐐒𐐓𐐔𐐕𐐖𐐗𐐘𐐙𐐚𐐛𐐜𐐝𐐞𐐟𐐠𐐡𐐢𐐣𐐤𐐥𐐦𐐧𐒰𐒱𐒲𐒳𐒴𐒵𐒶𐒷𐒸𐒹𐒺𐒻𐒼𐒽𐒾𐒿𐓀𐓁𐓂𐓃𐓄𐓅𐓆𐓇𐓈𐓉𐓊𐓋𐓌𐓍𐓎𐓏𐓐𐓑𐓒𐓓𐕰𐕱𐕲𐕳𐕴𐕵𐕶𐕷𐕸𐕹𐕺𐕼𐕽𐕾𐕿𐖀𐖁𐖂𐖃𐖄𐖅𐖆𐖇𐖈𐖉𐖊𐖌𐖍𐖎𐖏𐖐𐖑𐖒𐖔𐖕𐲀𐲁𐲂𐲃𐲄𐲅𐲆𐲇𐲈𐲉𐲊𐲋𐲌𐲍𐲎𐲏𐲐𐲑𐲒𐲓𐲔𐲕𐲖𐲗𐲘𐲙𐲚𐲛𐲜𐲝𐲞𐲟𐲠𐲡𐲢𐲣𐲤𐲥𐲦𐲧𐲨𐲩𐲪𐲫𐲬𐲭𐲮𐲯𐲰𐲱𐲲𑢠𑢡𑢢𑢣𑢤𑢥𑢦𑢧𑢨𑢩𑢪𑢫𑢬𑢭𑢮𑢯𑢰𑢱𑢲𑢳𑢴𑢵𑢶𑢷𑢸𑢹𑢺𑢻𑢼𑢽𑢾𑢿𖹀𖹁𖹂𖹃𖹄𖹅𖹆𖹇𖹈𖹉𖹊𖹋𖹌𖹍𖹎𖹏𖹐𖹑𖹒𖹓𖹔𖹕𖹖𖹗𖹘𖹙𖹚𖹛𖹜𖹝𖹞𖹟𞤀𞤁𞤂𞤃𞤄𞤅𞤆𞤇𞤈𞤉𞤊𞤋𞤌𞤍𞤎𞤏𞤐𞤑𞤒𞤓𞤔𞤕𞤖𞤗𞤘𞤙𞤚𞤛𞤜𞤝𞤞𞤟𞤠𞤡');
value := replace(value,'ß','SS');
value := replace(value,'ŉ','ʼN');
value := replace(value,'ǰ','J̌');
value := replace(value,'ΐ','Ϊ́');
value := replace(value,'ΰ','Ϋ́');
value := replace(value,'և','ԵՒ');
value := replace(value,'ẖ','H̱');
value := replace(value,'ẗ','T̈');
value := replace(value,'ẘ','W̊');
value := replace(value,'ẙ','Y̊');
value := replace(value,'ẚ','Aʾ');
value := replace(value,'ὐ','Υ̓');
value := replace(value,'ὒ','Υ̓̀');
value := replace(value,'ὔ','Υ̓́');
value := replace(value,'ὖ','Υ̓͂');
value := replace(value,'ᾀ','ἈΙ');
value := replace(value,'ᾁ','ἉΙ');
value := replace(value,'ᾂ','ἊΙ');
value := replace(value,'ᾃ','ἋΙ');
value := replace(value,'ᾄ','ἌΙ');
value := replace(value,'ᾅ','ἍΙ');
value := replace(value,'ᾆ','ἎΙ');
value := replace(value,'ᾇ','ἏΙ');
value := replace(value,'ᾈ','ἈΙ');
value := replace(value,'ᾉ','ἉΙ');
value := replace(value,'ᾊ','ἊΙ');
value := replace(value,'ᾋ','ἋΙ');
value := replace(value,'ᾌ','ἌΙ');
value := replace(value,'ᾍ','ἍΙ');
value := replace(value,'ᾎ','ἎΙ');
value := replace(value,'ᾏ','ἏΙ');
value := replace(value,'ᾐ','ἨΙ');
value := replace(value,'ᾑ','ἩΙ');
value := replace(value,'ᾒ','ἪΙ');
value := replace(value,'ᾓ','ἫΙ');
value := replace(value,'ᾔ','ἬΙ');
value := replace(value,'ᾕ','ἭΙ');
value := replace(value,'ᾖ','ἮΙ');
value := replace(value,'ᾗ','ἯΙ');
value := replace(value,'ᾘ','ἨΙ');
value := replace(value,'ᾙ','ἩΙ');
value := replace(value,'ᾚ','ἪΙ');
value := replace(value,'ᾛ','ἫΙ');
value := replace(value,'ᾜ','ἬΙ');
value := replace(value,'ᾝ','ἭΙ');
value := replace(value,'ᾞ','ἮΙ');
value := replace(value,'ᾟ','ἯΙ');
value := replace(value,'ᾠ','ὨΙ');
value := replace(value,'ᾡ','ὩΙ');
value := replace(value,'ᾢ','ὪΙ');
value := replace(value,'ᾣ','ὫΙ');
value := replace(value,'ᾤ','ὬΙ');
value := replace(value,'ᾥ','ὭΙ');
value := replace(value,'ᾦ','ὮΙ');
value := replace(value,'ᾧ','ὯΙ');
value := replace(value,'ᾨ','ὨΙ');
value := replace(value,'ᾩ','ὩΙ');
value := replace(value,'ᾪ','ὪΙ');
value := replace(value,'ᾫ','ὫΙ');
value := replace(value,'ᾬ','ὬΙ');
value := replace(value,'ᾭ','ὭΙ');
value := replace(value,'ᾮ','ὮΙ');
value := replace(value,'ᾯ','ὯΙ');
value := replace(value,'ᾲ','ᾺΙ');
value := replace(value,'ᾳ','ΑΙ');
value := replace(value,'ᾴ','ΆΙ');
value := replace(value,'ᾶ','Α͂');
value := replace(value,'ᾷ','Α͂Ι');
value := replace(value,'ᾼ','ΑΙ');
value := replace(value,'ῂ','ῊΙ');
value := replace(value,'ῃ','ΗΙ');
value := replace(value,'ῄ','ΉΙ');
value := replace(value,'ῆ','Η͂');
value := replace(value,'ῇ','Η͂Ι');
value := replace(value,'ῌ','ΗΙ');
value := replace(value,'ῒ','Ϊ̀');
value := replace(value,'ΐ','Ϊ́');
value := replace(value,'ῖ','Ι͂');
value := replace(value,'ῗ','Ϊ͂');
value := replace(value,'ῢ','Ϋ̀');
value := replace(value,'ΰ','Ϋ́');
value := replace(value,'ῤ','Ρ̓');
value := replace(value,'ῦ','Υ͂');
value := replace(value,'ῧ','Ϋ͂');
value := replace(value,'ῲ','ῺΙ');
value := replace(value,'ῳ','ΩΙ');
value := replace(value,'ῴ','ΏΙ');
value := replace(value,'ῶ','Ω͂');
value := replace(value,'ῷ','Ω͂Ι');
value := replace(value,'ῼ','ΩΙ');
value := replace(value,'ﬀ','FF');
value := replace(value,'ﬁ','FI');
value := replace(value,'ﬂ','FL');
value := replace(value,'ﬃ','FFI');
value := replace(value,'ﬄ','FFL');
value := replace(value,'ﬅ','ST');
value := replace(value,'ﬆ','ST');
value := replace(value,'ﬓ','ՄՆ');
value := replace(value,'ﬔ','ՄԵ');
value := replace(value,'ﬕ','ՄԻ');
value := replace(value,'ﬖ','ՎՆ');
value := replace(value,'ﬗ','ՄԽ');
 RETURN value;
END $$;
CREATE FUNCTION public.pmu_mobile_identity(customer text,grade text,color text,tax text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT encode(sha256(convert_to('['||to_json(public.pmu_python_norm(customer))::text||', '||
 to_json(public.pmu_python_norm(grade))::text||', '||to_json(public.pmu_python_norm(color))::text||', '||
 to_json(public.pmu_python_norm(tax))::text||']','UTF8')),'hex'); $$;

CREATE FUNCTION public.pmu_sync_meta_v1() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ DECLARE result jsonb; BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('owner_id',public.pmu_owner_id(),'data_version',coalesce(v.version,0)::text,
 'schema_epoch',(SELECT cfg.value FROM public.pmu_settings cfg WHERE cfg.key='schema_epoch'),
 'sync_schema_version','1','business_date',(now() AT TIME ZONE 'Asia/Shanghai')::date,
 'server_time',now()) INTO result FROM (SELECT 1) x LEFT JOIN public.pmu_data_versions v ON v.owner_id=public.pmu_owner_id();
 RETURN result;
END $$;
CREATE FUNCTION public.pmu_mobile_snapshot_v1() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ DECLARE result jsonb; BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 WITH day AS (SELECT (now() AT TIME ZONE 'Asia/Shanghai')::date AS cutoff),ranked AS (
 SELECT q.*,c.revision AS customer_revision,ROW_NUMBER() OVER chosen AS rn,
 count(*) OVER(PARTITION BY q.identity) AS history_count,
 sum(CASE WHEN effective_date>day.cutoff AND source_type NOT IN ('文件导入','图片导入','导入更新') THEN 1 ELSE 0 END)
 OVER(PARTITION BY q.identity) AS future_count,
 LEAD(price) OVER chosen AS previous_price,LEAD(effective_date) OVER chosen AS previous_date,
 LEAD(source_type) OVER chosen AS previous_source_type
 FROM public.pmu_quotes q JOIN public.pmu_customers c USING(owner_id,customer_key) CROSS JOIN day WHERE c.status='active'
 WINDOW chosen AS(PARTITION BY q.identity ORDER BY
 (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=day.cutoff) DESC,effective_date DESC,id DESC)),
 customers AS(SELECT c.*,count(q.id) AS records,count(DISTINCT q.identity) AS specs
 FROM public.pmu_customers c LEFT JOIN public.pmu_quotes q USING(owner_id,customer_key) WHERE c.status='active'
 GROUP BY c.owner_id,c.customer_key)
 SELECT jsonb_build_object('owner_id',public.pmu_owner_id(),
 'data_version',coalesce((SELECT version FROM public.pmu_data_versions WHERE owner_id=public.pmu_owner_id()),0)::text,
 'schema_epoch',(SELECT cfg.value FROM public.pmu_settings cfg WHERE cfg.key='schema_epoch'),
 'business_date',(SELECT cutoff FROM day),'server_time',now(),
 'customers',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('revision',c.revision::text) ORDER BY display_name) FROM customers c),'[]'::jsonb),
 'quotes',coalesce((SELECT jsonb_agg((to_jsonb(r)-'rn')||jsonb_build_object('id',r.id::text,'customer_revision',r.customer_revision::text) ORDER BY customer,grade,color,tax_type) FROM ranked r WHERE rn=1),'[]'::jsonb)) INTO result;
 IF jsonb_array_length(result->'quotes')>2000 OR octet_length(result::text)>5242880 THEN
 RAISE EXCEPTION '超过移动快照范围，需要分页升级' USING ERRCODE='22023'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.pmu_mobile_history_v1(p_id bigint,p_limit integer,p_before_date date,p_before_id bigint,
 p_version bigint,p_epoch text,p_day date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$ DECLARE result jsonb; BEGIN
 IF NOT public.pmu_enabled() THEN RAISE EXCEPTION '账号已停用或尚未开通' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR (p_before_date IS NULL)<>(p_before_id IS NULL) THEN
 RAISE EXCEPTION '历史分页参数无效' USING ERRCODE='22023'; END IF;
 WITH meta AS(SELECT coalesce((SELECT version FROM public.pmu_data_versions WHERE owner_id=public.pmu_owner_id()),0) AS version,
 (SELECT cfg.value FROM public.pmu_settings cfg WHERE cfg.key='schema_epoch') AS epoch,(now() AT TIME ZONE 'Asia/Shanghai')::date AS day),
 base AS(SELECT q.identity FROM public.pmu_quotes q JOIN public.pmu_customers c USING(owner_id,customer_key) WHERE q.id=p_id AND c.status='active'),
 current_id AS(SELECT id FROM public.pmu_quotes q,meta,base WHERE q.identity=base.identity
 AND (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=meta.day) ORDER BY
 (source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=meta.day) DESC,effective_date DESC,id DESC LIMIT 1),
 rows AS(SELECT q.*,CASE WHEN source_type IN ('文件导入','图片导入','导入更新') OR effective_date<=meta.day THEN false ELSE true END AS scheduled,
 coalesce(q.id=(SELECT id FROM current_id),false) AS is_current,
 price::numeric-LEAD(price::numeric) OVER(ORDER BY effective_date DESC,id DESC) AS delta
 FROM public.pmu_quotes q,base,meta WHERE q.identity=base.identity),
 page AS(SELECT * FROM rows WHERE p_before_date IS NULL OR (effective_date,id)<(p_before_date,p_before_id) ORDER BY effective_date DESC,id DESC LIMIT p_limit+1)
 SELECT jsonb_build_object('valid',meta.version=p_version AND meta.epoch=p_epoch AND meta.day=p_day,
 'exists',EXISTS(SELECT 1 FROM base),'data_version',meta.version::text,'schema_epoch',meta.epoch,'business_date',meta.day,
 'identity',(SELECT identity FROM base),'has_more',(SELECT count(*)>p_limit FROM page),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(x)||jsonb_build_object('id',x.id::text,'delta',x.delta::text) ORDER BY effective_date DESC,id DESC)
 FROM(SELECT * FROM page ORDER BY effective_date DESC,id DESC LIMIT p_limit)x),'[]'::jsonb)) INTO result FROM meta;
 IF result->>'valid' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'snapshot_changed' USING ERRCODE='P0001'; END IF;
 IF result->>'exists' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'not_found' USING ERRCODE='22023'; END IF;
 RETURN result-'valid'-'exists';
END $$;

CREATE FUNCTION public.pmu_mobile_save_quote_v1(p_request_id uuid,p_record jsonb,p_base_id bigint,p_customer_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r jsonb; prior public.pmu_mobile_requests%rowtype; base public.pmu_quotes%rowtype;
 payload text; fingerprint text; key text; ident text; value text; price_value numeric; saved jsonb; result jsonb; version_now bigint; k text;
BEGIN
 PERFORM public.pmu_lock_owner();
 IF p_request_id IS NULL OR p_customer_revision IS NULL OR p_customer_revision<0 OR jsonb_typeof(p_record) IS DISTINCT FROM 'object' THEN
 RAISE EXCEPTION '报价请求参数无效' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_record) x WHERE x NOT IN ('customer','grade','material','color','price','tax_type','effective_date','note','reason')) THEN
 RAISE EXCEPTION '包含不支持的报价字段' USING ERRCODE='22023'; END IF;
 r:='{}'::jsonb;
 FOREACH k IN ARRAY ARRAY['customer','grade','material','color','note','reason'] LOOP
 IF p_record ? k AND jsonb_typeof(p_record->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION '文本字段格式无效' USING ERRCODE='22023'; END IF;
 value:=btrim(coalesce(p_record->>k,''));
 IF length(value)>(CASE WHEN k='note' THEN 2000 WHEN k='reason' THEN 1000 ELSE 250 END)
 OR value ~ '[\x01-\x08\x0B\x0C\x0E-\x1F]' OR (k IN ('customer','grade') AND value='') THEN
 RAISE EXCEPTION '报价文本无效或过长' USING ERRCODE='22023'; END IF;
 r:=r||jsonb_build_object(k,value);
 END LOOP;
 IF jsonb_typeof(p_record->'price') IS DISTINCT FROM 'string' OR length(p_record->>'price')>128
 OR (p_record->>'price') !~ '^[0-9]+(\.[0-9]{1,6})?$' THEN RAISE EXCEPTION '价格格式无效' USING ERRCODE='22023'; END IF;
 price_value:=(p_record->>'price')::numeric;
 IF price_value<=0 OR price_value>1000000000 THEN RAISE EXCEPTION '价格范围无效' USING ERRCODE='22023'; END IF;
 value:=CASE WHEN position('.' IN price_value::text)>0 THEN rtrim(rtrim(price_value::text,'0'),'.') ELSE price_value::text END;
 IF jsonb_typeof(p_record->'tax_type') IS DISTINCT FROM 'string' OR p_record->>'tax_type' NOT IN ('含税','未税','未注明')
 OR jsonb_typeof(p_record->'effective_date') IS DISTINCT FROM 'string' OR p_record->>'effective_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
 RAISE EXCEPTION '税口径或日期无效' USING ERRCODE='22023'; END IF;
 IF (p_record->>'effective_date')::date NOT BETWEEN DATE '1900-01-01' AND DATE '2200-12-31' THEN
 RAISE EXCEPTION '日期范围无效' USING ERRCODE='22023'; END IF;
 key:=encode(sha256(convert_to(public.pmu_python_norm(r->>'customer'),'UTF8')),'hex');
 ident:=public.pmu_mobile_identity(r->>'customer',r->>'grade',r->>'color',p_record->>'tax_type');
 r:=r||jsonb_build_object('price',value,'tax_type',p_record->>'tax_type','effective_date',p_record->>'effective_date',
 'identity',ident,'customer_key',key,'customer_revision',p_customer_revision);
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('record',r,'base_id',p_base_id)::text,'UTF8')),'hex');
 SELECT * INTO prior FROM public.pmu_mobile_requests WHERE request_id=p_request_id;
 IF found THEN
 IF prior.payload_hash<>fingerprint THEN RAISE EXCEPTION 'request_id_reused' USING ERRCODE='P0001'; END IF;
 RETURN prior.result_json;
 END IF;
 IF p_base_id IS NOT NULL THEN
 SELECT * INTO base FROM public.pmu_quotes WHERE id=p_base_id;
 IF NOT found OR (base.customer,base.grade,base.color,base.tax_type,base.identity) IS DISTINCT FROM
 (r->>'customer',r->>'grade',r->>'color',r->>'tax_type',ident) THEN
 RAISE EXCEPTION '报价身份已变化' USING ERRCODE='P0001'; END IF;
 END IF;
 saved:=public.pmu_save_quote_v160(r,p_base_id,NULL);
 SELECT version INTO version_now FROM public.pmu_data_versions WHERE owner_id=public.pmu_owner_id();
 result:=jsonb_build_object('request_id',p_request_id,'status','committed','added',saved->'added','saved_id',saved->>'id',
 'current_record',(saved->'record')||jsonb_build_object('id',saved->'record'->>'id','customer_revision',saved->'record'->>'customer_revision'),
 'customer_revision',saved->'record'->>'customer_revision','data_version',version_now::text,
 'schema_epoch',(SELECT cfg.value FROM public.pmu_settings cfg WHERE cfg.key='schema_epoch'),
 'business_date',(now() AT TIME ZONE 'Asia/Shanghai')::date,'message',saved->>'message');
 INSERT INTO public.pmu_mobile_requests(request_id,payload_hash,operation,result_json) VALUES(p_request_id,fingerprint,'save_quote',result);
 RETURN result;
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('pmu_lock_owner','pmu_bump_version','pmu_python_norm','pmu_mobile_identity','pmu_sync_meta_v1',
 'pmu_mobile_snapshot_v1','pmu_mobile_history_v1','pmu_mobile_save_quote_v1') LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO pmu_executor',f.signature);
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public,anon,authenticated,service_role',f.signature);
 IF f.proname IN ('pmu_sync_meta_v1','pmu_mobile_snapshot_v1','pmu_mobile_history_v1','pmu_mobile_save_quote_v1') THEN
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM pmu_executor;
REVOKE pmu_executor FROM postgres;

-- Source: mobile_gateway_v1.sql; SHA256=8d66cd00d5ad9de71fbe4feacf153062e602c83fdd6d90d5583ddcca7d84f924
-- Shared rolling budgets for the optional Supabase Edge gateway. No business data changes.
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

-- Source: mobile_gateway_v1_rollback.sql; SHA256=70b3745bef01efb5c4e46545894f4b0f7db24cb3fee090bb3162ea06db91c25f
-- Pause pmu-mobile before rollback; only ephemeral request budgets are removed.
SET LOCAL lock_timeout='10s';
REVOKE ALL ON FUNCTION public.pmu_mobile_rate_limit_v1(boolean) FROM authenticated;
DROP FUNCTION public.pmu_mobile_rate_limit_v1(boolean);
DROP TABLE public.pmu_mobile_rate_limits;

-- Source: mobile_sync_v1_rollback.sql; SHA256=b8f5de689c2ed96a071cbd034d54f05685c7d8aaad8eb9c567ac2ebd3db54e7a
-- Incremental rollback only. Maintenance window, backup and authorization required.
-- Keeps every quote/customer/member and every committed mobile request.
SET LOCAL lock_timeout='10s';
LOCK TABLE public.pmu_quotes,public.pmu_customers IN ACCESS EXCLUSIVE MODE;
DROP TRIGGER IF EXISTS sync_quotes ON public.pmu_quotes;
DROP TRIGGER IF EXISTS sync_customers ON public.pmu_customers;
-- Managed postgres is not a superuser. Temporarily inherit the original RPC owner.
GRANT pmu_executor TO postgres;
GRANT CREATE ON SCHEMA public TO pmu_executor;
DO $$ DECLARE item record; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.pmu_settings WHERE key='sync_schema_version' AND value='1') THEN
 RAISE EXCEPTION '需要已安装同步v1，请勿在未知版本回滚'; END IF;
 FOR item IN SELECT definition FROM public.pmu_sync_migration_backup ORDER BY signature LOOP
 EXECUTE item.definition;
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM pmu_executor;
REVOKE pmu_executor FROM postgres;
REVOKE ALL ON FUNCTION public.pmu_sync_meta_v1(),public.pmu_mobile_snapshot_v1(),
 public.pmu_mobile_history_v1(bigint,integer,date,bigint,bigint,text,date),
 public.pmu_mobile_save_quote_v1(uuid,jsonb,bigint,bigint) FROM authenticated;
DELETE FROM public.pmu_settings WHERE key IN ('sync_schema_version','minimum_desktop_sync_version');
UPDATE public.pmu_settings SET value=gen_random_uuid()::text WHERE key='schema_epoch';

DO $$ DECLARE baseline record; actual text; BEGIN
 FOR baseline IN SELECT * FROM pm_mobile_rehearsal_before LOOP
  IF baseline.label='write_functions' THEN
   SELECT md5(string_agg(pg_get_functiondef(p.oid),E'\n' ORDER BY p.oid::regprocedure::text)) INTO actual
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('pmu_save_quote_v160','pmu_import_quotes','pmu_change_customer');
  ELSE
   EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '''')) FROM public.%I t',baseline.label) INTO actual;
  END IF;
  IF actual IS DISTINCT FROM baseline.fingerprint THEN RAISE EXCEPTION '回滚演练保全核对失败：%',baseline.label; END IF;
 END LOOP;
END $$;
SELECT 'rehearsal_assertions_passed_pending_rollback' AS status;
ROLLBACK;
-- No business writes. Verify the original deployed version again after this transaction.
