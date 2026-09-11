<!-- 搜索框：结构参考 Astrbot_Plugins_Market SearchToolbar.vue，GPL-3.0，2026 年重新设计。 -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ searchQuery: string; currentPage: number; size?: 'md' | 'lg' }>()
const emit = defineEmits<{ 'update:searchQuery': [value: string]; 'update:currentPage': [value: number] }>()
const input = ref<HTMLInputElement | null>(null)

function onInput(event: Event) {
  emit('update:searchQuery', (event.target as HTMLInputElement).value)
  if (props.currentPage > 1) emit('update:currentPage', 1)
}
function clear() {
  emit('update:searchQuery', '')
  if (props.currentPage > 1) emit('update:currentPage', 1)
  input.value?.focus()
}
/** “/” 或 ⌘K / Ctrl+K 聚焦搜索框，焦点已在输入控件时不抢占。 */
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  if (typing) return
  if (event.key === '/' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
    event.preventDefault()
    input.value?.focus()
    input.value?.select()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="search" :class="size === 'lg' && 'search--lg'">
    <AppIcon name="search" :size="18" class="search__icon" />
    <label for="plugin-search" class="sr-only">搜索插件名称或描述</label>
    <input
      id="plugin-search"
      ref="input"
      type="search"
      :value="searchQuery"
      placeholder="搜索插件名称或描述…"
      maxlength="200"
      autocomplete="off"
      spellcheck="false"
      @input="onInput"
    />
    <button v-if="searchQuery" type="button" class="search__clear" aria-label="清空搜索" @click="clear">
      <AppIcon name="x" :size="15" />
    </button>
    <span v-else class="search__kbd" aria-hidden="true"><kbd>⌘</kbd><kbd>K</kbd></span>
  </div>
</template>

<style scoped>
.search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  padding: 0 12px 0 14px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-md);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out);
}
.search--lg { height: 56px; padding: 0 14px 0 18px; border-radius: var(--r-lg); box-shadow: var(--shadow-md); }
.search:hover { border-color: var(--border-strong); }
.search:focus-within { border-color: var(--primary); box-shadow: var(--ring), var(--shadow-md); }
.search__icon { color: var(--text-tertiary); flex: none; }
.search input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font-size: var(--text-read);
  outline: none;
}
.search--lg input { font-size: 1.0625rem; }
.search input::placeholder { color: var(--text-tertiary); }
.search input::-webkit-search-cancel-button { display: none; }
.search__clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px; height: 26px;
  border: 0;
  border-radius: var(--r-xs);
  background: var(--bg-subtle);
  color: var(--text-tertiary);
}
.search__clear:hover { background: var(--bg-hover); color: var(--text-primary); }
.search__kbd { display: inline-flex; gap: 3px; flex: none; }
@media (max-width: 560px) { .search__kbd { display: none; } }
</style>
