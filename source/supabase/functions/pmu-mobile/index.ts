import {createHandler} from './gateway.ts';

// SUPABASE_URL is platform-provided. Business calls use only a publishable key + user JWT.
// Platform legacy JWT verification is disabled for this function; /auth/v1/user verifies every business request.
let handler;
try {
  handler=createHandler({supabaseUrl:Deno.env.get('SUPABASE_URL'),
    publishableKey:Deno.env.get('PM_MOBILE_PUBLISHABLE_KEY'),cursorSecret:Deno.env.get('PM_MOBILE_CURSOR_SECRET')});
} catch {
  handler=() => new Response(JSON.stringify({code:'backend_unavailable',message:'手机接口配置尚未完成',
    fields:{},retryable:true,trace_id:crypto.randomUUID()}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
Deno.serve(handler);
