# 部署与运维手册

## 当前交付边界

本次只实现与测试本地项目；没有创建 GitHub 远程仓库、推送、生产部署、生产迁移、DNS 修改或付费服务。Cloudflare 账户、D1/Queues 资源 ID、真实 GitHub Token、AI 提供商及当前管理员验证数据仍由部署者提供。以下涉及 `--remote`、创建资源或 `deploy` 的命令仅供之后获得授权时执行。

正式建议使用 Workers Paid + Static Assets + D1 + Queues；套餐与配额以上线时官方文档为准。不存在 VPS、Redis、R2 安装包镜像。Workers Paid 不保证大陆网络改善，也不等于具有中国大陆节点。

## 1. 本地准备

使用 Node 24（至少22.13），pnpm版本由 packageManager 固定。先执行：

```sh
cd /Users/dawn/Personal/NRadio/Github/plugin_store
nvm use
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

`setup:local` 只在缺少 `.dev.vars` 时生成本商店独立随机主密钥/HMAC密钥并设置 `http://127.0.0.1:5173` 为来源；已有配置不会被覆盖。随后只应用本地 D1 迁移。访问相同的 `http://127.0.0.1:5173`（不要混用 localhost，否则写请求来源校验失败）。可在 `.dev.vars` 填入只读 GitHub Token；不要复用旧站 Secrets。

`pnpm dev` 通过 Cloudflare Vite 插件运行实际 workerd、D1 与本地队列。默认无插件、无管理员、无AI密钥，提交会如实停在等待配置/检查状态，不预置假上架数据。测试样例仅存在隔离测试目录。

## 2. 新建 Cloudflare 资源（未来上线步骤，尚未执行）

先核对账户与资源名称，不在未知账户运行命令。以下均可能创建远程资源：

```sh
pnpm exec wrangler login
pnpm exec wrangler d1 create plugin-store
pnpm exec wrangler queues create plugin-review
pnpm exec wrangler queues create plugin-review-dead
```

将返回的 D1 UUID 填入 `wrangler.jsonc` 的 `d1_databases[0].database_id`，保留绑定 `DB`；队列生产者绑定 `JOBS` 指向 `plugin-review`，消费者批量1、最大并发2、三次队列重试、死信队列 `plugin-review-dead`。D1任务本身另有四次执行上限、锁令牌、10分钟租约和可恢复入队，不依赖队列恰好一次投递。

Cron 为 `0 4,16 * * *`（UTC），对应北京时间每天12:00、24:00启动扫描。每批25个仓库，后续批次发队列；恢复每批最多50个待入队任务。队列故障期间仍保存任务，下一次Cron或Studio重试可恢复。不是承诺所有仓库整点完成。可在本地用 Wrangler 的 scheduled 测试入口验证；自动测试直接调用相同 scheduled/queue 导出并断言行为。

## 3. Secrets 与环境配置

必须配置两个全新随机Secrets；例如先各自独立运行 `openssl rand -base64 32`，再安全输入（不要写入文档、URL、聊天记录或提交）：

```sh
pnpm exec wrangler secret put MASTER_KEY
pnpm exec wrangler secret put PHONE_HMAC_KEY
pnpm exec wrangler secret put GITHUB_TOKEN
```

- `MASTER_KEY`：派生AES-GCM密钥，保护D1中的AI Key；至少32字符高熵随机值。遗失后无法恢复原AI Key，需重新配置。
- `PHONE_HMAC_KEY`：号码索引/匿名限流及统计身份HMAC；至少32字符。不要任意更换，否则同号码会生成另一索引，历史档案失去匹配。
- `GITHUB_TOKEN`：服务端只读公开仓库元数据与Contents权限，建议使用权限最小的有效Token。仅发送给 GitHub API 主机，不发送给下载重定向目标或AI。
- `APP_ENV=production`，`APP_ORIGIN=https://plugin.zdwifi.com`；生产缺少主密钥、号码密钥或HTTPS来源时API拒绝工作。
- `MAX_IPK_BYTES=33554432` 是单IPK默认32MiB保护参数，配置范围受实现内存预算约束；不是最终业务套餐上限。
- `DAILY_AI_BUDGET=100` 为UTC日新增审核任务调用预算（内部有限重试另计请求），缓存相同材料结果；Studio连通性测试有单独限流。上线前按费用配置。

