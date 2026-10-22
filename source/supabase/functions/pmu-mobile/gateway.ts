// Dependency-free Web APIs: the same handler runs in Supabase Edge and local Node QA.
const MAX_RESPONSE = 6 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER = /^(0|[1-9][0-9]{0,18})$/;
const INT64_MAX = 9223372036854775807n;
const PYTHON_SPACE = '[\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const trim = value => value.replace(new RegExp('^'+PYTHON_SPACE+'+|'+PYTHON_SPACE+'+$','gu'),'');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const immediate = source => ['文件导入','图片导入','导入更新'].includes(source);

class ApiError extends Error {
  constructor(status,code,message,retryable=false,retryAfter=null) {
    super(message); Object.assign(this,{status,code,retryable,retryAfter});
  }
}
const invalid = () => { throw new ApiError(422,'validation_error','报价字段无效，请核对输入'); };
const backendInvalid = () => { throw new ApiError(503,'backend_unavailable','云端服务响应异常，请稍后核对',true); };
function integer(value, positive=false) {
  if (typeof value !== 'string' || !INTEGER.test(value) || BigInt(value)>INT64_MAX || (positive && value==='0')) invalid();
  return value;
}
function clean(value,limit) {
  if (typeof value !== 'string') invalid();
  const text = trim(value);
  if (Array.from(text).length>limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) invalid();
  return text;
}
function money(value) {
  const text = clean(value,128).replace(/_/g,'');
  const match = /^([+\-]?)([0-9]*)(?:\.([0-9]*))?(?:[eE]([+\-]?[0-9]+))?$/.exec(text);
  if (!match || match[1]==='-' || !(match[2] || match[3])) invalid();
  let digits = (match[2]+(match[3] ?? '')).replace(/^0+/, '');
  if (!digits) invalid();
  let exponent = BigInt(match[4] ?? '0') - BigInt((match[3] ?? '').length);
  while (digits.endsWith('0')) { digits=digits.slice(0,-1); exponent++; }
  if (exponent < -6n || exponent > 9n || BigInt(digits.length)+exponent>10n) invalid();
  const units = BigInt(digits) * 10n ** (exponent+6n);
  if (units<=0n || units>1000000000000000n) invalid();
  if (exponent>=0n) return digits+'0'.repeat(Number(exponent));
  const scale=Number(-exponent);
  digits=digits.padStart(scale+1,'0');
  return digits.slice(0,-scale)+'.'+digits.slice(-scale);
}
function date(value) {
  const text = clean(value,40).replaceAll('/','-');
  const match = /^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:[ T]00:00:00(?:\.0+)?)?$/.exec(text);
  if (!match) invalid();
  const [year,month,day]=match.slice(1).map(Number);
  const parsed=new Date(Date.UTC(year,month-1,day));
  if (year<1900 || year>2200 || parsed.getUTCFullYear()!==year || parsed.getUTCMonth()!==month-1 || parsed.getUTCDate()!==day) invalid();
  return parsed.toISOString().slice(0,10);
}
function validateCommand(value,baseId) {
  if (!object(value) || Object.keys(value).some(k=>!['request_id','customer_revision','record'].includes(k))
    || typeof value.request_id!=='string' || !UUID.test(value.request_id) || !object(value.record)) invalid();
  const row=value.record;
  const fields=['customer','grade','material','color','price','tax_type','effective_date','note','reason'];
  if (Object.keys(row).some(k=>!fields.includes(k))) invalid();
  const record={};
  for (const key of ['customer','grade','material','color','note','reason']) {
    record[key]=clean(Object.hasOwn(row,key) ? row[key] : (['customer','grade'].includes(key) ? null:''),key==='note'?2000:key==='reason'?1000:250);
  }
  if (!record.customer || !record.grade || (baseId!==null && !record.reason)) invalid();
  record.price=money(row.price); record.effective_date=date(row.effective_date);
  record.tax_type=clean(row.tax_type,20);
  if (!record.tax_type) record.tax_type=/未税|不含税/.test(record.note)?'未税':record.note.includes('含税')?'含税':'未注明';
  if (!['含税','未税','未注明'].includes(record.tax_type)) invalid();
  return {p_request_id:value.request_id.toLowerCase(),p_record:record,p_base_id:baseId,
    p_customer_revision:integer(value.customer_revision)};
}
async function readJson(source,maxBytes) {
  if (!source.body) throw new Error('empty body');
  const reader=source.body.getReader(); const chunks=[]; let length=0;
  try {
    for (;;) {
      const {value,done}=await reader.read(); if (done) break;
      length+=value.byteLength; if (length>maxBytes) throw new Error('body size limit'); chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  const bytes=new Uint8Array(length); let offset=0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function delta(current,previous) {
  const decimals=value=>(value.split('.')[1] ?? '').length;
  const scale=Math.max(decimals(current),decimals(previous));
  const units=value=>BigInt(value.replace('.',''))*10n**BigInt(scale-decimals(value));
  const difference=units(current)-units(previous);
  const digits=(difference<0n?-difference:difference).toString().padStart(scale+1,'0');
  return (difference<0n?'-':'')+(scale ? digits.slice(0,-scale)+'.'+digits.slice(-scale):digits);
}
function quote(value) {
  if (!object(value) || ['id','customer','grade','material','color','price','tax_type','effective_date','note','reason',
    'source_type','customer_key','identity'].some(k=>typeof value[k]!=='string')) backendInvalid();
  try { integer(value.id,true); money(value.price); date(value.effective_date); } catch { backendInvalid(); }
  return {...value};
}
function decorate(value,businessDate) {
  const row=quote(value); const effective=immediate(row.source_type) || row.effective_date<=businessDate;
  let previous=row.previous_price ?? null;
  if (!effective || !row.previous_date || (row.previous_date>businessDate && !immediate(row.previous_source_type))) previous=null;
  row.scheduled=!effective; row.previous_price=previous;
  row.delta=previous ? delta(row.price,previous):null;
  row.age_days=Math.round((Date.parse(businessDate)-Date.parse(row.effective_date))/86400000);
  row.stale=effective && row.age_days>60;
  delete row.previous_date; delete row.previous_source_type;
  return row;
}
function checkedMeta(value,needsServerTime=false) {
  if (!object(value) || typeof value.schema_epoch!=='string' || !value.schema_epoch || value.schema_epoch.length>128
    || (needsServerTime && typeof value.server_time!=='string')) backendInvalid();
  try { integer(value.data_version); if (date(value.business_date)!==value.business_date) backendInvalid(); }
  catch { backendInvalid(); }
  return value;
}
function saveResponse(value,expectedId) {
  checkedMeta(value);
  if (value.request_id!==expectedId || value.status!=='committed' || typeof value.added!=='boolean' || typeof value.message!=='string') backendInvalid();
  try { integer(value.saved_id,true); integer(value.customer_revision); } catch { backendInvalid(); }
  return {...value,current_record:decorate(value.current_record,value.business_date)};
}

export class CursorCodec {
  constructor(secret) {
    if (typeof secret!=='string' || new TextEncoder().encode(secret).length<32) throw new Error('Cursor secret must be at least 32 bytes');
    this.key=crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  }
  async encode(value) {
    const bytes=new TextEncoder().encode(JSON.stringify(value,Object.keys(value).sort()));
    const body=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
    const signature=await crypto.subtle.sign('HMAC',await this.key,new TextEncoder().encode(body));
    return body+'.'+Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
  }
  async decode(token,owner) {
    try {
      if (typeof token!=='string' || token.length>4096) throw new Error('size');
      const parts=token.split('.');
      if (parts.length!==2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) throw new Error('format');
      const signature=Uint8Array.from(parts[1].match(/../g),byte=>parseInt(byte,16));
      if (!await crypto.subtle.verify('HMAC',await this.key,signature,new TextEncoder().encode(parts[0]))) throw new Error('signature');
      const bytes=Uint8Array.from(atob(parts[0].replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
      const state=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if (state.owner_id!==owner || !Number.isSafeInteger(state.exp) || state.exp<=Date.now()/1000) throw new Error('identity/expiry');
      return state;
    } catch { throw new ApiError(409,'snapshot_changed','历史页已失效，请从第一页重新读取'); }
  }
}
class Backend {
  constructor(config,fetcher) { this.config=config; this.fetch=fetcher; }
  async call(path,token,body=undefined) {
    try {
      const response=await this.fetch(this.config.supabaseUrl+path,{method:body===undefined?'GET':'POST',
        headers:{apikey:this.config.publishableKey,Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},
        body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
      const value=await readJson(response,MAX_RESPONSE);
      if (response.ok) return value;
      const code=object(value)?value.code:''; const message=object(value)?value.message:'';
      if (response.status===401) throw new ApiError(401,'session_expired','登录已失效，请重新登录');
      if (response.status===403 || code==='42501') throw new ApiError(403,'member_disabled','账号未开通或已停用');
      if (code==='P0001') throw new ApiError(409,['snapshot_changed','request_id_reused'].includes(message)?message:'quote_conflict','内容或基准已变化，请刷新后核对');
      if (['22023','22007','22008','22P02','23514'].includes(code)) {
        if (message==='not_found') throw new ApiError(404,'not_found','没有可访问的记录');
        throw new ApiError(422,'validation_error','参数无效或超出数据范围，请核对');
      }
      if (response.status===429) throw new ApiError(429,'rate_limited','请求过于频繁，请稍后重试',true,60);
      backendInvalid();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503,'backend_unavailable','连接中断，保存结果需按原请求编号核对',true);
    }
  }
  async authenticate(token,write) {
    const user=await this.call('/auth/v1/user',token);
    if (!object(user) || typeof user.id!=='string' || !UUID.test(user.id)) throw new ApiError(401,'session_expired','身份验证失败');
    const owner=user.id.toLowerCase();
    const members=await this.call('/rest/v1/pmu_members?select=user_id,username,enabled',token);
    if (!Array.isArray(members) || members.length!==1 || members[0].user_id!==owner || members[0].enabled!==true
      || typeof members[0].username!=='string') throw new ApiError(403,'member_disabled','账号未开通或已停用');
    const budget=await this.rpc('pmu_mobile_rate_limit_v1',token,{p_write:write});
    if (!object(budget) || typeof budget.allowed!=='boolean') backendInvalid();
    if (!budget.allowed) {
      if (!Number.isInteger(budget.retry_after) || budget.retry_after<1 || budget.retry_after>60) backendInvalid();
      throw new ApiError(429,'rate_limited','请求过于频繁，请稍后重试',true,budget.retry_after);
    }
    return {owner,username:members[0].username,token};
  }
  async rpc(name,token,body={}) { return await this.call('/rest/v1/rpc/'+name,token,body); }
}

export function createHandler(config,options={}) {
  const project=new URL(config.supabaseUrl);
  if (project.protocol!=='https:' || !project.hostname.endsWith('.supabase.co') || project.username || project.password
    || !['','/'].includes(project.pathname) || project.search || project.hash || project.port
    || typeof config.publishableKey!=='string' || !config.publishableKey.startsWith('sb_publishable_')) throw new Error('Only public Supabase project configuration is accepted');
  config={...config,supabaseUrl:project.origin};
  const backend=new Backend(config,options.fetch ?? fetch); const cursors=new CursorCodec(config.cursorSecret);
  return async request => {
    const trace=crypto.randomUUID().replaceAll('-','');
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'X-Trace-ID':trace,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'};
    const reply=(status,value,extra={})=>new Response(status===204?null:JSON.stringify(value),{status,headers:{...headers,...extra}});
    try {
      const url=new URL(request.url); let path=url.pathname;
      for (const mount of ['/functions/v1/pmu-mobile','/pmu-mobile']) if (path.startsWith(mount+'/')) { path=path.slice(mount.length); break; }
      if (request.method==='OPTIONS') return reply(204,null);
      if (request.method==='GET' && path==='/api/v1/health') return reply(200,{status:'ready',version:'1.0.0'});
      if (request.method==='GET' && path==='/api/v1/app-version') return reply(200,{platform:'android',recommended_version:'1.0.0',
        recommended_version_code:1,minimum_version_code:1,download_url:null});
      const history=/^\/api\/v1\/quotes\/([^/]+)\/history$/.exec(path);
      const update=/^\/api\/v1\/quotes\/([^/]+)\/updates$/.exec(path);
      const recovery=/^\/api\/v1\/requests\/([^/]+)$/.exec(path);
      const readRoute=request.method==='GET' && (['/api/v1/session','/api/v1/sync/meta','/api/v1/snapshot'].includes(path) || history || recovery);
      const writeRoute=request.method==='POST' && (path==='/api/v1/quotes' || update);
      if (!readRoute && !writeRoute) throw new ApiError(404,'not_found','接口不存在');
      const authorization=request.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ') || authorization.length>16384 || !authorization.slice(7)) throw new ApiError(401,'session_expired','请先登录');
      const who=await backend.authenticate(authorization.slice(7),Boolean(writeRoute));
      let result;
      if (path==='/api/v1/session') result={user_id:who.owner,username:who.username,enabled:true,api_version:'1',sync_schema_version:'1'};
      else if (path==='/api/v1/sync/meta') result=checkedMeta(await backend.rpc('pmu_sync_meta_v1',who.token));
      else if (path==='/api/v1/snapshot') {
        result=checkedMeta(await backend.rpc('pmu_mobile_snapshot_v1',who.token),true);
        if (result.owner_id!==who.owner || !Array.isArray(result.quotes) || result.quotes.length>2000 || !Array.isArray(result.customers)) backendInvalid();
        for (const c of result.customers) if (!object(c) || ['customer_key','display_name','status','revision'].some(k=>typeof c[k]!=='string')
          || !Number.isInteger(c.specs) || !Number.isInteger(c.records)) backendInvalid();
        result={...result,quotes:result.quotes.map(row=>decorate(row,result.business_date))};
      } else if (history) {
        const id=integer(history[1],true); const page=url.searchParams.get('limit') ?? '50';
        if (!/^[0-9]{1,3}$/.test(page) || Number(page)<1 || Number(page)>100) invalid();
        const limit=Number(page); const cursor=url.searchParams.get('cursor'); let state;
        if (cursor) {
          state=await cursors.decode(cursor,who.owner);
          if (state.id!==id || state.limit!==limit) throw new ApiError(409,'snapshot_changed','历史页已失效，请从第一页重新读取');
        } else {
          const m=checkedMeta(await backend.rpc('pmu_sync_meta_v1',who.token));
          state={id,limit,owner_id:who.owner,version:m.data_version,epoch:m.schema_epoch,day:m.business_date,date:null,before_id:null,exp:Math.floor(Date.now()/1000)+600};
        }
        result=checkedMeta(await backend.rpc('pmu_mobile_history_v1',who.token,{p_id:id,p_limit:limit,p_before_date:state.date,
          p_before_id:state.before_id,p_version:state.version,p_epoch:state.epoch,p_day:state.day}));
        if (!Array.isArray(result.items) || result.items.length>limit || typeof result.has_more!=='boolean' || typeof result.identity!=='string') backendInvalid();
        result.items=result.items.map(quote); let next=null;
        if (result.has_more && result.items.length) {
          const last=result.items.at(-1); next=await cursors.encode({...state,date:last.effective_date,before_id:last.id});
        }
        result={...result,next_cursor:next};
      } else if (recovery) {
        if (!UUID.test(recovery[1])) invalid(); const id=recovery[1].toLowerCase();
        const rows=await backend.call('/rest/v1/pmu_mobile_requests?select=result_json&request_id=eq.'+id,who.token);
        if (!Array.isArray(rows) || rows.length>1) backendInvalid();
        if (!rows.length) throw new ApiError(404,'not_found','尚无已提交结果，请保留原编号继续核对');
        result=saveResponse(rows[0].result_json,id);
      } else {
        const baseId=update ? integer(update[1],true):null; let body;
        try { body=await readJson(request,32*1024); } catch { invalid(); }
        const command=validateCommand(body,baseId);
        result=saveResponse(await backend.rpc('pmu_mobile_save_quote_v1',who.token,command),command.p_request_id);
      }
      return reply(200,result);
    } catch (error) {
      const e=error instanceof ApiError?error:new ApiError(503,'backend_unavailable','服务暂不可用，保存结果请保留原编号核对',true);
      return reply(e.status,{code:e.code,message:e.message,trace_id:trace,fields:{},retryable:e.retryable},e.retryAfter?{'Retry-After':String(e.retryAfter)}:{});
    }
  };
}
