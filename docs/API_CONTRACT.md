# 接口约定

除上传使用 `multipart/form-data`、下载返回文件流外，接口使用 JSON；错误返回 `{error, code}`。写请求要求同源 Origin 和对应 Cookie 权限。公共接口不返回内部审核备注、会话 token、对象路径或密钥。

## 登录与会话

| 接口 | 请求 / 返回 |
| --- | --- |
| `POST /api/login` | SSO 模式：`{next?,silent?}` → `{authorizationUrl}`，设置浏览器绑定 Cookie |
| `GET /api/auth/callback` | 校验 state、绑定 Cookie、期限及一次性票据，换取本站会话并跳转 |
| `GET /api/session` | `{user,admin,reviewMode,reviewEnabled,ssoEnabled?}` |
| `POST /api/account/profile/sync` | `{user}`；登录后由页面自动调用 |
| `POST /api/logout` | 撤销中央及关联站点会话，成功后清除本站用户 Cookie |
| `POST /api/studio/login` | `{username,password}` → `{admin}` |
| `POST /api/studio/logout` | 清除本站管理员会话 |

SSO `user` 为 `{id,display_name,avatar_url?,profile_updated_at?}`，ID 是全局 UUID；`admin` 为 `{id,username}`，未登录时各自为 null。管理员权限不会由普通用户身份推导。

当前 `reviewMode=manual`、`reviewEnabled=false`，后者表示自动引擎停用，不表示免审。关闭 SSO 的隔离开发环境保留 `{phone}` 登录与 `{id,phone_mask}` 用户响应；生产不使用此身份方式。

只有 `401/session_expired` 确认会话失效。配置、网络或资料服务错误不得当作退出；资料失败保留已有昵称头像并自动重试。协议、Cookie 和旧账号核实绑定见[统一登录](shared-auth.md)。

## 市场与下载

| 接口 | 返回与规则 |
| --- | --- |
| `GET /api/plugins?q=&page=1&sort=updated` | `{items,total,page,pageSize,sort}`，每页 12 条；排序支持 `updated/downloads/favorites`，其他值回落 `updated` |
| `GET /api/plugins/:id` | `{plugin,readme,readmePath,readmeCommit,sourceCommit,license,assets,publicationMode,reviewLabel,reviewedAt,reviewPublicReason,publishedAt}` |
| `GET /api/plugins/:id/versions?page=1` | `{items,total,page,pageSize}`，每页 20 条，仅此前批准版本，不重复当前版本 |
| `GET/HEAD /api/plugins/:id/download/:assetId` | 当前批准附件流 |
| `GET/HEAD /api/plugins/:id/versions/:snapshotId/download/:assetId` | 指定历史批准附件流 |
| `PUT /api/plugins/:id/favorite` | `{active:boolean}` → `{favorite_count,favorited}`，需要普通用户会话 |

`Plugin` 包含 `id,source_kind,full_name,description,version,favorite_count,download_count,updated_at,author,favorited?`。公开作者目前取 GitHub 所属者；直传 SSO 投稿显示「有赞用户」，旧手机号投稿使用掩码，不返回原号码。

附件字段为 `{id,name,size,sha256,packageName?,architecture?}`；历史条目为 `{id,version,publishedAt,assets}`，附件另有 `available`。摘要保留在协议中供校验，页面不显示。文件不可用时 `available=false`；实际下载仍会核验来源，列表状态不能绕过下载检查。

人工模式的公开记录必须为 `human-reviewed`；`reviewedAt` 是批准快照记录的审核时间，`publishedAt` 取插件更新时间。新候选不出现在公共接口，旧批准版本可继续使用。插件下架或停用会同时阻断当前和历史下载。

下载支持 HEAD、单 Range 和连接取消；只接受站内 ID，不允许传入目标 URL。成功开始的下载按短期身份去重计数，HEAD 和失败不计数。

## 投稿与个人中心

| 接口 | 请求 / 返回 |
| --- | --- |
| `POST /api/submit` | `{url}` → 202 `{pluginId,taskId,status,message}` |
| `POST /api/plugins/:id/refresh` | 重新整理本人 GitHub 投稿 → 202 `{taskId,status}` |
| `POST /api/submit/upload` | 首次 IPK 投稿 |
| `POST /api/plugins/:id/upload` | 本人直传插件的新版本 |
| `GET /api/me` | `{submissions,favorites}` |