真实Secrets、`.dev.vars`、凭据导出、SQLite、备份、Wrangler日志都被 `.gitignore` 排除。不要将完整D1导出混入可公开源码。生产API没有测试模式/固定allow开关；`APP_ENV=test`只影响隔离环境会话Cookie，不替换GitHub或AI适配器。

## 4. 迁移、备份与恢复（远程步骤尚未执行）

先备份再迁移；下载包从来不存D1，备份只有业务元数据/密钥密文等敏感记录：

```sh
mkdir -p backups
chmod 700 backups
pnpm exec wrangler d1 export DB --remote --output backups/before-migration.sql
chmod 600 backups/before-migration.sql
pnpm db:migrate:remote
```

本地迁移可重复执行 `pnpm db:migrate:local`；D1迁移记录保证已应用迁移不重跑。备份与MASTER_KEY/HMAC_KEY分别安全保管，备份不得公开。恢复先在隔离D1数据库演练、核对schema与计数，再经授权导入目标库；切勿直接把旧老板留言箱数据库恢复到本商店。

```sh
# 仅用于隔离恢复演练的本地数据库，不触及生产
pnpm exec wrangler d1 execute DB --local --file backups/before-migration.sql
```

生产恢复可能覆盖现有数据，应先停消费与写入、备份当前库并核对目标；本项目不提供无确认的“一键生产覆盖”。旧部署版本回滚不自动逆转数据库迁移，保留兼容schema后再切流量。

## 5. 管理员安全导入/设密

当前管理员凭据尚未导入。只读核对的旧实现为 `pbkdf2-sha256$iterations$saltBase64URL$hashBase64URL`，PBKDF2 SHA-256，参数100000–2000000、至少16字节盐和32字节结果。本商店保留算法参数兼容；拒绝旧迁移中公开默认验证值的单向指纹，不恢复旧默认密码。

必须从确认当前有效的来源取得最小账号导出文件（JSON数组），字段仅为 `username`、`password_hash`、`must_change_password`，可包含旧 `id`；`must_change_password`须0/false。不要导出旧会话、业务记录或Secrets。文档不示例真实hash/账号。

```sh
chmod 600 credentials/current-admins.json
pnpm admin import --trusted-current-export credentials/current-admins.json --local
# 没有可信现有凭据时，创建本商店的新账号并交互设置强密码：
pnpm admin set --username YOUR_ADMIN_NAME --local
```

CLI逐账号隐藏输入当前密码验证hash匹配，校验全部账号后才写入，生成本商店新ID；不复用旧会话。设密时隐藏输入两次，新密码要求14–128字符、至少8种不同字符且不得包含已知弱默认口令片段，建议使用密码管理器生成的随机长密码。不得传命令行明文密码。输入导出文件权限须600；临时SQL与日志仅保留在私有临时目录，完成后清理。对既有本商店账号更新密码时，数据库触发器原子使该管理员的旧本商店会话失效。

未来确实要操作远程时必须显式同时使用 `--remote --confirm-remote`（本次未执行）。不将一次导入宣传为SSO，后续两站改密不会自动同步。本商店用户与管理员分别使用host-only Cookie，生产Cookie带`__Host-`/Secure/HttpOnly/SameSite=Lax，无父域Cookie。

## 6. Studio配置与验证

直接访问 `/studio`（公共导航不显示入口）。所有管理员权限相同；配置、投稿、同步、重审、下架、删除、恢复及测试均在服务端鉴权、校验Origin并记审计日志。

AI设置填写兼容Chat Completions的Base URL、模型、API Key、超时、有限重试、输入字符预算、输出token预算、附加审核规则。路径会补 `/chat/completions`，已含该路径不会重复追加；不会盲目再补`/v1`。默认不要求response_format，供应商确实支持时才勾结构化输出。测试的是已保存配置；通过只表明接口连通且返回合法结果，不发布插件。超时、余额、429/5xx、拒答、错误JSON都不默认通过。

