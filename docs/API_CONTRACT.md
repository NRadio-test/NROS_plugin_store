# 前后端接口约定
全部 JSON，错误 `{error, code}`。写入请求需要同源 Origin（浏览器自动提供），cookie 会话。字段 snake_case 用于数据库对象。
GET /api/session → {user: {id,phone_mask}|null, admin:{id,username}|null}
POST /api/login {phone} → {user}; POST /api/logout；管理员 POST /api/studio/login {username,password}, POST /api/studio/logout。
GET /api/plugins?q=&page=1&sort=updated|downloads|favorites → {items:[Plugin],total,page,pageSize,sort}。Plugin: id,full_name,description,version,favorite_count,download_count, favorited,updated_at。
`sort` 缺省或非法值一律按 `updated`（p.updated_at DESC,p.id）；`downloads` → p.download_count DESC,p.updated_at DESC,p.id；`favorites` → favorite_count DESC,p.updated_at DESC,p.id。只使用该白名单，绝不把用户输入拼接进 SQL。`total` 与 `items` 口径一致：同样要求 status='published'、blocked=0 且存在已批准快照。
GET /api/plugins/:id → {plugin:Plugin,readme,readmePath,readmeCommit,sourceCommit,license,assets:[{id,name,size,sha256,packageName,architecture}],reviewLabel,reviewedAt,reviewPublicReason,publishedAt}
新增字段（其余字段不变）：`reviewedAt` 已批准快照的 snapshots.created_at（number|null）、`reviewPublicReason` 已批准快照的 public_reason（string，可能为空串）、`publishedAt` 插件最近一次上架时间，取 plugins.updated_at（number|null）。公共接口永不返回 snapshots.internal_reason / tasks.internal_reason。
GET/HEAD /api/plugins/:id/download/:assetId → 附件流。
PUT /api/plugins/:id/favorite {active:boolean} → {favorite_count,favorited}
POST /api/submit {url} → {pluginId,taskId,status,message}; POST /api/plugins/:id/refresh → {taskId,status}
GET /api/me → {submissions:[{id,full_name,status,public_reason,task_status}],favorites:[Plugin]}
GET /api/studio/plugins?q=&status=all|published|in_review|waiting|rejected|removed|blocked&page=1&pageSize=20 → {items:[StudioPlugin],total,page,pageSize}
`total` 为满足条件的总数；`page` 从 1 开始；`pageSize` 默认 20，合法范围 10–100（越界按边界收敛）。`q` 按 full_name/description LIKE 匹配，`% _ \` 已转义并显式 `ESCAPE '\'`。`status` 非法值按 `all` 处理；`in_review` = 存在 pending/running/retry 任务；`waiting` = waiting_package/waiting_config/incomplete。
StudioPlugin: id,full_name,repository_id,description,status,blocked,revision,version(可空),favorite_count,download_count,public_reason,created_at,updated_at,checked_at,approved_snapshot_id,submitter_id(可空),task_status(可空),task_attempts(可空),last_task_at(可空)。
GET /api/studio/plugins/:id → {plugin:StudioPlugin,snapshot,assets,tasks,audits}；插件不存在返回 404。
snapshot: null | {id,revision,verdict,public_reason,internal_reason,review_version,created_at}（取 approved_snapshot_id 指向的快照）。
assets: [{id,name,size,sha256,disabled,package_name,architecture}]，package_name/architecture 取自附件 data，缺失为 null。
tasks: 最多 20 条，按 revision DESC，字段 id,revision,status,attempts,public_reason,internal_reason,created_at,updated_at,queued_at,lock_until。
audits: 最多 20 条，按 created_at DESC，只含 target 等于该插件 id 的记录，字段 id,action,target,created_at,admin_id。
GET /api/studio/overview → {counts,ai,sources,recentTasks}
counts: plugins,published,inReview,waiting,rejected,removed,blocked,favorites,downloads,users,tasksActive,tasksFailed（均为数字）；ai: {configured,model,baseUrl}，`configured` 当且仅当已保存配置同时有 model 与非空 apiKey，apiKey 的明文与密文都不返回；sources: {total,enabled}；recentTasks 最多 8 条按 created_at DESC：id,plugin_id,full_name(LEFT JOIN plugins，无插件时为空串),status,public_reason,attempts,created_at，不含 internal_reason。
POST /api/studio/password {currentPassword,newPassword} → {ok:true}
必须校验当前密码（错误 401）；新密码 12–200 位且至少含字母与数字，或 ≥16 位可打印字符，且不得与当前密码相同，不合规返回 400 与中文原因。写入 pbkdf2-sha256$600000$salt$hash（base64url、SHA-256、16 字节 salt、32 字节派生）。数据库触发器会删除该管理员全部会话，因此同一响应会通过 Set-Cookie 重新签发管理员会话，并记录审计 action='password-change'。限流 5 次/600 秒。
POST /api/studio/submit {url}; POST /api/studio/plugins/:id/:action {reason?} actions sync,retry,unlist,delete,restore
GET /api/studio/tasks → {items:[{id,plugin_id,status,public_reason,internal_reason,attempts,created_at}]}
GET /api/studio/logs → {items:[{id,action,target,created_at}]}
GET /api/studio/ai → AIConfig（apiKey 掩码）；PUT 同路径 AIConfig；POST /api/studio/ai/test → {ok,message}
GET /api/studio/sources → {items:DownloadSource[]}; PUT /api/studio/sources {items:DownloadSource[]}; POST /api/studio/sources/:id/test {pluginId,assetId} → {ok,message}
GET /api/studio/sources/candidates → {items:[{pluginId,fullName,version,assets:[{id,name,size,architecture,disabled}]}]}。只含 status='published' AND blocked=0 且有已批准快照的插件，最多 50 个（updated_at DESC），每个插件最多 10 个附件，供 Studio 下拉选择而非手填 ID。
所有设置写入必须先登录管理员。公共页面不放 Studio 链接。多附件通过详情选择，不选默认第一个。
