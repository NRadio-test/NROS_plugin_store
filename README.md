# 张导插件商店 V1

独立的 GitHub Release IPK 插件市场。用户或管理员提交公开仓库链接，持久化任务读取真实 README、Release 源码与 IPK，经过受限静态检查和 OpenAI 兼容 API 审核后自动上架。访客从商店下载入口经 Worker 获取已审核附件，直接保存至本地。

项目路径：`/Users/dawn/Personal/NRadio/Github/plugin_store`。本项目没有创建 GitHub 远程仓库，没有推送或部署生产，也没有执行生产迁移、修改 DNS 或购买服务。

## 本地启动

使用 Node.js 24 与项目指定的 pnpm。若使用 nvm，先按 `.nvmrc` 切换；首次缺少该 Node 版本时执行 `nvm install`。

```sh
cd /Users/dawn/Personal/NRadio/Github/plugin_store
nvm use
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

打开 `http://127.0.0.1:5173`。`setup:local` 生成独立随机开发密钥、设置本地站点来源并执行本地 D1 迁移；不会覆盖已有 `.dev.vars`。开发资料保存在忽略的 `.dev.vars` / `.wrangler/`，不能随源码公开。更换主机或端口时，应同步调整 `.dev.vars` 的 `APP_ORIGIN`，否则写操作会被来源校验拒绝。

初始化之后市场可能为空，这是没有已审核发布的正常状态。普通登录只填写自报手机号，不需要管理员账号。投稿流程会真实访问 GitHub；没有 GitHub token 时受匿名 API 配额限制，没有 AI 配置时任务保留为等待配置，绝不自动上架。

### 受限环境下的启动排错

在文件监听或用户目录写入被限制的环境（部分沙箱、CI 容器）里，`pnpm dev` 可能报两类错误，都不属于项目代码问题：

| 现象 | 处理 |
| --- | --- |
| `EMFILE: too many open files`（Vite 文件监听） | 放开本地文件监听限制，或提高 `ulimit -n`。 |
| `EPERM: operation not permitted, open ...`（Miniflare 开发注册表写在用户目录） | 改为项目内路径再启动：`MINIFLARE_REGISTRY_PATH="$PWD/.wrangler/registry" pnpm dev`。 |

验证启动成功只需确认三个地址返回 200：`/`、`/studio`、`/api/plugins`。


在你自己的交互终端设置一个本商店管理员，或按部署指南安全导入当前有效管理员验证数据：

```sh
pnpm admin set --username YOUR_ADMIN_NAME --local
```

命令隐藏读取两次密码，不接受命令行密码或公开默认口令。然后直接打开 `http://127.0.0.1:5173/studio`，配置并测试 AI 接口。公共页面没有 Studio 导航入口。当前旧站管理员验证数据尚未导入，不能把新设本地管理员描述为已复用原密码。

## 已实现的界面与业务

| 地址 | 功能 |
| --- | --- |
| `/` | 英雄区、名称/description 搜索（`/` 或 `⌘K` 聚焦）、最近更新/最受欢迎/下载最多三种排序、分页、收藏与下载统计、卡片内收藏与下载 |
| `/plugins/:id` | 面包屑与信息头、作者真实 README（说明文档 / 安装包与校验 / 审核信息 三个标签页）、GitHub 链接、展示与源码快照、当前已审核版本、IPK 架构/大小/SHA-256；多个附件明确选择，移动端底部粘性操作条 |
| `/login` | “张导小店绑定手机号”自报识别，不验证号码或小店绑定 |
| `/submit` | GitHub 公开仓库投稿、收录要求与流程时间线、明确任务状态与后台处理提示 |
| `/me` | 档案头与统计、我的提交 / 我的收藏 两个标签页、公开审核原因、手动检查原仓库、退出登录 |
| `/studio` | 独立管理员登录；侧栏包含总览、插件管理、审核任务、操作日志、AI 设置、下载源、账号安全七个面板：提交/同步/重审/下架/删除/显式恢复、插件详情抽屉（快照、附件、任务、审计）、AI 配置与连通性测试、下载源配置与针对具体资产的测试、修改密码 |

界面为完整重做的一体化设计系统：电光蓝强调色、语义状态徽章、骨架屏、Toast、模态与抽屉、深浅双主题、375–1440px 全区间适配。设计令牌、组件清单与验证方式见 [设计系统](DESIGN_SYSTEM.md)。

主题支持浅色/深色并记忆用户选择，跟随系统默认。详情有独立 URL 与 title/description；robots/sitemap 排除个人和管理界面。首版是 SPA，不承诺所有搜索引擎完整收录。

后端采用 Workers Static Assets + Hono API + D1 + Queues + Cron。任务有 revision、有限重试、过期锁、恢复入队及死信配置；旧任务无法覆盖新版或恢复管理员已停用插件。GitHub 403/429/5xx 按临时异常处理；单次 404 不自动删库。

