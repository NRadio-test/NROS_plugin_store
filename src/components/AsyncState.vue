<script setup lang="ts">
import AppSkeleton from './AppSkeleton.vue'
import AppIcon from './AppIcon.vue'
import AppButton from './AppButton.vue'
import type { IconName } from '../lib/icons'

withDefaults(defineProps<{
  loading?: boolean
  error?: string
  empty?: boolean
  emptyTitle?: string
  emptyText?: string
  emptyIcon?: IconName
  skeleton?: 'card' | 'row'
  skeletonCount?: number
}>(), { error: '', emptyTitle: '', emptyText: '', emptyIcon: 'inbox', skeleton: 'card', skeletonCount: 6 })
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="loading" aria-busy="true" aria-live="polite">
    <slot name="loading">
      <div v-if="skeleton === 'card'" class="async-grid">
        <AppSkeleton v-for="index in skeletonCount" :key="index" variant="card" />
      </div>
      <div v-else class="async-rows">
        <AppSkeleton v-for="index in skeletonCount" :key="index" variant="row" :width="`${90 - index * 7}%`" />
      </div>
    </slot>
    <span class="sr-only">正在加载</span>
  </div>

  <div v-else-if="error" class="empty" role="alert">
    <span class="empty__icon" style="background: var(--danger-surface); color: var(--danger-text)"><AppIcon name="alert" :size="22" /></span>
    <h3 class="empty__title">暂时无法加载</h3>
    <p class="empty__text">{{ error }}</p>
    <AppButton icon="refresh" style="margin-top: 8px" @click="$emit('retry')">重新加载</AppButton>
  </div>

  <div v-else-if="empty" class="empty">
    <span class="empty__icon"><AppIcon :name="emptyIcon" :size="22" /></span>
    <h3 class="empty__title">{{ emptyTitle || '这里还没有内容' }}</h3>
    <p class="empty__text">{{ emptyText || '稍后再来看看。' }}</p>
    <slot name="empty" />
  </div>

  <slot v-else />
</template>

<style scoped>
.async-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; }
.async-rows { display: flex; flex-direction: column; gap: 14px; padding: 16px; }
@media (max-width: 640px) { .async-grid { grid-template-columns: 1fr; } }
</style>
