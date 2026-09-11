<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { toast } from '../lib/toast'

const props = withDefaults(defineProps<{ value: string; label?: string; floating?: boolean; size?: number }>(), {
  label: '已复制',
  size: 16,
})
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
  } catch {
    const area = document.createElement('textarea')
    area.value = props.value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
  copied.value = true
  toast.success(props.label)
  setTimeout(() => { copied.value = false }, 1600)
}
</script>

<template>
  <button
    type="button"
    class="copy-btn"
    :class="floating && 'copy-btn--floating'"
    :aria-label="copied ? '已复制' : '复制'"
    @click.stop="copy"
  >
    <AppIcon :name="copied ? 'check' : 'copy'" :size="size" />
  </button>
</template>
