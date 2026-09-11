<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean; title?: string; description?: string; wide?: boolean; drawer?: boolean; closeLabel?: string
}>(), { title: '', description: '', closeLabel: '关闭' })
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const panel = ref<HTMLDialogElement | null>(null)
const titleId = useId()
let previousOverflow = ''
let locked = false
function unlock() { if (locked) { document.body.style.overflow = previousOverflow; locked = false } }
function close() { emit('update:modelValue', false) }
function trapTab(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !panel.value) return
  const items = [...panel.value.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]')]
    .filter(el => el.tabIndex >= 0 && !el.matches(':disabled, [aria-disabled="true"]') && el.getClientRects().length > 0)
  const first = items[0], last = items.at(-1)
  if (!first) { event.preventDefault(); panel.value.focus(); return }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
async function sync() {
  await nextTick()
  if (props.modelValue && panel.value && !panel.value.open) {
    previousOverflow = document.body.style.overflow
    locked = true
    document.body.style.overflow = 'hidden'
    panel.value.showModal()
  } else if (!props.modelValue) { panel.value?.close(); unlock() }
}
function backdrop(event: MouseEvent) {
  if (event.target !== panel.value || !panel.value) return
  const rect = panel.value.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
}
watch(() => props.modelValue, sync)
onMounted(sync)
onBeforeUnmount(() => { panel.value?.close(); unlock() })
</script>

<template>
  <Teleport to="body">
    <dialog ref="panel" class="app-dialog" :class="{ 'app-dialog--wide': wide, 'app-dialog--drawer': drawer }" :aria-labelledby="titleId" @cancel.prevent="close" @click="backdrop" @keydown="trapTab">
      <header class="app-dialog__head">
        <div>
          <h2 :id="titleId">{{ title }}</h2>
          <p v-if="description" class="app-dialog__description">{{ description }}</p>
          <slot name="subtitle" />
        </div>
        <button type="button" class="btn btn--quiet btn--icon" :aria-label="closeLabel" @click="close"><AppIcon name="x" :size="19" /></button>
      </header>
      <div class="app-dialog__body"><slot /></div>
      <footer v-if="$slots.footer" class="app-dialog__foot"><slot name="footer" /></footer>
    </dialog>
  </Teleport>
</template>

<style scoped>
.app-dialog { padding: 0; border: 0; border-radius: var(--r-page); background: var(--surface); color: var(--text); width: min(36rem, calc(100% - 32px)); max-width: none; max-height: calc(100svh - 32px); box-shadow: var(--shadow-dialog); overflow: auto; overscroll-behavior: contain; }
.app-dialog[open] { display: flex; flex-direction: column; }
.app-dialog::backdrop { background: var(--backdrop); }
.app-dialog--wide { width: min(52rem, calc(100% - 32px)); }
.app-dialog--drawer { margin: 0 0 0 auto; width: min(44rem, calc(100% - 16px)); height: 100svh; max-height: 100svh; border-radius: var(--r-page) 0 0 var(--r-page); }
.app-dialog__head, .app-dialog__body, .app-dialog__foot { padding: var(--sp-6); }
.app-dialog__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-4); border-bottom: 1px solid var(--line); }
.app-dialog__head > div { min-width: 0; }
.app-dialog__head h2 { overflow-wrap: anywhere; }
.app-dialog__head .btn { flex: none; margin-top: -8px; margin-inline-end: -8px; }
.app-dialog__description { margin-top: var(--sp-2); color: var(--text-2); }
.app-dialog__body { min-height: 0; overflow-y: auto; overflow-wrap: anywhere; }
.app-dialog__foot { display: flex; gap: var(--sp-3); justify-content: flex-end; flex-wrap: wrap; border-top: 1px solid var(--line); }
@media (max-width: 640px) { .app-dialog__head, .app-dialog__body, .app-dialog__foot { padding: var(--sp-4); } .app-dialog__foot .btn { flex: 1; } }
</style>
