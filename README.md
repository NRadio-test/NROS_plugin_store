# 插件商店

IPK 插件市场，支持提交公开 GitHub 仓库或直接上传 IPK。所有投稿和新版本均须人工审核；用户可下载当前版本与已批准的历史版本。

普通用户通过独立认证服务 `auth.zdwifi.com` 登录，昵称和头像自动同步。Studio 使用留言箱管理员账号，权限与普通用户分开。

## 本地运行

需要 Node.js 24 和 `package.json` 指定的 pnpm。

```sh
nvm use
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

访问 `http://127.0.0.1:5173`。`setup:local` 只在缺少 `.dev.vars` 时生成开发密钥，随后应用本地商店数据库迁移。更换端口时同步修改 `APP_ORIGIN`。

默认配置启用 SSO；本地认证联调见[统一登录](docs/shared-auth.md)。只验证业务流程时，可在 `.dev.vars` 设置 `SSO_ENABLED=false` 使用隔离测试账号，不能将此配置用于生产。管理员本地绑定也是独立数据库，不会自动读取生产账号。

## 功能

| 页面 | 功能 |
| --- | --- |
| `/` | 搜索、排序、收藏、下载 |
| `/plugins/:id` | 使用说明、历史版本、审核信息；右侧下载当前已批准版本 |
| `/login` | 有赞账号登录 |
| `/submit` | GitHub 仓库投稿或 IPK 直传 |
| `/me` | 账号资料、我的提交、审核反馈、我的收藏、退出登录 |
| `/studio` | 人工审核、插件管理、任务、日志、下载源与管理员账号入口 |

直传需填写名称、简介、教程，单个 IPK 上限 32 MiB。GitHub 投稿读取正式 Release 的 IPK 与仓库 README。新版本待审期间，旧批准版本仍可下载；下架后当前与历史下载一并停止。

## 开发命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | Vue 与本地 Worker、D1、R2、Queues |
| `pnpm check` | 类型、lint、单元与集成测试、对比度、热更新及构建检查 |
| `pnpm test:e2e` | 隔离浏览器端到端测试 |
| `pnpm build` | 构建并检查前端产物隔离 |
| `pnpm db:migrate:local` | 应用本地商店迁移 |

生产资源、备份、迁移与部署命令集中在[部署说明](docs/DEPLOYMENT.md)。人工审核不需要 AI 或 Cloudmersive 配置；自动审核模块保留备用，见[工程决策](docs/DECISIONS.md)。

## 目录与文档

- `src/`：Vue 页面、组件、样式与 API 客户端。
- `worker/`：认证、投稿、审核、下载、任务与存储适配器。
- `migrations/`：商店 D1 迁移；不用于认证服务或留言箱数据库。
- `tests/`、`scripts/`：测试与开发工具。
- [作者指南](docs/AUTHOR_GUIDE.md)、[接口约定](docs/API_CONTRACT.md)、[验收](docs/ACCEPTANCE.md)。
- [人工审核及旧作品迁移](docs/manual-review.md)、[统一登录](docs/shared-auth.md)、[设计系统](DESIGN_SYSTEM.md)。

## 许可

项目采用 [GPL-3.0](LICENSE)，上游复用及版权见[上游记录](docs/UPSTREAM.md)和[第三方声明](THIRD_PARTY_NOTICES.md)。发布构建产物时需提供[对应源码](public/SOURCE.txt)。插件许可按各作者声明执行。
