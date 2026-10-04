<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <footer class="foot">
    <div class="wrap foot__in">
      <p class="foot__notice">安装包来自作者提交；人工审核收录不代表已通过病毒扫描。</p>
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
</style>
