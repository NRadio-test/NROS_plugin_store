# 上游复用与对应源码

## 已核对来源

- 仓库：https://github.com/AstrBotDevs/Astrbot_Plugins_Market
- 本次读取 commit：`fcfc2d00795156cc3db8750af6f938e0c282cc49`。
- 上游 `LICENSE`：GNU General Public License version 3；原文保留于项目根 `LICENSE` 和 `public/LICENSE.txt`。
- 修改日期：2026-09-10。此项目是独立 IPK 市场，不是 AstrBot 官方插件市场。

## 实际复用与改动

| 上游文件 | 本项目文件 | 保留与改动 |
| --- | --- | --- |
| `src/components/SearchToolbar.vue` | `src/components/SearchToolbar.vue` | 保留受控输入、清空、搜索变化重置页码的事件逻辑；界面在第二轮重新设计（图标、快捷键提示、焦点环），仍为原生可访问控件。去掉 Star、随机推荐和标签排序，改接本项目服务端名称/描述搜索。 |
| `src/components/AppPagination.vue` | `src/components/AppPagination.vue` | 保留 480/768 断点下 3/5/7 页码槽、resize 注册/清理以及双向页码事件；改为原生按钮并新增省略号窗口，移除 Naive UI 与快跳 DOM 修补。 |
| `src/stores/plugins.js` | `src/lib/theme.ts` | 保留 `theme-preference` 持久化与 `isDarkMode` / `toggleTheme` 逻辑；增加系统主题默认值、`theme-color` 同步与存储不可用降级，不引入 Pinia。市场数据改接同源 Worker API。 |
| `src/components/PluginCard.vue` | `src/components/PluginCard.vue` | 保留卡片「身份 + 版本 + 描述 + 统计 + 操作」的浏览结构；整卡可点与两个独立操作按钮的可访问性划分沿用。替换 Star 等字段为收藏/下载统计，删除安装、社交、复制仓库、评论和详情弹层。视觉为第二轮重新设计。 |
| `src/assets/theme.css` | `src/styles/tokens.css` 等 | 第一轮沿用上游的语义令牌组织方式与浅/深主题切换思路。第二轮界面重做后**不再使用上游配色**：调色板、圆角、阴影、动效与全部页面布局均为本项目自建（见 `DESIGN_SYSTEM.md`），`src/style.css` 仅作为分层样式的入口。 |

未复制上游 logo、Lexend 字体、OFL 字体文件、AstrBot 主程序、原站 API、Issue 投稿入口、评论系统、安装功能或整套组件库。未采用上游 README 作为市场插件说明。第二轮的视觉设计（配色、图标、组件样式、页面布局）为本项目原创，不来自上游。

`src/lib/readme.ts` 是新增的真实仓库 README 安全渲染适配器：marked 解析、DOMPurify 允许列表净化、commit/path 相对 URL 解析、HTTPS 外链与 GitHub 内容图片允许列表。仓库内容永远不能成为脚本或管理指令。

## 构建与公开要求

对应源码是本项目完整源码、迁移、构建脚本、配置示例、锁文件与上述许可证。依赖按锁文件安装；构建见根 `README.md`，运行统一 `pnpm run check`。新业务代码采用 TypeScript，项目整体采用 GPL-3.0-only。

当前交付仅在本地，未创建远程仓库或部署。运营者在对外提供前端构建产物前，需要提供本版本完整对应源码的公开获取方式，将地址填入 `public/SOURCE.txt` 并保留页脚许可入口。源码必须排除真实密钥、手机号索引、会话、管理员验证数据及生产数据库。商店源码的 GPL 不会替代作者仓库自己的插件许可证。

第三方运行时依赖及许可证原文见 `THIRD_PARTY_NOTICES.md` 与 `public/licenses/`。构建工具依赖随包管理器安装保留各自许可证；锁文件记录实际版本。
