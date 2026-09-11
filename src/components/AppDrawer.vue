<script setup lang="ts">
import AppDialog from './AppDialog.vue'
withDefaults(defineProps<{ modelValue: boolean; title?: string; wide?: boolean }>(), { title: '' })
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>
<template>
  <AppDialog :model-value="modelValue" :title="title" :wide="wide" drawer @update:model-value="$emit('update:modelValue', $event)">
    <slot />
    <template v-if="$slots.subtitle" #subtitle><slot name="subtitle" /></template>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </AppDialog>
</template>
