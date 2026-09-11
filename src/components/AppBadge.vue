<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'solid'
  dot?: boolean
  pulse?: boolean
  title?: string
}>(), { variant: 'neutral', title: '' })
</script>

<template>
  <span class="badge" :class="[`badge--${variant}`, pulse && 'badge--pulse']" :title="title">
    <span v-if="dot" class="badge__dot" aria-hidden="true" />
    <slot />
  </span>
</template>
