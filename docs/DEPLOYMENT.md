# 部署与运维手册

## 当前交付边界

本次只实现与测试本地项目；没有创建 GitHub 远程仓库、推送、生产部署、生产迁移、DNS 修改或付费服务。Cloudflare 账户、D1/Queues 资源 ID、真实 GitHub Token、AI 提供商及当前管理员验证数据仍由部署者提供。以下涉及 `--remote`、创建资源或 `deploy` 的命令仅供之后获得授权时执行。

正式建议使用 Workers Paid + Static Assets + D1 + Queues；套餐与配额以上线时官方文档为准。不引入 VPS 或 Redis；新增直传文件使用商店独立私有 R2，不镜像 GitHub Release。Workers Paid 不保证大陆网络改善，也不等于具有中国大陆节点。

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

## 5. 留言箱共享管理员认证

`DB` 保留商店原库；`ADMIN_AUTH_DB` 指向 `boss-message-box`。配置已分别保存两个绑定。管理员登录、权限检查与账号信息只读共享库的 `admins` 表，并要求 `must_change_password=0`；保留 PBKDF2 参数兼容和历史默认验证值拒绝机制，不回退到本地账号表。

商店不写共享库，不复制密码验证记录、留言、会话或密钥。改密与账号恢复在 [留言箱 Studio](https://msg.zdwifi.com/studio) 完成，`pnpm admin set/import` 在共享绑定存在时停用。D1 绑定本身并非只读权限，本项目通过只读查询封装和隔离测试约束运行时代码。

管理员会话仍存商店 `sessions`，沿用独立 host-only Cookie。`subject_id` 对管理员使用带版本的 JSON 标识，包含共享账号 ID 与使用商店主密钥生成的验证记录 HMAC；普通用户格式不变。旧本地账号会话无法转换成共享权限。每次读取会话核验共享账号和 HMAC，留言箱改密、删除账号或设置改密标记后，下次请求拒绝旧会话。管理员认证适配无需新增迁移；不要对 `ADMIN_AUTH_DB` 执行商店迁移。

本地 Wrangler 绑定是独立本地库，不自动读取生产留言箱。`pnpm run check` 与 `pnpm run test:e2e` 使用两个独立临时数据库，只在测试库创建最小账号表与随机盐测试记录。当前只验证本地实现，没有验证生产数据库结构或线上登录。

## 6. Studio配置与验证

直接访问 `/studio`（公共导航不显示入口）。所有管理员权限相同；配置、投稿、同步、重审、下架、删除、恢复及测试均在服务端鉴权、校验Origin并记审计日志。

AI设置填写兼容Chat Completions的Base URL、模型、API Key、超时、有限重试、输入字符预算、输出token预算、附加审核规则。路径会补 `/chat/completions`，已含该路径不会重复追加；不会盲目再补`/v1`。默认不要求response_format，供应商确实支持时才勾结构化输出。测试的是已保存配置；通过只表明接口连通且返回合法结果，不发布插件。超时、余额、429/5xx、拒答、错误JSON都不默认通过。

只有真实材料技术检查完成、明确allow、来源快照重验成功、配置版本/插件revision/锁/管理员状态仍有效才上架。输入预算不足会明确未完成，不截断后放行。修改规则或API配置会创建新审核配置版本；重审可强制重新调用AI。管理员下架/删除会原子清除审核快照、README、附件元数据、关联HTTP缓存、收藏与下载去重记录，只保留最小仓库身份、提交状态/原因和审计；显式恢复必须重新获取材料并审核。Cron另清理超过7天的HTTP缓存。任务页有公开简短原因和仅管理员可见内部依据；生产API只向AI发送必要公开仓库资料。

## 7. 下载源

默认只启用固定 GitHub API asset ID 官方源。URL模板必须包含 `{assetId}`；其他支持变量为 `{owner}`、`{repo}`、`{releaseId}`、`{tag}`、`{filename}`，都逐项编码。允许主机需完整且明确，不支持通配符。官方源地址与允许主机不可被修改为任意代理。

第三方源添加后先保持停用、明确勾选信任、保存，输入已批准插件ID和附件ID测试；成功证明绑定当前完整配置，之后才可启用。修改配置后重新测试。任意公众不能指定来源URL。源优先级数值小的先尝试；HTTPS、公共DNS、重定向逐跳与主机白名单均检查；AI URL同样不能访问内网。

每次下载重新核对官方仓库ID、正式Release、固定asset ID/文件名/大小/更新时间/摘要和tag源码commit。被替换或消失的附件停用。Worker流式发送附件，支持HEAD和单Range，失败不伪装成IPK；GitHub 转发不缓存安装包、不落盘、不存 D1 Blob/R2；直传下载使用独立私有 R2。

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

`deploy`只提供可执行命令，不代表本次执行。`wrangler.jsonc` 已配置商店与留言箱两个独立 D1 绑定；上线前核对目标资源。首次上线再验证真实公开仓库→正式Release→真实AI→自动上架→多架构IPK本地下载哈希；检查下架后旧下载URL被阻止，Cron与Queues真实触发、死信和恢复链路。

## 9. 大陆真实网络测试方法

本次没有大陆测速数据。上线后在真实大陆移动/联通/电信家庭/移动网络分别检查：首页与详情首屏、GitHub README图片、HEAD与完整IPK下载、单Range续传、32MiB附近文件、失败回退。记录日期、运营商、地区、文件字节/哈希、首字节与完整下载时间、失败状态，避免把VPN/海外代理结果当大陆结果。仅使用无害公开测试包；下载次数表示成功开始的尝试，不表示安装人数或完整下载。

参考：[Cloudflare Queues本地开发](https://developers.cloudflare.com/queues/configuration/local-development/)、[Workers测试集成](https://developers.cloudflare.com/workers/testing/vitest-integration/)。

## IPK 直传上线准备

以下是之后由部署者执行的远程步骤，本轮未执行：

1. 创建私有 R2 桶 `plugin-store-uploads`（如采用其他名称，同时修改 wrangler.jsonc 的 bucket_name）。保留 `UPLOADS` 绑定；不要启用 r2.dev 公共访问或公开桶域名。先确认账户已启用 R2 及其费用/配额。
2. 备份商店 DB，应用商店迁移 `0002_uploads.sql`（`pnpm db:migrate:remote` 的目标仍是 **DB**）。新增列有默认值，旧的 GitHub 数据保持有效；不要在 **ADMIN_AUTH_DB** 执行迁移。
3. 部署包含直传适配的新 Worker 和前端。缺少绑定时直传返回明确配置错误，旧 GitHub 功能不依赖 R2；新代码需先具备新增表/列。
4. 使用无害 IPK 真实验证上传、审核、普通下载/Range、新版本替换及下架后禁止下载。确认 R2 无公开访问，访客无法取得待审核包。真实 AI 结果不能用本地 fixture 代替。

本地 `pnpm setup:local` 或 `pnpm db:migrate:local` 应用所有商店迁移；开发使用 Wrangler 的本地模拟 R2，配置没有 remote:true。测试使用临时 D1/R2，完全隔离远程数据。

D1 备份仅包含元数据，恢复直传需同时恢复对应 R2 对象；对象缺失/改变会阻止审核和下载。当前候选及已批准包保留；旧候选和孤立对象满一天由 Cron 分批回收，管理员“删除”清理该插件全部直传文件。“下架”保留最新私有包以便显式恢复重审。存储限额当前每识别档案 128 MiB，管理员投稿合并计算；限制值和清理策略见 DECISIONS.md。

## Cloudmersive 直传包查毒

直传包的队列审核先查毒再调用 AI，GitHub 投稿流程不变。服务端固定调用官方 `POST https://api.cloudmersive.com/virus/scan/file/advanced`，以 `Apikey` 请求头及 multipart `inputFile` 传递文件。允许程序、脚本和 HTML 文件类型，禁止无效文件、加密内容及不安全归档；不把“存在可执行文件”当成病毒。

本地开发在被 Git 忽略的 `.dev.vars` 中配置 `CLOUDMERSIVE_API_KEY`。生产由部署者在 Worker 的 Secrets 中配置同名变量，或在项目目录执行以下交互命令，密钥只粘贴到隐藏输入中，不写入命令参数、wrangler.jsonc 或 Git：

```sh
pnpm exec wrangler secret put CLOUDMERSIVE_API_KEY
```

该命令会修改远程配置，由部署者自行执行；本次实现未执行它，也未部署。无需新增数据库迁移，`ADMIN_AUTH_DB` 不参与查毒。

`CLOUDMERSIVE_MAX_SCAN_BYTES` 可选，默认 `3500000` 字节，按免费套餐限制起步。限制针对**包内普通文件重新整理后的未压缩 TAR**，包含文件头和对齐空间，并非 IPK 压缩文件大小。因此压缩包小于 3.5 MB 也可能超限。升级套餐并确认该端点额度后才调整此值，最高允许 64 MiB，原 IPK 解包预算仍有效。不截断文件、不仅扫描前缀、不因部分内容通过而放行整个包。

每次实际审核直传包调用一次查毒 API，不缓存查毒结论；现有已上架直传包跳过 Cron 的策略保持不变，需手动重新检查才能再次查毒。API 超时为 60 秒，429/5xx、网络和返回格式错误使用现有队列有限重试；每次重试可能再次消耗查毒额度。免费额度每秒一次，并行审核可能触发 429。401/403 为等待配置，文件超限/不能扫描为检查未完成，检出威胁为拒绝。更新候选未通过时沿用原有保留已批准版本的逻辑。

文件外发仅包含 IPK 内部文件，不包含手机号、会话、商店密钥或提交者身份；上传表单说明第三方处理。API 原始错误/威胁字段不透传到页面、日志或 AI。已有已批准快照不会自动补上查毒记录，管理员需重新检查；新扫描策略的指纹隔离旧 AI 缓存。

本地测试仅用隔离响应验证协议和审核闭环，没有使用真实 Key，也未进行真实文件/EICAR 联调。官方文档：<https://api.cloudmersive.com/docs/virus.asp>。

## 管理员手动上架

Studio → 插件管理 → 手动上架 → 确认手动上架。支持 GitHub 与直传 IPK，无需 AI/查毒配置或对应源码，仍须有结构可读取且身份未改变的真实安装包。确认会公开当前候选版本并开放下载；详情明确标记未经自动审核或查毒。不是为整个插件永久免审：作者上传新版本、管理员主动同步/重审仍走原有审核。

已手动上架版本不参加 Cron 自动同步，避免后台自动检查覆盖人工决定；若需跟进 GitHub 新版，请主动同步。已下架包可通过该按钮显式重新上架；删除后已清理的直传文件须重新上传。操作会写商店 DB 审计，并取消该插件的旧活动任务。无需新增迁移，不写 ADMIN_AUTH_DB。
