<script setup lang="ts">
import { ref, watch } from 'vue'
import MonogramAvatar from './MonogramAvatar.vue'

const props = withDefaults(defineProps<{ name: string; src?: string; size?: 'sm' | 'md' | 'lg' }>(), { src: '', size: 'md' })
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
</script>

<template>
  <span class="user-avatar" :class="`user-avatar--${size}`" aria-hidden="true">
    <img v-if="src && !failed" :src="src" alt="" referrerpolicy="no-referrer" decoding="async" @error="failed = true">
    <MonogramAvatar v-else :name="name" :size="size" round />
  </span>
</template>

<style scoped>
.user-avatar { display: inline-flex; flex: none; width: 40px; height: 40px; border-radius: 50%; overflow: hidden; background: var(--surface-raised); }
.user-avatar--sm { width: 28px; height: 28px; }
.user-avatar--lg { width: 64px; height: 64px; }
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
.user-avatar :deep(.avatar) { width: 100%; height: 100%; }
</style>
