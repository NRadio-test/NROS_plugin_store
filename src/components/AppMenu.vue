<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useRoute } from 'vue-router'

withDefaults(defineProps<{ label: string; buttonClass?: string }>(), { buttonClass: 'btn btn--raised btn--icon' })
const id = useId()
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const open = ref(false)
const positioned = ref(false)
const route = useRoute()
function entries() { return [...(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])] }
function position() {
  if (!trigger.value || !menu.value || !open.value) return
  const anchor = trigger.value.getBoundingClientRect(), box = menu.value.getBoundingClientRect()
  const left = Math.max(12, Math.min(anchor.right - box.width, window.innerWidth - box.width - 12))
  const below = anchor.bottom + 6
  const top = below + box.height > window.innerHeight - 12 ? Math.max(12, anchor.top - box.height - 6) : below
  menu.value.style.left = `${left}px`; menu.value.style.top = `${top}px`
  positioned.value = true
}
async function toggle(event: Event) {
  open.value = (event as ToggleEvent).newState === 'open'
  if (open.value) { await nextTick(); position() } else positioned.value = false
}
function close() { menu.value?.hidePopover() }
async function openKeyboard(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
  event.preventDefault(); menu.value?.showPopover()
  await nextTick(); open.value = true; position()
  const items = entries(); (event.key === 'ArrowUp' ? items.at(-1) : items[0])?.focus()
}
function navigate(event: KeyboardEvent) {
  const items = entries(), index = items.indexOf(document.activeElement as HTMLElement)
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  } else if (event.key === 'Escape') { event.preventDefault(); close(); trigger.value?.focus() }
  else if (event.key === 'Tab') close()
}
function clicked(event: MouseEvent) { if ((event.target as HTMLElement).closest('[role="menuitem"]')) close() }
watch(() => route.fullPath, close)
window.addEventListener('resize', position)
window.addEventListener('scroll', position, true)
onBeforeUnmount(() => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true) })
</script>
<template>
  <button ref="trigger" type="button" :class="buttonClass" :popovertarget="id" aria-haspopup="menu" :aria-controls="id" :aria-expanded="open" :aria-label="label" @keydown="openKeyboard"><slot name="trigger" /></button>
  <Teleport to="body">
    <div :id="id" ref="menu" popover class="action-menu" role="menu" :aria-label="label" :class="positioned && 'action-menu--ready'" @toggle="toggle" @keydown="navigate" @click="clicked"><slot /></div>
  </Teleport>
</template>
<style scoped>
.action-menu { position: fixed; inset: auto; margin: 0; padding: var(--sp-1); min-width: 12rem; width: max-content; max-width: calc(100vw - 24px); max-height: calc(100svh - 24px); overflow-y: auto; border: 0; border-radius: var(--r-group); background: var(--surface-raised); color: var(--text); box-shadow: var(--shadow-dialog); opacity: 0; }
.action-menu:popover-open { display: flex; flex-direction: column; }
.action-menu--ready { opacity: 1; }
.action-menu :deep(.menu__item) { display: flex; align-items: center; gap: var(--sp-3); min-height: 44px; padding: var(--sp-2) var(--sp-3); border: 0; border-radius: var(--r-control); background: transparent; color: var(--text-2); font-size: var(--fs-sm); text-decoration: none; text-align: start; }
.action-menu :deep(.menu__item:hover) { background: var(--surface-hover); color: var(--text); }
.action-menu :deep(.menu__item:disabled) { opacity: 0.45; cursor: not-allowed; }
.action-menu :deep(.menu__item--danger) { color: var(--danger); }
.action-menu :deep(.menu__sep) { height: 1px; background: var(--line); margin: var(--sp-1) var(--sp-2); }
</style>