下载只接受站内插件/附件标识，从 D1 查询已批准资产，并在官方源核验身份后流式转发。支持 HEAD、单 Range、附件文件名、受控错误、连接取消与下载尝试去重。不接受任意 URL，不保存 IPK 镜像，不提供远程安装。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 本地 Vue 与真实 Worker 运行时 |
| `pnpm run check` | 前后端类型、lint、Worker/单元及管理员脚本测试、34 组颜色对比度、开发热更新回归、生产构建与产物隔离 |
| `pnpm run test:e2e` | 构建并执行隔离浏览器端到端验收；外部服务使用测试环境 fixture |
| `pnpm run build` | 构建浏览器静态文件与 Worker |
| `pnpm db:migrate:local` | 仅本地 D1 迁移 |
| `pnpm admin --help` | 安全导入/设密命令说明 |
| `pnpm db:migrate:remote` | 生产 D1 迁移，仅供用户自行安排 |
| `pnpm deploy` | 部署命令，仅供用户自行安排 |

浏览器测试使用隔离 Chrome 配置，不读取日常浏览器会话。测试实际结果、样例和剩余外部联调见 [验收记录](docs/ACCEPTANCE.md)。UI 的独立隔离验收记录与截图另见 `docs/evidence/frontend-qa.json`、`ui-*.png`；不得将 fixture 成功当作真实 GitHub/AI/Cloudflare 线上成功。

## 目录

```text
src/                  Vue 页面、组件、同源 API 客户端与 README 净化
worker/               GitHub / AI / IPK / 下载适配器、认证与持久任务
migrations/           D1 表、约束与索引
scripts/              本地初始化、管理员安全导入/设密与脚本测试
tests/                Worker 集成、恶意归档、网络故障与浏览器验收
public/               许可、对应源码说明、静态资源
docs/                 作者、部署、决策、验收与上游记录
wrangler.jsonc        Workers / D1 / Queues / Cron 模板
pnpm-lock.yaml        实际依赖锁定
```

## 仍需配置与真实边界

- `GITHUB_TOKEN`：正式同步建议使用 GitHub 认证 API；本次未完成真实 token 联调。
- 管理员当前验证资料：需要可信导出并验证当前密码后安全导入；不会恢复旧默认口令、旧会话或业务数据。
- AI：在 Studio 配置 Base URL、model、API Key、超时/预算/规则并测试。密钥在服务端加密，Studio 读取只返回掩码；真实提供商尚未联调。
- Cloudflare：替换 D1 占位 ID、配置队列/死信队列、Secrets、正确站点来源和域名。正式运行建议 Workers Paid，但未替用户购买。配置与上线检查见 [部署指南](docs/DEPLOYMENT.md)。
- 域名暂按 `plugin.zdwifi.com`；曾误写的 `plugin.zdfiwi.com` 上线前需要核对，本地阶段未操作 DNS。
- 对外提供构建产物前，应把完整对应源码公开地址填入 `public/SOURCE.txt`，遵守所复用上游 GPL-3.0；当前没有公开远程仓库。

首版支持 `ar` 或 `tar.gz` IPK 外封装，内部 `control.tar` / `data.tar` 可为原始 tar 或 gzip。xz/zstd、PAX/GNU 扩展、嵌套归档、资源超限或核心材料不足进入“检查未完成”，不假称完整通过。二进制仅提供静态清单/摘要与源码关联审核，不做动态沙箱、可复现构建或商业病毒扫描。完整默认预算与取舍见 [工程决策](docs/DECISIONS.md)。

纯流式分发不能在发出首字节之前验证整包哈希；第三方源需要管理员明确测试并信任。下载数只是通过站内入口成功开始的尝试，不代表下载完成或安装人数。手机号自报识别存在冒用可能，服务端限流不能解决这一身份边界。

源码与 IPK 始终由作者维护。商店不执行 README 构建命令、不触发作者 Actions、不下载源码 ZIP、不接收本地 IPK 上传、不提供 AstrBot 安装、设备管理、收费、评分或评论。

## 许可与统计说明

基于 AstrBot 独立市场的适用组件修改；本商店源码采用 [GPL-3.0](LICENSE)，不提供担保。[对应源码说明](public/SOURCE.txt)。插件许可以各仓库为准。

收藏数为当前收藏的识别档案数；下载数为成功开始的下载尝试，不代表安装人数或完整下载成功。通过自动审核不等于保证无病毒。

上游许可与实际复用记录见 [上游与对应源码](docs/UPSTREAM.md)、[第三方声明](THIRD_PARTY_NOTICES.md)。

准备投稿请阅读 [作者指南](docs/AUTHOR_GUIDE.md)。
