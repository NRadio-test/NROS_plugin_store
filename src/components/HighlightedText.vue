<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string; query?: string }>()
const parts = computed(() => {
  const query = props.query?.trim()
  if (!query) return [{ text: props.text, matched: false }]
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(literal, 'giu')
  const result: Array<{ text: string; matched: boolean }> = []
  let offset = 0
  for (const match of props.text.matchAll(pattern)) {
    const position = match.index!
    if (position > offset) result.push({ text: props.text.slice(offset, position), matched: false })
    result.push({ text: match[0], matched: true })
    offset = position + match[0].length
  }
  if (offset < props.text.length) result.push({ text: props.text.slice(offset), matched: false })
  return result
})
</script>

<template><template v-for="(part, index) in parts" :key="index"><mark v-if="part.matched">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></template>

<style scoped>
mark { background: var(--signal-surface); color: var(--signal-text); border-radius: 2px; }
</style>
