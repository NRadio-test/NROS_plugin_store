<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  description?: string
  wide?: boolean
  closeLabel?: string
}>(), { title: '', description: '', closeLabel: '关闭' })
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const panel = ref<HTMLElement | null>(null)

function close() { emit('update:modelValue', false) }
function onKeydown(event: KeyboardEvent) { if (event.key === 'Escape') close() }

watch(() => props.modelValue, async open => {
  document.body.style.overflow = open ? 'hidden' : ''
  if (open) {
    window.addEventListener('keydown', onKeydown)
    await nextTick()
    panel.value?.querySelector<HTMLElement>('input, textarea, select, button:not(.modal__close)')?.focus()
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
    <div v-if="modelValue" class="overlay" @click.self="close">
      <div ref="panel" class="modal" :class="wide && 'modal--wide'" role="dialog" aria-modal="true" :aria-label="title">
        <header class="modal__head">
          <div>
            <h2 v-if="title" class="modal__title">{{ title }}</h2>
            <p v-if="description" class="modal__desc">{{ description }}</p>
          </div>
          <button type="button" class="btn btn--ghost btn--sm btn--icon modal__close" :aria-label="closeLabel" @click="close">
            <AppIcon name="x" :size="17" />
          </button>
        </header>
        <div class="modal__body"><slot /></div>
        <footer v-if="$slots.footer" class="modal__foot"><slot name="footer" /></footer>
      </div>
    </div>
  </Teleport>
</template>
