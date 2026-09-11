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
    <span v-else class="search__kbd" aria-hidden="true"><kbd>/</kbd></span>
  </div>
</template>

<style scoped>
.search {
  display: flex; align-items: center; gap: var(--sp-3);
  width: 100%; min-width: 0; height: 48px; padding-inline: var(--sp-4) var(--sp-2);
  border: 1px solid var(--line-strong); border-radius: var(--r-control);
  background: var(--surface); box-shadow: none;
}
.search--lg { height: 56px; }
.search:hover { border-color: var(--signal-text); }
.search:has(input:focus-visible) { outline: 2px solid var(--signal); outline-offset: 2px; }
.search__icon { position: static; color: var(--text-3); flex: none; }
.search input {
  flex: 1; min-width: 0; width: 100%; height: 100%; padding: 0;
  border: 0; border-radius: 0; background: transparent; color: var(--text);
  font: inherit; outline: none;
}
.search input::placeholder { color: var(--text-3); }
.search input::-webkit-search-cancel-button { display: none; }
.search__clear {
  position: static; flex: none; display: grid; place-items: center;
  width: 44px; height: 44px; border: 0; border-radius: var(--r-control);
  background: transparent; color: var(--text-2);
}
.search__clear:hover { background: var(--surface-hover); color: var(--text); }
.search__clear:active { transform: scale(0.95); }
.search__kbd { position: static; flex: none; padding-inline: var(--sp-2); }
.search__kbd kbd { display: grid; place-items: center; min-width: 24px; height: 26px; border: 1px solid var(--line); border-radius: 6px; font-family: var(--font-mono); font-size: var(--fs-cap); color: var(--text-3); }
@media (max-width: 640px) { .search__kbd { display: none; } }
</style>
