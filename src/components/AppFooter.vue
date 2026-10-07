<script setup lang="ts">
import BrandLogo from './BrandLogo.vue'
const year = new Date().getFullYear()
</script>

<template>
  <footer class="foot">
    <div class="wrap foot__in">
      <RouterLink to="/" aria-label="NRadio 插件商店 首页" class="foot__brand"><BrandLogo /></RouterLink>
      <p class="foot__links">
        <RouterLink to="/submit">提交插件</RouterLink>
        <RouterLink to="/me">个人中心</RouterLink>
        <span>© {{ year }} 插件商店</span>
      </p>
    </div>
  </footer>
</template>

<style scoped>
.foot__in a { color: var(--text-2); }
.foot__in { align-items: center; }
.foot__brand { min-height: 44px; display: flex; align-items: center; }
.foot__links { font-size: 12px; }
.foot__links a { min-height: 44px; display: inline-flex; align-items: center; }
@media (max-width: 640px) { .foot__in { flex-direction: column; gap: 12px; align-items: flex-start; } .foot__links { gap: 16px; } }
</style>
