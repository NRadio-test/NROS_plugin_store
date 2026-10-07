# 验收

## 本地检查

```sh
pnpm check
pnpm test:e2e
node scripts/test-auth-integration.mjs ../zdwifi-auth-worker
```

`check` 覆盖类型、lint、Worker 测试、热更新、颜色对比度和生产构建。端到端测试使用隔离 D1/R2 与外部服务 fixture；认证联调脚本运行真实认证 Worker 与两个隔离业务 Worker，但有赞响应仍为模拟数据。

## 验收项目

| 流程 | 检查点 | 主要测试 |
| --- | --- | --- |
| 登录与资料 | 全局 ID 一致；静默复用；刷新保持；头像昵称自动同步；服务失败不误退出；回调不可重放 | `tests/security/sso.test.ts`、`tests/integration/account-profile.test.ts`、认证联调脚本 |
| 管理员 | 普通用户无管理权限；共享账号只读；强制改密、删号或密码变化使旧会话失效 | `tests/integration/shared-auth.test.ts`、`tests/security/auth.test.ts` |
| 人工审核 | 用户及管理员投稿均先待审；批准后公开；退回原因可见；旧批准版本保留；并发与过期决定被拒绝 | `tests/integration/manual-review.test.ts` |
| 上传与下载 | 资料校验、包结构、私有存储、文件一致性、HEAD/Range、限流与停用阻断 | `tests/integration/uploads.test.ts`、`tests/security/download.test.ts` |
| 历史版本 | 仅批准版本可见；版本与文件匹配；删除文件不可下载；下架同时阻断历史入口 | `tests/integration/versions.test.ts` |
| 市场与任务 | 搜索排序、收藏幂等、任务恢复、临时网络失败与迟到任务 | `tests/integration/market.test.ts`、`tests/integration/recovery.test.ts` |
| 页面 | 手机/平板/桌面无关键溢出；主题与键盘操作；长文件名可读；当前与历史下载清晰 | `tests/e2e/store.spec.ts` |

停用的自动审核模块仍由独立配置下的适配器、pipeline、manual-publication 和 review-disabled 测试覆盖，不代表生产启用了这些流程。

## 已保存的本地证据

- [独立认证接入](evidence/auth-v1/checks.json)：包含运行日期、检查范围和模拟边界。
- [版本历史与响应式下载](evidence/version-history/checks.json)：不同宽度、下载字节、空历史及页面不显示 SHA 的检查。
- [人工审核迁移](manual-review.md)：旧作品转待审与业务关联保留的规则和检查点。

证据对应各次修改时的代码，不能替代当前提交重跑，也不证明生产已发布。旧截图、旧测试数量不作为当前页面或部署状态的说明。

## 发布后检查

由部署者使用真实账号和无害安装包验证：有赞登录、另一接入站免重复授权、统一退出、当前昵称头像、用户与管理员投稿、人工批准与退回、当前/历史下载，以及下架后的下载阻断。另确认生产队列、Cron、权限、资源配额与日志正常。

生产验证需单独记录执行时间、部署版本和结果；不以匿名接口可访问或本地测试通过替代。
