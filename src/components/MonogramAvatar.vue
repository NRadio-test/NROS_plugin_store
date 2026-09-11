<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; size?: 'sm' | 'md' | 'lg'; round?: boolean }>(), { size: 'md' })

/** 由名称确定性推导字母标与配色，避免额外请求外部头像服务。 */
const label = computed(() => {
  const clean = props.name.replace(/[^\p{L}\p{N}]/gu, '')
  return (clean.slice(0, 2) || '?').toUpperCase()
})
const gradient = computed(() => {
  let hash = 0
  for (const char of props.name) hash = (hash * 31 + char.codePointAt(0)!) % 997
  return `avatar--g${hash % 6}`
})
</script>

<template>
  <span class="avatar" :class="[gradient, size !== 'md' && `avatar--${size}`, round && 'avatar--round']" aria-hidden="true">{{ label }}</span>
</template>
