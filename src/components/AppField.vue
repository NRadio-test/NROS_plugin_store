<script setup lang="ts">
withDefaults(defineProps<{
  label?: string
  forId?: string
  hint?: string
  error?: string
  required?: boolean
  optional?: boolean
}>(), { label: '', forId: undefined, hint: '', error: '' })
</script>

<template>
  <div class="field">
    <div v-if="label" class="field__head">
      <label class="field__label" :for="forId">{{ label }}</label>
      <span v-if="required" class="field__flag" aria-hidden="true">必填</span>
      <span v-else-if="optional" class="field__flag">可选</span>
    </div>
    <slot />
    <p v-if="error" class="field__hint field__hint--error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="field__hint">{{ hint }}</p>
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
