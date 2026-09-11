<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <footer class="foot">
    <div class="wrap foot__in">
      <p>源码与安装包由作者发布于 GitHub。通过自动审核不保证无病毒，请自行确认设备与用途。</p>
      <p>
        <RouterLink to="/submit">提交插件</RouterLink> ·
        <RouterLink to="/me">个人中心</RouterLink> ·
        <span>© {{ year }} 张导插件商店</span>
      </p>
    </div>
  </footer>
</template>

<style scoped>
.foot__in a { color: var(--text-2); }
</style>
