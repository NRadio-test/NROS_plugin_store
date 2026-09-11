<script setup lang="ts">
import { ref, useId, watchPostEffect } from 'vue'

const props = withDefaults(defineProps<{
  label?: string
  forId?: string
  hint?: string
  error?: string
  required?: boolean
  optional?: boolean
}>(), { label: '', forId: undefined, hint: '', error: '' })
const field = ref<HTMLElement | null>(null)
const hintId = useId()
watchPostEffect(() => {
  const control = field.value?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type="checkbox"]), textarea, select')
  if (!control || control.id !== props.forId) return
  const described = (control.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== hintId)
  if (props.error || props.hint) described.push(hintId)
  if (described.length) control.setAttribute('aria-describedby', described.join(' '))
  else control.removeAttribute('aria-describedby')
  if (props.error) control.setAttribute('aria-invalid', 'true')
  else control.removeAttribute('aria-invalid')
})
</script>

<template>
  <div ref="field" class="field">
    <div v-if="label" class="field__head">
      <label class="field__label" :for="forId">{{ label }}</label>
      <span v-if="required" class="field__flag" aria-hidden="true">必填</span>
      <span v-else-if="optional" class="field__flag">可选</span>
    </div>
    <slot />
    <p v-if="error" :id="hintId" class="field__hint field__hint--error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field__head { display: flex; align-items: baseline; gap: 8px; }
.field__flag {
  padding: 1px 7px;
  border-radius: var(--r-full);
  background: var(--bg-subtle);
  color: var(--text-tertiary);
  font-size: var(--text-micro);
  font-weight: 600;
}
</style>
