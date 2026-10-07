# 独立统一登录（API v1）

插件商店使用 `https://auth.zdwifi.com` 的 `zdwifi-auth` Worker。协议来源为相邻认证项目的 `docs/INTEGRATION.md`；有赞授权、回调、资料和中央会话由认证服务负责，本站只保留业务接口和本站 HttpOnly Cookie。

## 配置

`wrangler.jsonc` 已配置 `SSO_ENABLED=true`、`SSO_ORIGIN=https://auth.zdwifi.com`、`APP_ORIGIN=https://plugin.zdwifi.com`，以及 `AUTH_SERVICE → zdwifi-auth` Service Binding。无 Service Binding 时同一套后端代码使用认证域 HTTPS；两种方式均携带本站 Bearer，禁止跟随重定向。

认证服务的站点 ID 为 `plugin`，登记回调为 `https://plugin.zdwifi.com/api/auth/callback`，`identity_fields=[]`。本站不请求 openId、手机号或商家权限，不需要中央用户库绑定、有赞密钥或中转密钥。

部署前需确认插件站 Worker Secret `SSO_CLIENT_SECRET` 与中央 `SSO_CLIENT_KEYS.plugin` 一致。密钥只保存在服务端 Secret 或被 Git 忽略的本地配置中，不能放进 vars、前端或 Git。此次本地适配没有读取或更改实际密钥，也没有验证生产密钥是否匹配。

## 本站接口

| 接口 | 行为 |
| --- | --- |
| `POST /api/login` | `{next,silent?}`；映射到中央 `start` 的 `interactive: !silent`，返回授权地址并设置十分钟浏览器绑定 Cookie |
| `GET /api/auth/callback` | 校验浏览器 Cookie、state、期限及唯一参数；由后端使用 PKCE 交换一次性票据，设置本站 Cookie |
| `GET /api/session` | 实时中央 `check`，返回公开资料及独立管理员状态；不向前端提供会话 token |
| `POST /api/account/profile/sync` | 调用中央 `profile` 获取昵称、头像；资料失败不撤销有效身份 |
| `POST /api/logout` | 撤销当前中央会话及关联的站点会话；成功后清除本站用户 Cookie |
| `POST /api/studio/legacy-link` | 保留人工核实后绑定旧档案的管理接口，目标必须是本站已有的已验证全局用户引用 |

用户 Cookie 为 `__Host-plugin_store_user`，短期绑定为 `__Host-plugin_store_sso_attempt`；生产均使用 host-only、Secure、HttpOnly、SameSite=Lax、Path=/。中央截止时间按 Unix 毫秒读取，Cookie Max-Age 转换为秒。前端只通过本站后端查资料，不跨域读取中央 Cookie。

每次受保护请求实时验证中央会话，不缓存成功结果，不另行签发独立于中央会话的长效用户会话。首次打开和重新激活页面会尝试静默复用中央登录；用户退出后，关联网站的后续验证会失败。管理员密码会话仍独立管理。

## 错误与数据边界

只有中央 `401 session_expired` 才表示会话已失效，本站清除对应用户 Cookie。`401 invalid_client`、配置错误、404、服务中断均作为服务不可用处理，不误报退出成功、不清除仍可能有效的 Cookie。退出只有 `{ok:true}` 或确认会话过期才视为完成。资料同步的 `503 profile_unavailable` 保留登录，允许稍后重试。

收藏、投稿、文件、审核继续使用原商店 DB、R2 和队列。`users` 的 SSO 行只是中央 UUID 的业务外键引用，已有全局 ID 和业务关联原样保留；不按手机号合并、不生成替代身份。

新版中央协议没有 `/internal/user` 查询接口。旧手机号档案绑定时，目标账号需先通过统一登录进入本站，建立已验证的 SSO 引用；管理员仍须提供 `legacyUserId`、`globalUserId`、已核实依据 `evidence` 和 `confirmed=true`。事务迁移收藏与投稿，保留旧档案和审计，不覆盖已有绑定。该流程不会自动运行。

Studio 继续从 `ADMIN_AUTH_DB` 只读认证留言箱管理员，不接收有赞账号的管理员声明，不复制 UV 的自动授予逻辑。

## 迁移与本地验证

本次适配复用现有 `0003_shared_auth.sql`，没有新增数据库迁移。已有 SSO 数据无需重建。旧中央服务签发且新服务不认可的会话会被视为过期，重新登录即可；账号数据不随 Cookie 清除。

常规验证：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。独立认证 Worker 与插件 Worker 的本地协议联调：

```sh
node scripts/test-auth-integration.mjs ../zdwifi-auth-worker
```

该脚本只读取认证项目源码和迁移，使用临时本地 D1、测试凭据和模拟有赞响应；验证真实两个 Worker 的 Service Binding、同一全局 ID、静默复用、刷新、统一退出、站点隔离和回调重放。它不读取实际密钥、不访问生产、不等同于真实有赞账号验收。

上线后仍需在同一浏览器验证认证域登录、本站回调、刷新保持、另一个已接入网站免重复授权，以及两站统一退出。不能用匿名入口返回 401 代替真实登录验收。
