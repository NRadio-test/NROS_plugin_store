import { reactive } from 'vue'

export type ToastKind = 'success' | 'danger' | 'warning' | 'info'
export interface ToastItem { id: number; kind: ToastKind; title: string; description?: string; leaving?: boolean }

let sequence = 0
export const toasts = reactive<ToastItem[]>([])

function push(kind: ToastKind, title: string, description?: string, duration = 4200) {
  const id = ++sequence
  toasts.push({ id, kind, title, description })
  setTimeout(() => dismiss(id), duration)
  return id
}

export function dismiss(id: number) {
  const item = toasts.find(entry => entry.id === id)
  if (!item || item.leaving) return
  item.leaving = true
  setTimeout(() => {
    const index = toasts.findIndex(entry => entry.id === id)
    if (index >= 0) toasts.splice(index, 1)
  }, 180)
}

export const toast = {
  success: (title: string, description?: string) => push('success', title, description),
  error: (title: string, description?: string) => push('danger', title, description, 6000),
  warning: (title: string, description?: string) => push('warning', title, description, 5200),
  info: (title: string, description?: string) => push('info', title, description),
}
