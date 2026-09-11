<script setup lang="ts">
import { computed } from 'vue'
import { icons, type IconName } from '../lib/icons'

const props = withDefaults(defineProps<{ name: IconName; size?: number | string }>(), { size: 19 })
const markup = computed(() => icons[props.name])
const pixels = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size))
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- 模板只渲染 lib/icons.ts 的常量路径，不接受任何外部输入 -->
  <svg
    class="icon"
    :style="{ width: pixels, height: pixels }"
    viewBox="0 0 256 256"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    v-html="markup"
  />
</template>

<style scoped>
.icon { flex: none; display: block; }
</style>
