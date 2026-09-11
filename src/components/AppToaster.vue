<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { toasts, dismiss } from '../lib/toast'
import type { IconName } from '../lib/icons'

const iconFor: Record<string, IconName> = { success: 'check-circle', danger: 'alert-circle', warning: 'alert', info: 'info' }
</script>

<template>
  <div class="toaster" role="region" aria-label="操作提示">
    <TransitionGroup name="toast">
      <div v-for="item in toasts" :key="item.id" class="toast" :class="[`toast--${item.kind}`, item.leaving && 'toast--leaving']" role="status">
        <span class="toast__icon"><AppIcon :name="iconFor[item.kind] || 'info'" :size="18" /></span>
        <div class="toast__body">
          <p class="toast__title">{{ item.title }}</p>
          <p v-if="item.description" class="toast__desc">{{ item.description }}</p>
        </div>
        <button class="toast__close" type="button" aria-label="关闭提示" @click="dismiss(item.id)"><AppIcon name="x" :size="15" /></button>
      </div>
    </TransitionGroup>
  </div>
</template>
