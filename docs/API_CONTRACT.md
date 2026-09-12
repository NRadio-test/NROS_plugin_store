# 前后端接口约定
除上传使用 multipart/form-data、下载返回附件流外，接口使用 JSON，错误 `{error, code}`。写入请求需要同源 Origin（浏览器自动提供），cookie 会话。字段 snake_case 用于数据库对象。
GET /api/session → {user: {id,phone_mask}|null, admin:{id,username}|null}
POST /api/login {phone} → {user}; POST /api/logout；管理员 POST /api/studio/login {username,password}, POST /api/studio/logout。
GET /api/plugins?q=&page=1&sort=updated|downloads|favorites → {items:[Plugin],total,page,pageSize,sort}。Plugin: id,source_kind(github|upload),full_name,description,version,favorite_count,download_count, favorited,updated_at。
`sort` 缺省或非法值一律按 `updated`（p.updated_at DESC,p.id）；`downloads` → p.download_count DESC,p.updated_at DESC,p.id；`favorites` → favorite_count DESC,p.updated_at DESC,p.id。只使用该白名单，绝不把用户输入拼接进 SQL。`total` 与 `items` 口径一致：同样要求 status='published'、blocked=0 且存在已批准快照。
GET /api/plugins/:id → {plugin:Plugin,readme,readmePath,readmeCommit,sourceCommit,license,assets:[{id,name,size,sha256,packageName,architecture}],reviewLabel,reviewedAt,reviewPublicReason,publishedAt}
新增字段（其余字段不变）：`reviewedAt` 已批准快照的 snapshots.created_at（number|null）、`reviewPublicReason` 已批准快照的 public_reason（string，可能为空串）、`publishedAt` 插件最近一次上架时间，取 plugins.updated_at（number|null）。公共接口永不返回 snapshots.internal_reason / tasks.internal_reason。
GET/HEAD /api/plugins/:id/download/:assetId → 附件流。
PUT /api/plugins/:id/favorite {active:boolean} → {favorite_count,favorited}
POST /api/submit {url} → {pluginId,taskId,status,message}; POST /api/plugins/:id/refresh → {taskId,status}
GET /api/me → {submissions:[{id,full_name,status,public_reason,task_status}],favorites:[Plugin]}
GET /api/studio/plugins?q=&status=all|published|in_review|waiting|rejected|removed|blocked&page=1&pageSize=20 → {items:[StudioPlugin],total,page,pageSize}
`total` 为满足条件的总数；`page` 从 1 开始；`pageSize` 默认 20，合法范围 10–100（越界按边界收敛）。`q` 按 full_name/description LIKE 匹配，`% _ \` 已转义并显式 `ESCAPE '\'`。`status` 非法值按 `all` 处理；`in_review` = 存在 pending/running/retry 任务；`waiting` = waiting_package/waiting_config/incomplete。
StudioPlugin: id,source_kind(github|upload),full_name,repository_id,description,status,blocked,revision,version(可空),favorite_count,download_count,public_reason,created_at,updated_at,checked_at,approved_snapshot_id,submitter_id(可空),task_status(可空),task_attempts(可空),last_task_at(可空)。
GET /api/studio/plugins/:id → {plugin:StudioPlugin,snapshot,assets,tasks,audits}；插件不存在返回 404。
snapshot: null | {id,revision,verdict,public_reason,internal_reason,review_version,created_at}（取 approved_snapshot_id 指向的快照）。
assets: [{id,name,size,sha256,disabled,package_name,architecture}]，package_name/architecture 取自附件 data，缺失为 null。
tasks: 最多 20 条，按 revision DESC，字段 id,revision,status,attempts,public_reason,internal_reason,created_at,updated_at,queued_at,lock_until。
audits: 最多 20 条，按 created_at DESC，只含 target 等于该插件 id 的记录，字段 id,action,target,created_at,admin_id。
GET /api/studio/overview → {counts,ai,sources,recentTasks}
counts: plugins,published,inReview,waiting,rejected,removed,blocked,favorites,downloads,users,tasksActive,tasksFailed（均为数字）；ai: {configured,model,baseUrl}，`configured` 当且仅当已保存配置同时有 model 与非空 apiKey，apiKey 的明文与密文都不返回；sources: {total,enabled}；recentTasks 最多 8 条按 created_at DESC：id,plugin_id,full_name(LEFT JOIN plugins，无插件时为空串),status,public_reason,attempts,created_at，不含 internal_reason。
POST /api/studio/password → 已登录返回 403，code=password_managed_externally，提示前往留言箱改密；不读取或转发请求里的密码，不写入账号库。
管理员登录只查询 ADMIN_AUTH_DB；密码匹配但 must_change_password 非 0 时返回 403 / password_change_required。登录和会话响应只返回 id、username。共享库缺少绑定返回 503，故障时不回退到商店账号。管理员每次请求检查共享账号与会话中的凭据版本，改密、删除或强制改密使旧商店会话失效。
POST /api/studio/submit {url}; POST /api/studio/plugins/:id/:action {reason?} actions sync,retry,unlist,delete,restore
GET /api/studio/tasks → {items:[{id,plugin_id,status,public_reason,internal_reason,attempts,created_at}]}
GET /api/studio/logs → {items:[{id,action,target,created_at}]}
GET /api/studio/ai → AIConfig（apiKey 掩码）；PUT 同路径 AIConfig；POST /api/studio/ai/test → {ok,message}
GET /api/studio/sources → {items:DownloadSource[]}; PUT /api/studio/sources {items:DownloadSource[]}; POST /api/studio/sources/:id/test {pluginId,assetId} → {ok,message}
GET /api/studio/sources/candidates → {items:[{pluginId,fullName,version,assets:[{id,name,size,architecture,disabled}]}]}。只含 status='published' AND blocked=0 且有已批准快照的插件，最多 50 个（updated_at DESC），每个插件最多 10 个附件，供 Studio 下拉选择而非手填 ID。
所有设置写入必须先登录管理员。公共页面不放 Studio 链接。多附件通过详情选择，不选默认第一个。

