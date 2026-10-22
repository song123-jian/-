import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';

let gateway;
try { gateway = await import('../gateway.ts'); } catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const requestId = '11111111-2222-4333-8444-555555555555';
const base = 'https://example.supabase.co/functions/v1/pmu-mobile';
const meta = {data_version:'8', schema_epoch:'epoch-1', business_date:'2026-10-13', server_time:'2026-10-13T08:00:00+08:00'};
const record = {id:'123', customer:'测试客户', grade:'PA6', material:'PA6', color:'黑色', price:'9.734513',
  tax_type:'含税', effective_date:'2026-10-13', note:'原文\n保留', reason:'报价', source_type:'手工新增',
  customer_key:'a'.repeat(64), identity:'b'.repeat(64), previous_price:'9.700001', previous_date:'2026-10-12', previous_source_type:'手工新增'};
const saved = {request_id:requestId, status:'committed', added:true, saved_id:'123', current_record:record,
  customer_revision:'1', ...meta, message:'已保存'};
const command = {request_id:requestId, customer_revision:'0', record:Object.fromEntries(
  ['customer','grade','material','color','price','tax_type','effective_date','note','reason'].map(k => [k,record[k]]))};
const config = {supabaseUrl:'https://example.supabase.co', publishableKey:'sb_publishable_test', cursorSecret:'x'.repeat(48)};
const calls = [];
const json = (value, status=200) => new Response(JSON.stringify(value), {status, headers:{'content-type':'application/json'}});
function setup(options={}) {
  assert(gateway, 'RED: Supabase Edge gateway is not implemented');
  calls.length = 0;
  const upstream = async (url, init) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({path:u.pathname, query:u.search, body, headers:new Headers(init.headers)});
    if (u.pathname === '/auth/v1/user') return options.authResponse ?? json({id:owner});
    if (u.pathname === '/rest/v1/pmu_members') return json([{user_id:owner, username:'edge_qa', enabled:options.enabled ?? true}]);
    if (u.pathname.endsWith('pmu_mobile_rate_limit_v1')) return json({allowed:options.allowed ?? true, retry_after:60});
    if (u.pathname.endsWith('pmu_sync_meta_v1')) return json(meta);
    if (u.pathname.endsWith('pmu_mobile_snapshot_v1')) return options.snapshotResponse ?? json({owner_id:owner,...meta,customers:[],quotes:[record]});
    if (u.pathname.endsWith('pmu_mobile_history_v1')) return options.historyResponse ?? json({identity:record.identity,...meta,has_more:true,items:[record]});
    if (u.pathname.endsWith('pmu_mobile_save_quote_v1')) {
      if (options.saveThrows) throw new TypeError('lost response with sensitive upstream detail');
      return options.saveResponse ?? json(saved);
    }
    if (u.pathname === '/rest/v1/pmu_mobile_requests') return json(options.requestRows ?? []);
    throw new Error('Unexpected upstream endpoint');
  };
  return gateway.createHandler(config, {fetch:upstream});
}
function request(path, body, headers={}) {
  return new Request(base + '/api/v1/' + path, {method:body === undefined ? 'GET':'POST',
    headers:{Authorization:'Bearer actual-user-jwt','content-type':'application/json',...headers},
    body:body === undefined ? undefined : JSON.stringify(body)});
}
const saves = () => calls.filter(c => c.path.endsWith('pmu_mobile_save_quote_v1'));

test('session validates Auth and enabled membership using only the original user JWT', async () => {
  const handle = setup();
  const result = await handle(request('session'));
  assert.equal(result.status,200);
  assert.equal((await result.json()).user_id,owner);
  assert(calls.every(c => c.headers.get('authorization') === 'Bearer actual-user-jwt'));
  assert(calls.every(c => c.headers.get('apikey') === config.publishableKey));
  assert.equal(calls.at(-1).body.p_write,false);
  assert.equal(result.headers.get('cache-control'),'no-store');
});

