<script setup lang="ts">
import AppDialog from './AppDialog.vue'
withDefaults(defineProps<{ modelValue: boolean; title?: string; description?: string; wide?: boolean; closeLabel?: string }>(), { title: '', description: '', closeLabel: '关闭' })
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>
<template>
  <AppDialog :model-value="modelValue" :title="title" :description="description" :wide="wide" :close-label="closeLabel" @update:model-value="$emit('update:modelValue', $event)">
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </AppDialog>
</template>
