<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import AppButton from './AppButton.vue'
import { loadSession, post, session } from '../lib/api'
import { isDarkMode, toggleTheme } from '../lib/theme'

const route = useRoute()
const router = useRouter()
const menuOpen = ref(false)
const menu = ref<HTMLElement | null>(null)

const links = [
  { to: '/', label: '插件市场', icon: 'compass' as const },
  { to: '/submit', label: '提交插件', icon: 'upload' as const },
]

const account = computed(() => session.user?.phone_mask || '')

function onDocumentClick(event: MouseEvent) {
  if (menuOpen.value && menu.value && !menu.value.contains(event.target as Node)) menuOpen.value = false
}
function onKeydown(event: KeyboardEvent) { if (event.key === 'Escape') menuOpen.value = false }
document.addEventListener('click', onDocumentClick)
document.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
watch(() => route.fullPath, () => { menuOpen.value = false })

async function logout() {
  menuOpen.value = false
  try {
    await post('/api/logout')
    await loadSession()
    await router.push('/')
  } catch { /* 退出失败时保持当前会话，用户可重试。 */ }
}
</script>

<template>
  <header class="top">
    <div class="wrap top__in">
      <RouterLink to="/" class="brand" aria-label="张导插件商店 首页">
        <span class="signal-mark" aria-hidden="true"><i /><i /><i /></span>
        <span class="brand__name">张导插件商店</span>
      </RouterLink>

      <nav class="nav" aria-label="主要导航">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          :aria-current="(link.to === '/' ? route.path === '/' || route.path.startsWith('/plugins') : route.path.startsWith(link.to)) ? 'page' : undefined"
        >
          <AppIcon :name="link.icon" :size="16" />
          <span class="nav__label">{{ link.label }}</span>
        </RouterLink>
      </nav>

      <div class="top__end">
        <button class="btn btn--quiet btn--icon" type="button" :aria-label="isDarkMode ? '切换到浅色主题' : '切换到深色主题'" @click="toggleTheme">
          <AppIcon :name="isDarkMode ? 'sun' : 'moon'" :size="19" />
        </button>

        <div v-if="session.user" ref="menu" class="menu-wrap">
          <button class="btn btn--raised" type="button" :aria-expanded="menuOpen" aria-haspopup="menu" @click="menuOpen = !menuOpen">
            <AppIcon name="user" :size="17" />
            <span class="account__label">{{ account }}</span>
          </button>
          <div v-if="menuOpen" class="menu" role="menu">
            <RouterLink to="/me" class="menu__item" role="menuitem"><AppIcon name="user" :size="17" />个人中心</RouterLink>
            <RouterLink to="/submit" class="menu__item" role="menuitem"><AppIcon name="upload" :size="17" />提交插件</RouterLink>
            <div class="menu__sep" />
            <button type="button" class="menu__item" role="menuitem" @click="logout"><AppIcon name="log-out" :size="17" />退出登录</button>
          </div>
        </div>
        <AppButton v-else to="/login" variant="primary" icon="user">
          <span class="account__label">手机号进入</span>
        </AppButton>
      </div>
    </div>
  </header>
</template>

<style scoped>
.menu-wrap { position: relative; }
.menu { top: calc(100% + 6px); right: 0; }
.menu__item { text-decoration: none; }
</style>
