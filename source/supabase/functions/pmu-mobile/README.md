# pmu-mobile HTTPS业务网关

原生安卓首期的Supabase Edge候选。接口合同见根目录`server/openapi.json`；完整部署、备份、授权与回滚见[部署确认](../../../../docs/Supabase托管网关与自动签名部署确认.md)。当前未部署真实云。

- index.ts注册Deno.serve；gateway.ts只依赖标准Web API，无npm远程运行依赖。
- 每个业务请求向Auth验证原用户JWT，核对启用成员，再以公开Key和同一JWT调用REST/RPC；不使用service-role。
- 共享限流依赖[mobile_gateway_v1.sql](../../../migrations/mobile_gateway_v1.sql)，60秒滚动窗口读120/写30；业务还依赖原同步SQL v1。
- config.toml仅新增pmu-mobile的verify_jwt=false；函数自行验证JWT。公开health/version用于准备，业务路径认证不可省略；pmu-register配置保持原状。
- 环境：平台SUPABASE_URL、自设PM_MOBILE_PUBLISHABLE_KEY、至少32随机字节的PM_MOBILE_CURSOR_SECRET。秘密须跨实例一致。
- 支持/api/v1及/functions/v1/pmu-mobile/api/v1路径；安卓基础地址为https://fvnacayonhyretsqcqqc.supabase.co/functions/v1/pmu-mobile。
- 请求体32KiB、上游响应6MiB、上游15秒超时、不跟随重定向；原请求编号核对，保存不自动重发。历史游标账号/记录/页长/版本/日期绑定，10分钟到期。
- 仅每账号共享限流已实现；独立全局IP配额未实现。平台外层保护、真实手机网络和Edge配额需部署实测。

辅助测试（仓库根）：`node --test source/supabase/functions/pmu-mobile/tests/gateway.test.mjs`，Node24.11本轮通过；fixtures由未改的Python校验器生成。控制上游替代真实Auth/REST，不能视为Deno部署或云/手机通过。APK和最后联测状态以部署确认及检查点为准。
