<!-- 分页：桌面显示页码窗口，移动端收敛为上一页/下一页。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ modelValue: number; totalPages: number; total?: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const width = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const slot = computed(() => (width.value <= 560 ? 0 : width.value <= 900 ? 5 : 7))
const onResize = () => { width.value = window.innerWidth }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

type Slot = number | 'gap'
const pages = computed<Slot[]>(() => {
  const total = props.totalPages
  if (slot.value === 0 || total <= slot.value) return Array.from({ length: Math.min(total, 7) }, (_, index) => index + 1)
  const half = Math.floor(slot.value / 2)
  const start = Math.max(1, Math.min(props.modelValue - half, total - slot.value + 1))
  const list: Slot[] = Array.from({ length: slot.value }, (_, index) => start + index)
  if ((list[0] as number) > 1) { list[0] = 1; if ((list[1] as number) > 2) list.splice(1, 1, 'gap') }
  if ((list.at(-1) as number) < total) {
    list[list.length - 1] = total
    if ((list[list.length - 2] as number) < total - 1) list.splice(list.length - 1, 0, 'gap')
  }
  return list
})
const go = (page: number) => { if (page >= 1 && page <= props.totalPages && page !== props.modelValue) emit('update:modelValue', page) }
</script>

<template>
  <nav v-if="totalPages > 1" class="pagination" aria-label="分页导航">
    <button type="button" class="pagination__btn" :disabled="modelValue <= 1" aria-label="上一页" @click="go(modelValue - 1)">
      <AppIcon name="chevron-left" :size="16" />
    </button>
    <template v-for="(page, index) in pages" :key="`${page}-${index}`">
      <span v-if="page === 'gap'" class="pagination__gap" aria-hidden="true">···</span>
      <button
        v-else
        type="button"
        class="pagination__btn"
        :aria-current="page === modelValue ? 'page' : undefined"
        :aria-label="`第 ${page} 页`"
        @click="go(page)"
      >
        {{ page }}
      </button>
    </template>
    <button type="button" class="pagination__btn" :disabled="modelValue >= totalPages" aria-label="下一页" @click="go(modelValue + 1)">
      <AppIcon name="chevron-right" :size="16" />
    </button>
    <span class="pagination__info">
      第 {{ modelValue }} / {{ totalPages }} 页<span v-if="total !== undefined"> · 共 {{ total }} 项</span>
    </span>
  </nav>
</template>
