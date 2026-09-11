<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{ modelValue: boolean; title?: string; wide?: boolean }>(), { title: '' })
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const panel = ref<HTMLElement | null>(null)

function close() { emit('update:modelValue', false) }
function onKeydown(event: KeyboardEvent) { if (event.key === 'Escape') close() }

watch(() => props.modelValue, async open => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) {
    window.addEventListener('keydown', onKeydown)
    await nextTick()
    panel.value?.focus()
  } else {
    window.removeEventListener('keydown', onKeydown)
  }
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="overlay drawer-wrap" @click.self="close">
      <aside ref="panel" class="drawer" :class="wide && 'drawer--wide'" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
        <header class="drawer__head">
          <div>
            <h2 v-if="title" class="modal__title">{{ title }}</h2>
            <slot name="subtitle" />
          </div>
          <button type="button" class="btn btn--ghost btn--sm btn--icon" aria-label="关闭" @click="close"><AppIcon name="x" :size="17" /></button>
        </header>
        <div class="drawer__body"><slot /></div>
        <footer v-if="$slots.footer" class="drawer__foot"><slot name="footer" /></footer>
      </aside>
    </div>
  </Teleport>
</template>
