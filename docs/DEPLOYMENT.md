# 部署与运维

配置以 `wrangler.jsonc` 和目标 Cloudflare 账户为准。本文提供部署命令，不代表目标环境已完成配置或迁移。

## 资源与配置

| 绑定或配置 | 用途 |
| --- | --- |
| `DB` → `plugin-store` | 商店业务数据，使用 `migrations/` |
| `ADMIN_AUTH_DB` → `boss-message-box` | 只读管理员账号；不执行商店迁移 |
| `AUTH_SERVICE` → `zdwifi-auth` | 独立统一登录 Worker |
| `UPLOADS` → `plugin-store-uploads` | 私有 IPK 文件，禁用公开桶访问 |
| `JOBS` → `plugin-review` | 材料整理任务；死信队列 `plugin-review-dead` |
| `APP_ENV=production` | 生产 Cookie 和配置校验 |
| `APP_ORIGIN=https://plugin.zdwifi.com` | 写请求来源及本站回调来源 |
| `SSO_ENABLED=true`、`SSO_ORIGIN=https://auth.zdwifi.com` | 普通用户统一登录 |
| `REVIEW_MODE=manual`、`REVIEW_ENABLED=false` | 全部人工审核，停用自动引擎 |

已有资源直接复用；只有首次建站且资源不存在时才创建：

```sh
pnpm exec wrangler d1 create plugin-store
pnpm exec wrangler queues create plugin-review
pnpm exec wrangler queues create plugin-review-dead
pnpm exec wrangler r2 bucket create plugin-store-uploads
```

D1 创建返回的 `database_id` 填入 `DB` 对应配置。不要将 Cloudflare `account_id` 当作数据库 ID，也不要重建共享认证或留言箱数据库。

Cron `0 4,16 * * *` 在北京时间 12:00、24:00 启动扫描，并恢复未入队任务、清理过期缓存和孤立上传。队列按批次处理，扫描时间不等于全部更新完成时间。

## Secrets

首次配置或轮换时交互输入，已有有效密钥应保留：

```sh
pnpm exec wrangler secret put MASTER_KEY
pnpm exec wrangler secret put PHONE_HMAC_KEY
pnpm exec wrangler secret put SSO_CLIENT_SECRET
pnpm exec wrangler secret put GITHUB_TOKEN
```

- `MASTER_KEY`、`PHONE_HMAC_KEY` 分别使用至少 32 字符的随机值。前者保护加密设置及管理员会话，后者用于旧账号索引和匿名限流；随意更换会影响既有数据或会话。
- `SSO_CLIENT_SECRET` 必须匹配认证服务的 `SSO_CLIENT_KEYS.plugin`；站点 ID 为 `plugin`，回调为 `https://plugin.zdwifi.com/api/auth/callback`。本站不保存有赞应用密钥或中转密钥。完整配置见[统一登录](shared-auth.md)。
- `GITHUB_TOKEN` 可选，用于提高公开仓库 API 配额，权限按读取所需最小化。

Secrets、`.dev.vars`、备份、SQLite 和日志均不得提交到 Git。当前人工审核不需要 AI 或 Cloudmersive Key；保留引擎的配置见[工程决策](DECISIONS.md)。

## 本地准备

```sh
nvm use
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

访问 `http://127.0.0.1:5173`，与 `.dev.vars` 的 `APP_ORIGIN` 保持一致。初始化不会覆盖已有 `.dev.vars`，仅应用本地商店迁移。本地 D1/R2 不自动读取生产数据；认证联调和隔离测试入口见[验收](ACCEPTANCE.md)。

## 备份与迁移

先确认 `DB` 指向商店业务库，再备份并查看待执行迁移：

```sh
mkdir -p backups
chmod 700 backups
backup_path="backups/plugin-store-$(date +%Y%m%d-%H%M%S).sql"
pnpm exec wrangler d1 export DB --remote --output "$backup_path" &&
chmod 600 "$backup_path" &&
pnpm exec wrangler d1 migrations list DB --remote
```

确认备份成功及迁移影响后执行：

```sh
pnpm db:migrate:remote
```

| 迁移 | 作用与影响 |
| --- | --- |
| `0001_initial.sql` | 商店初始结构 |
| `0002_uploads.sql` | 直传元数据与任务关联 |
| `0003_shared_auth.sql` | 统一用户引用和经核实的旧账号关联记录，不自动合并手机号 |
| `0004_manual_review.sql` | 所有既有未停用上架作品转待审，保留文件、收藏、投稿和统计；重新人工批准后恢复公开 |

已应用迁移由 Wrangler 记录，不重复执行。已有站点若出现意外的待执行初始迁移或重复表/列错误，停止并核对迁移记录，不直接重跑 SQL 或重建库。人工审核迁移应先于新代码发布；跳过会导致旧作品被公开接口阻断，却没有待审记录。后续纯前端或认证协议更新不因此需要重新建库。

D1 导出不包含 R2 文件，恢复直传必须同时保留相应对象。备份与 Secrets 分别安全保存。恢复先在隔离数据库演练；生产恢复前暂停写入和消费并备份当前状态。代码回滚不会逆转数据库迁移。

## 发布

```sh
pnpm check &&
pnpm test:e2e &&
pnpm run deploy
```

`pnpm run deploy` 会构建并发布 Worker/静态资源。若 Cloudflare 配置了 Git 推送自动部署，先完成迁移再推送。单独提交代码不会执行数据库迁移。

目标域名为 `plugin.zdwifi.com`。`wrangler.jsonc` 未声明 `routes`；若已在 Cloudflare 控制台关联自定义域，保留现有关联。首次绑定时可在同一账户的 zone 下配置：

```json
"routes": [{ "pattern": "plugin.zdwifi.com", "custom_domain": true }]
```

发布构建产物前核对 [LICENSE](../LICENSE)、[第三方声明](../THIRD_PARTY_NOTICES.md)和[对应源码地址](../public/SOURCE.txt)。发布后按[验收](ACCEPTANCE.md)检查真实登录、人工审核、下载、队列与权限。

## 日常管理

管理员账号与密码在[留言箱](https://msg.zdwifi.com/studio)管理。商店只读当前账号并检查强制改密标记；留言箱改密、删号或要求改密后，旧商店会话下次请求失效。不要对 `ADMIN_AUTH_DB` 执行写入或商店迁移。

Studio 审核收件箱提供批准与退回；下架阻止继续公开和下载，恢复后重新审核。删除会清理展示快照、附件、收藏和相关直传文件，应先确认目标。

下载源默认使用 GitHub 官方源。第三方源必须先停用保存、明确设为可信、通过具体批准附件的测试后才能启用；变更配置后重新测试。直传 IPK 始终由私有 R2 经商店接口提供，不使用 GitHub 下载源。

常见问题：登录配置异常先核对 `AUTH_SERVICE` 与 `SSO_CLIENT_SECRET`；写请求被拒绝先核对 `APP_ORIGIN`；待审任务不推进先查看任务状态、队列及死信；已批准文件不可下载先核对来源文件是否被替换或删除。生产日志不得输出 Cookie、凭据或完整有赞响应。
