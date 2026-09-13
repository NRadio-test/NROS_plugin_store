# 张导插件商店

IPK 插件市场。作者可以提交公开 GitHub 仓库，也可以填写资料后直接上传 IPK；两者走同一套自动审核，通过后上架，访客从站内下载入口把安装包保存到本地。项目路径 `/Users/dawn/Personal/NRadio/Github/plugin_store`。

## 本地启动

需要 Node.js 24 与项目指定的 pnpm。若用 nvm，先按 `.nvmrc` 切换。

```sh
cd /Users/dawn/Personal/NRadio/Github/plugin_store
nvm use
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

打开 `http://127.0.0.1:5173`。`setup:local` 生成独立随机开发密钥、写入本地站点来源并应用本地 D1 迁移，不会覆盖已有 `.dev.vars`。开发资料放在 `.dev.vars` / `.wrangler/`，不随源码公开。换主机或端口时要同步改 `.dev.vars` 的 `APP_ORIGIN`，否则写操作会被来源校验拒绝。

启动后市场为空是正常的——还没有通过审核的插件。普通登录只填自报手机号。GitHub 投稿会真实访问 GitHub（无 token 时受匿名配额限制）；没有配置 AI 时任务停在等待配置，不会自动上架。

### 受限环境下的启动排错

| 现象 | 处理 |
| --- | --- |
| `EMFILE: too many open files`（Vite 文件监听） | 放开文件监听限制，或提高 `ulimit -n`。 |
| `EPERM: operation not permitted`（Miniflare 把开发注册表写在用户目录） | 改为项目内路径：`MINIFLARE_REGISTRY_PATH="$PWD/.wrangler/registry" pnpm dev`。换注册表路径会生成新的本地库，需要重跑 `pnpm db:migrate:local`。 |

启动成功只需确认 `/`、`/studio`、`/api/plugins` 返回 200。

## 管理员登录

Studio 使用留言箱的当前账号，通过 `ADMIN_AUTH_DB` 绑定读取，不使用商店自己的 `admins` 表，也不导入或恢复旧默认密码。改密在留言箱完成；商店的 Cookie、会话、限流、审计与业务数据仍保存在商店 `DB`。留言箱改密或删号后，已有商店会话会在下次请求失效。

本地 Wrangler 的共享绑定是空的本地库，不会连到生产留言箱；隔离测试自行创建模拟账号库。

## IPK 直接上传

在「提交插件」选择「直接上传 IPK」，先填写名称、简介、使用教程，再选择一个 `.ipk`（最大 32 MiB）。版本与架构从包内读取，详情页展示作者填写的教程。上架前走同一套静态检查与 AI 审核。

作者在「我的提交」里可以上传新版本或重新检查，管理员也可以在 Studio 的插件详情里上传新版本。新版本审核期间旧的批准版本仍可下载，未批准的版本没有公开下载地址。

直传 IPK 无需提供 GitHub 源码。后台将包内全部普通文件整理为标准 TAR，发送至 Cloudmersive 查毒，再由 AI 审核脚本、结构及提交资料。未配置、超限或未确认扫描通过时不会发布候选版本。

上线前需要两件事：商店 `DB` 应用 `0002_uploads.sql`；建私有 R2 桶 `plugin-store-uploads` 并绑定 `UPLOADS`。详见[部署说明](docs/DEPLOYMENT.md)。

## 页面

| 地址 | 内容 |
| --- | --- |
| `/` | 名称/描述搜索（`/` 或 `⌘K` 聚焦）、最近更新/收藏最多/下载最多排序、分页、行内作者与收藏下载 |
| `/plugins/:id` | 面包屑与信息头、README 或使用教程、安装包与校验、审核信息三个标签页、GitHub 链接、SHA-256、多附件选择 |
| `/login` | 手机号识别 |
| `/submit` | GitHub 仓库 / 直接上传 IPK 两种投稿方式、收录要求与流程 |
| `/me` | 我的提交（含上传新版本）、我的收藏 |
| `/studio` | 管理员登录；侧栏七个面板：总览、插件管理、审核任务、操作日志、AI 设置、下载源、账号安全 |

