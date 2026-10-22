// Dedicated, dependency-free public registration. Admin credentials stay on the server.
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, content-type, authorization, x-client-info",
};
const reply = (status, body) => new Response(JSON.stringify(body), {status, headers});

async function readBody(request) {
  if (!request.body) throw new Error("empty_body");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw new Error("large_body");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(data));
}

async function handleRegistration(request) {
  if (request.method === "OPTIONS") return new Response(null, {status:204, headers});
  if (request.method !== "POST") return reply(405, {code:"method_not_allowed"});
  let body;
  try { body = await readBody(request); } catch { return reply(400, {code:"invalid_request"}); }
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = body?.password;
  if (!/^[a-z0-9_]{3,32}$/.test(username)) return reply(400, {code:"invalid_username"});
  if (typeof password !== "string" || Array.from(password).length < 6 || Array.from(password).length > 256
    || /[\u0000-\u001f]/.test(password)) return reply(400, {code:"invalid_password"});
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return reply(503, {code:"registration_unavailable"});
  const adminHeaders = {apikey:key, Authorization:"Bearer " + key, "Content-Type":"application/json"};
  async function state() {
    const response = await fetch(url + "/rest/v1/rpc/pmu_registration_check", {
      method:"POST", headers:adminHeaders, body:JSON.stringify({p_username:username}),
      signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("state_unavailable");
    const result = await response.json();
    if (!["available", "account_exists", "capacity_full"].includes(result?.code)) throw new Error("invalid_state");
    return result.code;
  }
  try {
    const before = await state();
    if (before !== "available") return reply(409, {code:before});
    const response = await fetch(url + "/auth/v1/admin/users", {
      method:"POST", headers:adminHeaders, signal:AbortSignal.timeout(8000),
      body:JSON.stringify({email:username + "@price-manager.invalid", password, email_confirm:true,
        user_metadata:{pmu_registration:"1.7.1"}}),
    });
    if (!response.ok) {
      const after = await state();
      if (after !== "available") return reply(409, {code:after});
      return reply(503, {code:"registration_unavailable"});
    }
    const user = await response.json();
    if (typeof user?.id !== "string") return reply(503, {code:"registration_unknown"});
    return reply(201, {created:true, username, user_id:user.id});
  } catch {
    // Never echo Supabase errors, submitted passwords, tokens or admin headers.
    return reply(503, {code:"registration_unknown"});
  }
}

Deno.serve(handleRegistration);
