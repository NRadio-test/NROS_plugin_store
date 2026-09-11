<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'text' | 'block' | 'card' | 'row'; width?: string; height?: string }>(), { variant: 'block', width: '', height: '' })
</script>

<template>
  <div v-if="variant === 'card'" class="skeleton-card" aria-hidden="true">
    <div class="skeleton skeleton--block" style="height: 20px; width: 42%" />
    <div class="skeleton skeleton--text" style="width: 78%" />
    <div class="skeleton skeleton--text" style="width: 92%" />
    <div class="skeleton skeleton--text" style="width: 56%" />
    <div class="row gap-2" style="margin-top: 6px">
      <div class="skeleton skeleton--block" style="height: 32px; width: 84px; border-radius: 9px" />
      <div class="skeleton skeleton--block" style="height: 32px; width: 104px; border-radius: 9px" />
    </div>
  </div>
  <div v-else-if="variant === 'row'" class="skeleton skeleton--text" :style="{ width: width || '100%' }" aria-hidden="true" />
  <div v-else class="skeleton" :class="variant === 'text' && 'skeleton--text'" :style="{ width, height }" aria-hidden="true" />
</template>

<style scoped>
.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-lg);
  background: var(--bg-card);
}
</style>