test('missing credentials, malformed Auth identity and disabled membership stop business calls', async () => {
  let handle = setup();
  let result = await handle(new Request(base+'/api/v1/session'));
  assert.equal(result.status,401); assert.equal(calls.length,0);
  handle = setup({authResponse:json({id:'invalid'})});
  assert.equal((await handle(request('snapshot'))).status,401);
  assert.equal(calls.length,1);
  handle = setup({enabled:false});
  assert.equal((await handle(request('snapshot'))).status,403);
  assert.equal(calls.length,2);
});

test('shared database rate denial returns 429 before save and includes retry time', async () => {
  const handle = setup({allowed:false});
  const result = await handle(request('quotes',command));
  assert.equal(result.status,429); assert.equal(saves().length,0);
  assert.equal(result.headers.get('retry-after'),'60');
  assert.equal(calls.at(-1).body.p_write,true);
});

test('save preserves six decimals and original request ID; extra privilege fields never reach RPC', async () => {
  const handle = setup();
  const result = await handle(request('quotes',command));
  assert.equal(result.status,200);
  const body = saves()[0].body;
  assert.equal(body.p_request_id,requestId); assert.equal(body.p_record.price,'9.734513');
  assert.equal(body.p_base_id,null); assert.equal(body.p_customer_revision,'0');
  assert.equal((await result.json()).current_record.delta,'0.034512');
  for (const extra of [{...command,owner_id:other},{...command,record:{...command.record,source_type:'文件导入'}},
    {...command,record:{...command.record,customer_revision:'9'}}]) {
    assert.equal((await handle(request('quotes',extra))).status,422);
  }
  assert.equal(saves().length,1);
});

test('price/date/text validation matches the existing Python contract golden cases', async () => {
  const handle = setup();
  const cases = JSON.parse(await readFile(new URL('./fixtures/contract-golden.json',import.meta.url),'utf8'));
  for (const sample of cases) {
    const result = await handle(request('quotes',{...command,record:sample.input}));
    assert.equal(result.status,sample.accepted ? 200:422,sample.name);
    if (sample.accepted) assert.deepEqual(saves().at(-1).body.p_record,sample.expected,sample.name);
  }
});

test('large JSON, invalid IDs/revisions, missing adjustment reason and malformed body are rejected', async () => {
  const handle = setup();
  for (const invalid of [{...command,customer_revision:'9223372036854775808'},
    {...command,record:{...command.record,price:9.7}}, {...command,request_id:'invalid'},
    {...command,record:{...command.record,note:'x'.repeat(33000)}}]) {
    assert.equal((await handle(request('quotes',invalid))).status,422);
  }
  assert.equal((await handle(request('quotes/001/updates',command))).status,422);
  assert.equal((await handle(request('quotes/123/updates',{...command,record:{...command.record,reason:' '}}))).status,422);
  assert.equal((await handle(new Request(base+'/api/v1/quotes',{method:'POST',headers:{Authorization:'Bearer actual-user-jwt'},body:'{'}))).status,422);
  assert.equal(saves().length,0);
});

test('strict optional text fields reject explicit null rather than silently defaulting them', async () => {
  const handle = setup();
  for (const key of ['material','color','note','reason']) {
    assert.equal((await handle(request('quotes',{...command,record:{...command.record,[key]:null}}))).status,422,key);
  }
  assert.equal(saves().length,0);
});

test('lost save response stays uncertain and recovery reads without resubmitting', async () => {
  const handle = setup({saveThrows:true});
  const failed = await handle(request('quotes',command));
  assert.equal(failed.status,503); assert.match((await failed.json()).message,/原请求编号/);
  const recovered = await handle(request('requests/'+requestId));
  assert.equal(recovered.status,404); assert.equal(saves().length,1);
  assert(!JSON.stringify(await recovered.json()).includes('sensitive'));
});

