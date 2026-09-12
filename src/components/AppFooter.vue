<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <footer class="foot">
    <div class="wrap foot__in">
      <p class="foot__notice">安装包来自作者提交；通过自动审核不保证无病毒。</p>
      <p class="foot__links">
        <RouterLink to="/submit">提交插件</RouterLink>
        <RouterLink to="/me">个人中心</RouterLink>
        <span>© {{ year }} 张导插件商店</span>
      </p>
    </div>
  </footer>
</template>

<style scoped>
.foot__in a { color: var(--text-2); }
</style>
