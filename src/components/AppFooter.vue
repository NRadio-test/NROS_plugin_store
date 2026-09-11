<script setup lang="ts">
import AppIcon from './AppIcon.vue'

const year = new Date().getFullYear()
</script>

<template>
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <p class="footer-title">张导插件商店</p>
        <p class="footer-desc">
          独立的 IPK 插件目录。源码与安装包始终由作者发布在 GitHub 公开仓库，
          商店只读取仓库与正式 Release，并把已审核的安装包转发到你的设备。
        </p>
      </div>

      <nav class="footer-col" aria-label="浏览">
        <p class="footer-head">浏览</p>
        <RouterLink to="/">插件市场</RouterLink>
        <RouterLink to="/submit">提交插件</RouterLink>
        <RouterLink to="/me">个人中心</RouterLink>
      </nav>

      <div class="footer-col">
        <p class="footer-head">审核边界</p>
        <span>通过自动静态审核，不保证无病毒</span>
        <span>不执行仓库构建命令与安装脚本</span>
        <span>手机号仅作档案识别，未验证归属</span>
      </div>
    </div>

    <div class="footer-base">
      <p>© {{ year }} 张导插件商店 · 源码与安装包版权归各作者所有</p>
      <p class="footer-note">
        <AppIcon name="shield" :size="14" />
        <span>下载统计为成功开始的下载尝试，不代表安装数量</span>
      </p>
    </div>
  </footer>
</template>

<style scoped>
.site-footer { margin-top: 80px; border-top: 1px solid var(--border-base); background: var(--bg-card); }
.footer-inner {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1.3fr);
  gap: 40px;
  width: min(var(--container-wide), 100% - 48px);
  margin-inline: auto;
  padding: 44px 0 32px;
}
.footer-brand { display: flex; flex-direction: column; gap: 10px; max-width: 46ch; }
.footer-title { font-size: var(--text-body); font-weight: 680; letter-spacing: -0.01em; }
.footer-desc { font-size: var(--text-small); color: var(--text-tertiary); line-height: 1.7; }
.footer-col { display: flex; flex-direction: column; gap: 9px; font-size: var(--text-small); color: var(--text-tertiary); }
.footer-col a { color: var(--text-secondary); font-weight: 550; }
.footer-head { font-size: var(--text-micro); font-weight: 650; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 2px; }
.footer-base {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  width: min(var(--container-wide), 100% - 48px);
  margin-inline: auto;
  padding: 16px 0 26px;
  border-top: 1px solid var(--border-subtle);
  font-size: var(--text-micro);
  color: var(--text-tertiary);
}
.footer-note { display: inline-flex; align-items: center; gap: 6px; }

@media (max-width: 900px) {
  .footer-inner { grid-template-columns: 1fr 1fr; gap: 28px; }
  .footer-brand { grid-column: 1 / -1; }
}
@media (max-width: 560px) {
  .footer-inner { grid-template-columns: 1fr; gap: 24px; padding-top: 32px; }
  .site-footer { margin-top: 56px; }
}
</style>
