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

<style scoped>
.toaster { position: fixed; z-index: 100; right: max(16px, env(safe-area-inset-right)); bottom: max(16px, env(safe-area-inset-bottom)); width: min(25rem, calc(100vw - 32px)); display: flex; flex-direction: column; gap: var(--sp-3); pointer-events: none; }
.toast { display: flex; gap: var(--sp-3); align-items: flex-start; padding: var(--sp-4); border-radius: var(--r-group); background: var(--surface-raised); color: var(--text); box-shadow: var(--shadow-dialog); pointer-events: auto; }
.toast__icon { flex: none; padding-top: 4px; color: var(--signal-text); }
.toast--success .toast__icon { color: var(--success); }
.toast--danger .toast__icon { color: var(--danger); }
.toast--warning .toast__icon { color: var(--warning); }
.toast__body { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.toast__title { font-size: var(--fs-body); font-weight: 600; }
.toast__desc { margin-top: var(--sp-1); font-size: var(--fs-sm); color: var(--text-2); }
.toast__close { display: grid; place-items: center; flex: none; width: 44px; height: 44px; margin: -8px -8px -8px 0; padding: 0; border: 0; border-radius: var(--r-control); color: var(--text-2); background: transparent; }
.toast__close:hover { background: var(--surface-hover); }
.toast-enter-active, .toast-leave-active { transition: transform var(--dur) var(--ease), opacity var(--dur) var(--ease); }
.toast-enter-from, .toast-leave-to, .toast--leaving { opacity: 0; transform: translateY(8px); }
</style>