视觉沿用留言箱的深海军蓝与信号青配色，深浅双主题，375–1440px 适配。令牌、组件与验证方式见[设计系统](DESIGN_SYSTEM.md)。

详情页有独立 URL 与 title/description；robots/sitemap 排除个人页与管理页。首版是 SPA，不保证搜索引擎完整收录。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 本地 Vue 与真实 Worker 运行时 |
| `pnpm run check` | 前后端类型检查、lint、Worker 与单元测试、颜色对比度、热更新回归、生产构建与产物隔离 |
| `pnpm run test:e2e` | 构建并跑隔离浏览器端到端验收（外部服务用 fixture） |
| `pnpm run build` | 构建浏览器静态文件与 Worker |
| `pnpm db:migrate:local` | 本地 D1 迁移 |
| `pnpm admin --help` | 共享账号管理说明 |
| `pnpm db:migrate:remote` | 生产 D1 迁移，自行安排 |
| `pnpm deploy` | 部署命令，自行安排 |

## 目录

```text
src/                  Vue 页面、组件、同源 API 客户端与 Markdown 净化
worker/               GitHub / AI / IPK / 上传 / 下载适配器、认证与持久任务
migrations/           D1 表、约束与索引
scripts/              本地初始化、账号工具与隔离测试
tests/                Worker 集成、恶意归档、网络故障与浏览器验收
public/               许可、对应源码说明、静态资源
docs/                 作者、部署、决策、验收与上游记录
wrangler.jsonc        Workers / D1 / Queues / R2 / Cron 模板
```

## 仍需配置

- `GITHUB_TOKEN`：正式同步建议使用认证 API，尚未做真实 token 联调。
- AI：在 Studio 配置 Base URL、模型、API Key、超时与预算后测试连通性。密钥在服务端加密，读取只返回掩码。
- Cloudflare：D1 真实 ID、队列与死信队列、私有 R2 桶、Secrets、站点来源与域名。正式运行建议 Workers Paid。见[部署指南](docs/DEPLOYMENT.md)。
- 域名按 `plugin.zdwifi.com`；上线前核对，本地阶段不动 DNS。
- 对外提供构建产物前，把对应源码公开地址填进 `public/SOURCE.txt`（本项目采用 GPL-3.0）。

## 已知边界

支持 `ar` 与 `tar.gz` 外封装，内部 `control.tar`/`data.tar` 可为 tar 或 gzip。xz/zstd、PAX/GNU 扩展、嵌套归档、资源超限或核心材料不足都会停在「检查未完成」，不会当作通过。GitHub 投稿的二进制保留静态清单、摘要与源码关联检查；直传 IPK 另接入 Cloudmersive 查毒。两者均没有动态沙箱或可复现构建。默认预算与取舍见[工程决策](docs/DECISIONS.md)。

下载只接受站内插件与附件标识：GitHub 包在官方源核验身份后流式转发，直传包校验私有对象与已批准快照一致后流式返回。支持 HEAD、单 Range、附件文件名与连接取消。纯流式分发无法在发出首字节前校验整包哈希；第三方下载源需要管理员测试并显式信任。

下载数是通过站内入口成功开始的尝试，不代表下载完成或安装人数。手机号是自报识别，服务端限流不解决号码冒用。

## 许可与统计

基于 AstrBot 独立市场的适用组件修改，本项目源码采用 [GPL-3.0](LICENSE)，不提供担保，见[对应源码说明](public/SOURCE.txt)。插件许可以各仓库或作者声明为准。上游复用记录见[上游与对应源码](docs/UPSTREAM.md)与[第三方声明](THIRD_PARTY_NOTICES.md)。

投稿前请读[作者指南](docs/AUTHOR_GUIDE.md)。
