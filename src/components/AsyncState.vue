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
        <div v-for="index in skeletonCount" :key="index" class="async-row" aria-hidden="true"><div class="async-row__body"><AppSkeleton variant="row" width="42%" /><AppSkeleton variant="row" width="82%" /><AppSkeleton variant="row" width="28%" /></div><AppSkeleton class="async-row__action" height="44px" width="88px" /></div>
      </div>
    </slot>
    <span class="sr-only">正在加载</span>
  </div>

  <div v-else-if="error" class="empty empty--error" role="alert">
    <span class="empty__icon"><AppIcon name="alert" :size="22" /></span>
    <h3 class="empty__title">加载失败</h3>
    <p class="empty__text">{{ error }}</p>
    <AppButton icon="refresh" class="empty__action" @click="$emit('retry')">重新加载</AppButton>
  </div>

  <div v-else-if="empty" class="empty">
    <span class="empty__icon"><AppIcon :name="emptyIcon" :size="22" /></span>
    <h3 class="empty__title">{{ emptyTitle || '暂无内容' }}</h3>
    <p class="empty__text">{{ emptyText || '稍后再试。' }}</p>
    <slot name="empty" />
  </div>

  <slot v-else />
</template>

<style scoped>
.async-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; }
.async-rows { display: flex; flex-direction: column; border-top: 1px solid var(--line); }
.async-row { display: flex; align-items: center; gap: var(--sp-6); padding: var(--sp-6) var(--sp-3); border-bottom: 1px solid var(--line); }
.async-row__body { flex: 1; display: flex; flex-direction: column; gap: var(--sp-3); min-width: 0; }
.async-row__action { flex: none; }
.empty--error .empty__icon { background: var(--danger-surface); color: var(--danger); }
.empty__action { margin-top: var(--sp-3); }

@media (max-width: 640px) { .async-grid { grid-template-columns: 1fr; } }
</style>