test('PostgreSQL conflict, member denial and bad date errors are mapped without leaking SQL detail', async () => {
  for (const [code,message,status,expected] of [['P0001','request_id_reused',409,'request_id_reused'],
    ['42501','sensitive sql detail',403,'member_disabled'], ['22007','sensitive date',422,'validation_error']]) {
    const handle = setup({saveResponse:json({code,message},400)});
    const result = await handle(request('quotes',command));
    assert.equal(result.status,status); assert.equal((await result.json()).code,expected);
  }
});

test('snapshot keeps future imports effective and rejects a wrong owner or oversized upstream', async () => {
  let handle = setup({snapshotResponse:json({owner_id:owner,...meta,customers:[],quotes:[
    {...record,effective_date:'2026-11-13',source_type:'导入更新'}, {...record,effective_date:'2026-11-13'}]})});
  const response = await (await handle(request('snapshot'))).json();
  assert.equal(response.quotes[0].scheduled,false); assert.equal(response.quotes[1].scheduled,true);
  assert.equal(response.quotes[1].previous_price,null);
  handle = setup({snapshotResponse:json({owner_id:other,...meta,customers:[],quotes:[]})});
  assert.equal((await handle(request('snapshot'))).status,503);
  handle = setup({snapshotResponse:new Response('x'.repeat(6*1024*1024+1))});
  assert.equal((await handle(request('snapshot'))).status,503);
});

test('history cursor is signed, bound to owner/row/page size, expires and supports cross-instance paging', async () => {
  const first = setup();
  const page = await (await first(request('quotes/123/history?limit=1'))).json();
  assert.equal(typeof page.next_cursor,'string');
  const second = setup();
  assert.equal((await second(request('quotes/123/history?limit=1&cursor='+encodeURIComponent(page.next_cursor)))).status,200);
  const last = calls.at(-1).body;
  assert.equal(last.p_before_id,'123'); assert.equal(last.p_version,'8');
  for (const suffix of ['quotes/123/history?limit=1&cursor='+encodeURIComponent(page.next_cursor+'a'),
    'quotes/124/history?limit=1&cursor='+encodeURIComponent(page.next_cursor),
    'quotes/123/history?limit=2&cursor='+encodeURIComponent(page.next_cursor)]) {
    assert.equal((await second(request(suffix))).status,409);
  }
  const codec = new gateway.CursorCodec(config.cursorSecret);
  await assert.rejects(codec.decode(page.next_cursor,other));
  const expired = await codec.encode({owner_id:owner,id:'123',limit:1,version:'8',epoch:'epoch-1',day:'2026-10-13',date:null,before_id:null,exp:1});
  await assert.rejects(codec.decode(expired,owner));
});

test('invalid backend cursor epoch maps to snapshot_changed while temporary history errors keep 503', async () => {
  let handle = setup({historyResponse:json({code:'P0001',message:'snapshot_changed'},400)});
  assert.equal((await handle(request('quotes/123/history'))).status,409);
  handle = setup({historyResponse:json({code:'unknown',message:'secret'},500)});
  assert.equal((await handle(request('quotes/123/history'))).status,503);
});

test('public health/version, unknown routes and OPTIONS are bounded and do not require Auth', async () => {
  const handle = setup();
  assert.equal((await handle(new Request(base+'/api/v1/health'))).status,200);
  assert.equal((await handle(new Request(base+'/api/v1/app-version'))).status,200);
  assert.equal((await handle(new Request(base+'/api/v1/unknown'))).status,404);
  assert.equal((await handle(new Request(base+'/api/v1/quotes',{method:'OPTIONS'}))).status,204);
  assert.equal(calls.length,0);
  assert.throws(() => gateway.createHandler({...config,publishableKey:'privileged-key'}));
});

test('same handler runs through an actual local HTTP listener', async () => {
  const handle = setup();
  const server = createServer(async (req,res) => {
    const response = await handle(new Request('http://127.0.0.1'+req.url,{headers:req.headers}));
    res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(await response.text());
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const response = await fetch('http://127.0.0.1:'+server.address().port+'/api/v1/session', {headers:{Authorization:'Bearer actual-user-jwt'}});
    assert.equal(response.status,200); assert.equal((await response.json()).user_id,owner);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
