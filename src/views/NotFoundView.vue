<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue'
import AppButton from '../components/AppButton.vue'
</script>

<template>
  <section class="nf container">
    <p class="nf__code">404</p>
    <h1 class="nf__title">这个页面不存在</h1>
    <p class="nf__text">链接可能已经变更，或者对应的插件已经下架。市场里的插件详情地址会随仓库收录保持稳定。</p>
    <div class="nf__actions">
      <AppButton to="/" variant="primary" icon="compass">返回插件市场</AppButton>
      <AppButton to="/submit" icon="upload">提交插件</AppButton>
    </div>
    <p class="nf__hint"><AppIcon name="info" :size="14" />如果你是从旧链接进入，可以在市场里搜索插件名称。</p>
  </section>
</template>

<style scoped>
.nf { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 96px 0 40px; text-align: center; }
.nf__code {
  font-size: clamp(4rem, 2rem + 10vw, 8rem);
  font-weight: 750;
  letter-spacing: -0.06em;
  line-height: 1;
  background: var(--brand-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.nf__title { font-size: 1.5rem; }
.nf__text { max-width: 52ch; color: var(--text-tertiary); line-height: 1.7; }
.nf__actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 10px; }
.nf__hint { display: flex; align-items: center; gap: 6px; margin-top: 14px; font-size: var(--text-small); color: var(--text-tertiary); }
</style>
