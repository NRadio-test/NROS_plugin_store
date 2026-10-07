# 上游复用与对应源码

来源：[AstrBotDevs/Astrbot_Plugins_Market](https://github.com/AstrBotDevs/Astrbot_Plugins_Market)，参考 commit `fcfc2d00795156cc3db8750af6f938e0c282cc49`。初次改编日期为 2026-09-10，后续变更见 Git 历史。项目采用 GPL-3.0-only，原文保留在根 `LICENSE` 和 `public/LICENSE.txt`。

## 复用关系

| 上游文件 | 当前实现 | 内容 |
| --- | --- | --- |
| `src/components/SearchToolbar.vue` | `src/components/SearchToolbar.vue` | 受控搜索、清空和重置分页；接本站搜索接口 |
| `src/components/AppPagination.vue` | `src/components/AppPagination.vue` | 响应式页码窗口和事件；使用原生按钮 |
| `src/stores/plugins.js` | `src/lib/theme.ts` | 主题偏好持久化与切换；增加系统主题默认值及存储降级 |
| `src/components/PluginCard.vue` | `src/components/PluginRow.vue` | 插件身份、版本、描述、统计与操作的浏览结构，改为目录行 |
| `src/assets/theme.css` | `src/styles/tokens.css` | 语义令牌和浅深主题组织；当前配色、布局见设计系统 |

未引入上游 logo、字体、原站 API、Issue 投稿、安装或评论功能。商店与 AstrBot 无安装或运行时依赖。

仓库 README 和上传教程由 `src/lib/readme.ts` 渲染，使用 marked、DOMPurify 与 URL 校验，不执行作者代码。

## 对应源码

项目仓库：https://github.com/NRadio-test/NROS_plugin_store

发布前确认 `public/SOURCE.txt` 指向可获取当前发布版本的完整对应源码，包括迁移、构建脚本、配置示例和锁文件。排除真实凭据、用户数据、会话及生产数据库。构建步骤见 [README](../README.md)，依赖许可见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) 和 `public/licenses/`。

商店源码的 GPL 不替代作者插件自己的许可证。