只有真实材料技术检查完成、明确allow、来源快照重验成功、配置版本/插件revision/锁/管理员状态仍有效才上架。输入预算不足会明确未完成，不截断后放行。修改规则或API配置会创建新审核配置版本；重审可强制重新调用AI。管理员下架/删除会原子清除审核快照、README、附件元数据、关联HTTP缓存、收藏与下载去重记录，只保留最小仓库身份、提交状态/原因和审计；显式恢复必须重新获取材料并审核。Cron另清理超过7天的HTTP缓存。任务页有公开简短原因和仅管理员可见内部依据；生产API只向AI发送必要公开仓库资料。

## 7. 下载源

默认只启用固定 GitHub API asset ID 官方源。URL模板必须包含 `{assetId}`；其他支持变量为 `{owner}`、`{repo}`、`{releaseId}`、`{tag}`、`{filename}`，都逐项编码。允许主机需完整且明确，不支持通配符。官方源地址与允许主机不可被修改为任意代理。

第三方源添加后先保持停用、明确勾选信任、保存，输入已批准插件ID和附件ID测试；成功证明绑定当前完整配置，之后才可启用。修改配置后重新测试。任意公众不能指定来源URL。源优先级数值小的先尝试；HTTPS、公共DNS、重定向逐跳与主机白名单均检查；AI URL同样不能访问内网。

每次下载重新核对官方仓库ID、正式Release、固定asset ID/文件名/大小/更新时间/摘要和tag源码commit。被替换或消失的附件停用。Worker流式发送附件，支持HEAD和单Range，失败不伪装成IPK；不缓存安装包、不落盘、不存D1 Blob/R2。

`X-Reviewed-SHA256`为审核时实际计算的摘要，用户可下载后校验。源测试只校验短前缀与响应元数据；纯流式发送无法在发出任何字节前算完整文件哈希，不声明任意第三方镜像已逐字节预验证。DNS预检查与实际连接解析由不同层完成，仍依赖Workers网络层对解析/私网的限制；谨慎仅允许受信公共下载主机。

## 8. 域名、部署与许可证

暂用 **plugin.zdwifi.com**。用户此前误写 **plugin.zdfiwi.com**；上线前必须确认拼写，再核对APP_ORIGIN、DNS与Workers自定义域。开发阶段未操作DNS。域名确认并已授权上线后，可在 `wrangler.jsonc` 顶层加入以下配置（当前模板未绑定域名）：

```json
"routes": [{ "pattern": "plugin.zdwifi.com", "custom_domain": true }]
```

该配置仅供未来部署；需目标域名所属 zone 已接入同一 Cloudflare 账户，且与 `APP_ORIGIN` 一致。

正式发布前先公开本项目完整对应源码及构建配置、锁文件、许可证/修改声明，替换 `public/SOURCE.txt` 中待填写的对应源码地址。上游GPL-3.0适用代码保留原版权/许可，不能把旧市场安装API当本商店功能。源码地址尚未创建并不表示许可证义务已经通过线上交付验证。

```sh
pnpm check
pnpm test:e2e
# 未来获得授权并完成上述配置后才执行：
pnpm deploy
```

`deploy`只提供可执行命令，不代表本次执行。`wrangler.jsonc` D1 UUID仍为占位值，上线前替换。首次上线再验证真实公开仓库→正式Release→真实AI→自动上架→多架构IPK本地下载哈希；检查下架后旧下载URL被阻止，Cron与Queues真实触发、死信和恢复链路。

## 9. 大陆真实网络测试方法

本次没有大陆测速数据。上线后在真实大陆移动/联通/电信家庭/移动网络分别检查：首页与详情首屏、GitHub README图片、HEAD与完整IPK下载、单Range续传、32MiB附近文件、失败回退。记录日期、运营商、地区、文件字节/哈希、首字节与完整下载时间、失败状态，避免把VPN/海外代理结果当大陆结果。仅使用无害公开测试包；下载次数表示成功开始的尝试，不表示安装人数或完整下载。

参考：[Cloudflare Queues本地开发](https://developers.cloudflare.com/queues/configuration/local-development/)、[Workers测试集成](https://developers.cloudflare.com/workers/testing/vitest-integration/)。
