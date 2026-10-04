# 使用 UV 统一账号

插件站通过 UV 登录服务共用有赞身份、canonical UUID 和全局父会话。两站均已发布并启用 SSO，数据库迁移及服务端凭据已准备，真实跨站登录验收待完成。完整架构、旧数据迁移和生产启用顺序见相邻 UV 项目 `docs/shared-auth.md`。

2026-10-02 只读检查确认线上 `/api/session` 返回 `ssoEnabled:true`，审核仍为 `reviewEnabled:false`。对照迁移前业务库备份，4 个旧用户、2 个插件、1 条收藏、2 个快照、2 条资源及 3 条上传的原业务关联均保留；未发现缺失或归属变化，没有人工绑定记录或自动手机号合并。共享认证库当时尚无用户或会话，需在同一浏览器完成 UV 登录、插件自动识别、同一 UUID、刷新保持及双向统一退出的生产验收。

需要先应用 `migrations/0003_shared_auth.sql`，再配置 `SSO_ORIGIN=https://uv.zdwifi.com`、服务端 Secret `SSO_CLIENT_SECRET` 和 `SSO_ENABLED=true`。UV 对应站点 ID 为 `plugin`，精确内部回调为 `https://plugin.zdwifi.com/api/auth/callback`。这不是新的有赞回调，不改变现有 UV 有赞应用配置。

| 接口 | 行为 |
| --- | --- |
| `POST /api/login` | `{next,silent?}`，返回 `authorizationUrl` 并设置短期浏览器绑定 Cookie；启用 SSO 后忽略手机号，不生成手机号账号 |
| `GET /api/auth/callback` | 校验浏览器 state、有效期和唯一参数，通过后端凭据及 PKCE 换取站点会话；票据只用一次 |
| `GET /api/session` | 返回共享用户 `{id,display_name}`、`ssoEnabled=true` 及独立插件管理员状态 |
| `POST /api/logout` | 撤销当前全局父会话，清除插件用户 Cookie；UV 及其他关联站点即刻拒绝关联访问 |
| `POST /api/studio/legacy-link` | 仅原管理员可明确确认旧档案归属，事务迁移收藏/投稿并留审计 |

收藏、投稿、文件、审核、手动上架等业务仍使用原 DB、R2 和队列，未复制 UV 订单或文件存储逻辑。`users` 中的 SSO 行只是使用全局 UUID 的外键引用，不是第二套身份库。所有用户会话权威记录由 UV 的 `AUTH_DB` 管理；本站不向本地 `sessions` 签发 SSO 用户会话。

旧手机号档案默认 `identity_kind=legacy`，不能凭旧 Cookie 或相同手机号认领。管理员核实后向绑定接口提交 `legacyUserId`、已存在的 `globalUserId`、核实依据 `evidence` 与 `confirmed=true`；绑定不可覆盖到其他身份，重试相同映射不会重复迁移。收藏去重、投稿 ID 不变，失败时事务回滚，旧档案保留。

Studio 的 `ADMIN_AUTH_DB` 仍只读，密码与权限规则不变，SSO 用户不会自动得到管理员权限。有赞统一退出撤销关联的普通用户会话；独立密码管理员的 Studio Cookie 使用原退出入口管理。

站点凭据仅放 Worker Secret 或被 Git 忽略的本地 `.dev.vars`，不放 `wrangler.jsonc` 的 vars 或前端。也不要复制 `YOUZAN_CLIENT_SECRET` 和中转密钥到插件项目。后端调用禁止跟随重定向，服务不可用时关闭受保护访问，不回退到手机号身份。

可选 `AUTH_SERVICE` 绑定到 `uv-print-studio` 后可在 Cloudflare 内网调用统一认证；未配置时使用 HTTPS。它不改变客户端凭据校验，也不要求两个 Worker 同时运行才能执行本地单元测试。

本地新增 `tests/security/sso.test.ts` 覆盖用户引用、浏览器绑定、过期/重复回调、实时失效、独立管理员、禁止手机号自动合并、确认迁移及事务回滚；原测试继续覆盖收藏、投稿、上架、下载与只读管理员认证。基础测试环境显式关闭 SSO 以覆盖旧流程，SSO 用例单独开启并使用隔离认证服务，避免继承生产开关或访问生产登录服务。真实生产登录仍需按照 UV 文档联调。