上传字段仅允许 `name`（1–80 字符）、`description`（1–500）、`tutorial`（1–20000，Markdown）和一个非空 `.ipk` `file`；四项必填，拒绝重复或未知字段。默认文件上限 32 MiB，`MAX_IPK_BYTES` 可降低；每账号存储上限 128 MiB。

成功返回 202 `{pluginId,taskId,status,message}`。同一提交者的相同资料与文件返回 `status=duplicate,taskId=null`，不抢占归属、不解除下架。并发冲突/存储额度返回 409，文件超限 413，缺少存储配置 503。

本人 `submissions` 含 `source_kind,status,revision,review_status,review_reason,public_reason,task_status,updated_at`；直传额外返回 `upload_name/upload_description/upload_tutorial` 预填新版本表单。内部审核理由和对象地址不返回。

## Studio

除登录外均要求有效管理员会话。账号与权限只读 `ADMIN_AUTH_DB`，检查 `must_change_password`；缺绑定或故障不回退本地账号。留言箱改密、删号或强制改密使旧商店会话失效。

| 接口 | 请求 / 返回 |
| --- | --- |
| `GET /api/studio/overview` | `{counts,ai,sources,recentTasks}`；`counts.awaitingReview` 为待人工处理数量 |
| `GET /api/studio/plugins` | `q,status,page,pageSize` → `{items,total,page,pageSize}`；默认每页 20，范围 10–100 |
| `GET /api/studio/plugins/:id` | `{plugin,candidate,snapshot,assets,tasks,audits,upload}` |
| `POST /api/studio/submit` | `{url}`；管理员投稿仍需审核 |
| `POST /api/studio/submit/upload` | 管理员 IPK 投稿 |
| `POST /api/studio/plugins/:id/upload` | 管理员更新直传插件 |
| `POST /api/studio/plugins/:id/review` | `{revision,decision:"approve"\|"reject",reason?,internalReason?}` |
| `GET/HEAD /api/studio/plugins/:id/review/download/:assetId` | 当前待审附件；不接受查询参数，不计入市场下载数 |
| `POST /api/studio/plugins/:id/:action` | action 为 `sync/retry/unlist/delete/restore`，请求可含 `reason` |
| `GET /api/studio/tasks` | 最近 200 条任务及内部依据 |
| `GET /api/studio/logs` | 最近 100 条操作记录 |

列表状态支持 `all/awaiting_review/published/in_review/waiting/rejected/removed/blocked`。`awaiting_review` 依据当前 revision 的待审记录筛选，因此旧版已上架而新版待审的插件也会进入收件箱。

`candidate` 包含冻结的名称、简介、README/教程、版本、附件、revision、decision、公开及内部理由、创建和处理时间。插件详情附最近 20 条任务及 20 条相关审计；不存在返回 404。

批准前再次核验文件与管理员会话。退回 `reason` 要求 5–240 字，内部备注最多 6000 字；重复、并发、已停用或版本变化返回 409。通过后 `publicationMode=human-reviewed`，退回不影响此前批准版本。

兼容接口 `/manual-publish` 接受 `{confirmed:true,revision}`；人工模式只批准已准备的候选，不能免审读取新文件。`POST /api/studio/password` 返回 403/`password_managed_externally`，改密在留言箱完成。

## 后台配置与保留引擎

- `GET/PUT /api/studio/sources` 读取或保存 `{items:DownloadSource[]}`。
- `GET /api/studio/sources/candidates` 返回已批准 GitHub 插件和附件供测试；不包含直传包。
- `POST /api/studio/sources/:id/test` 接收 `{pluginId,assetId}`。第三方源须信任、停用保存、测试通过后才能启用；变更配置需重测。
- `GET/PUT /api/studio/ai` 读取或保存 AI 设置；Key 读取仅返回掩码。
- `POST /api/studio/ai/test` 在当前人工模式返回 409/`review_disabled`，不请求外部模型。

自动与旧免审模式仅供保留实现的开发测试，配置含义见[工程决策](DECISIONS.md)。
