<script setup lang="ts">
import { session } from '../lib/api'
import AppIcon from './AppIcon.vue'
import AppButton from './AppButton.vue'
</script>

<template>
  <section class="sec">
    <header class="sec__head">
      <span class="sec__who"><AppIcon name="user" :size="15" />{{ session.admin?.username }}</span>
    </header>
    <AppButton variant="primary" icon="lock" href="https://msg.zdwifi.com/studio">去留言箱改密</AppButton>
  </section>
</template>

<style scoped>
.sec { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; }
.sec__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sec__who { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border: 1px solid var(--line); border-radius: var(--r-pill); background: var(--surface); font-size: var(--fs-sm); font-weight: 600; }
</style>
