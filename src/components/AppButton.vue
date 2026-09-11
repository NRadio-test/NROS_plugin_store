<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import type { IconName } from '../lib/icons'

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'danger-solid'
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  iconRight?: IconName
  loading?: boolean
  disabled?: boolean
  block?: boolean
  round?: boolean
  to?: string
  href?: string
  type?: 'button' | 'submit'
  title?: string
}>(), { variant: 'secondary', size: 'md', type: 'button', icon: undefined, iconRight: undefined, to: '', href: '', title: '' })

/** 变体映射到设计系统的按钮层级：主操作用信号青，其余靠表面层级区分。 */
const VARIANT_CLASS: Record<string, string> = {
  primary: 'btn--signal',
  secondary: 'btn--raised',
  ghost: 'btn--quiet',
  soft: 'btn--soft',
  danger: 'btn--danger',
  'danger-solid': 'btn--danger-solid',
}

const tag = computed(() => (props.to ? 'router-link' : props.href ? 'a' : 'button'))
const classes = computed(() => [
  'btn',
  VARIANT_CLASS[props.variant] ?? 'btn--raised',
  props.size === 'sm' && 'btn--sm',
  props.size === 'lg' && 'btn--primary-lg',
  props.block && 'btn--block',
  props.round && 'btn--round',
  (props.icon || props.iconRight) && !props.block && 'btn--with-icon',
])
const attrs = computed(() => {
  if (props.to) return { to: props.to }
  if (props.href) return { href: props.href, target: '_blank', rel: 'noopener noreferrer' }
  return { type: props.type, disabled: props.disabled || props.loading }
})
</script>

<template>
  <component :is="tag" :class="classes" v-bind="attrs" :aria-busy="loading || undefined" :title="title">
    <span v-if="loading" class="btn__spinner" aria-hidden="true" />
    <AppIcon v-else-if="icon" :name="icon" :size="size === 'sm' ? 17 : 19" />
    <slot />
    <AppIcon v-if="iconRight && !loading" :name="iconRight" :size="size === 'sm' ? 17 : 19" />
  </component>
</template>
