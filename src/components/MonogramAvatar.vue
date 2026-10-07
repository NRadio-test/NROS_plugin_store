<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; size?: 'sm' | 'md' | 'lg'; round?: boolean }>(), { size: 'md' })

const label = computed(() => {
  const clean = props.name.replace(/[^\p{L}\p{N}]/gu, '')
  return (clean.slice(0, 2) || '?').toUpperCase()
})

</script>

<template>
  <span class="avatar" :class="[size !== 'md' && `avatar--${size}`, round && 'avatar--round']" aria-hidden="true">{{ label }}</span>
</template>