## IPK 直传接口

- `POST /api/submit/upload`：普通用户会话投稿。
- `POST /api/plugins/:id/upload`：原提交用户上传新版本；只允许未被管理员停用的直传插件。
- `POST /api/studio/submit/upload`：管理员投稿，仍经过审核并记审计。
- 上传请求为 `multipart/form-data`，四个必填字段：`name`（1–80 字符，无路径分隔符或控制字符）、`description`（1–500）、`tutorial`（1–20000，Markdown）、`file`（单个非空 `.ipk`）。拒绝重复或未知字段。默认文件上限 32 MiB，`MAX_IPK_BYTES` 可降低，直传硬上限 32 MiB；每个识别档案累计存储限额 128 MiB，管理员投稿合并计算。
- 返回 202 `{pluginId,taskId,status,message}`；相同提交者、相同文件及资料不再创建任务，`taskId=null,status=duplicate`，不改变提交归属或解除下架。并发冲突/额度不足返回 409；文件过大返回 413（请求封装超预算为受控错误）；无存储绑定返回 503/upload_unconfigured。
- `GET /api/me` 的 submissions 增加 `source_kind` 和仅本人可见的 `upload_name/upload_description/upload_tutorial`，用于新版本表单预填。不返回对象路径或其他人的待审核教程。
- `GET /api/plugins/:id` 对直传包返回已批准教程作为 `readme`；`readmePath/readmeCommit/sourceCommit` 为空，`license=null`（未提供许可，不能推断）。公共附件不暴露对象路径、ETag 或内部材料。
- 下载接口不变：直传包经私有 R2 读取，支持原有 HEAD/Range、状态复核和去重统计；不接受外部 URL 或对象 key。GitHub 下载源设置/测试候选仅用于 GitHub 包。
- Studio 下架保留最新私有候选包供显式恢复重审；删除额外清除直传文件及元数据。删除后的显式恢复进入等待安装包，原提交用户需重新上传。
