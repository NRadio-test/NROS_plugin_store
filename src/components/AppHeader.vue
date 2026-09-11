<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import AppButton from './AppButton.vue'
import MonogramAvatar from './MonogramAvatar.vue'
import { loadSession, post, session } from '../lib/api'
import { isDarkMode, toggleTheme } from '../lib/theme'

const route = useRoute()
const router = useRouter()
const mobileOpen = ref(false)
const menuOpen = ref(false)
const menu = ref<HTMLElement | null>(null)

const links = [
  { to: '/', label: '插件市场', icon: 'compass' as const },
  { to: '/submit', label: '提交插件', icon: 'upload' as const },
]

const initials = computed(() => session.user?.phone_mask || '我')

function onDocumentClick(event: MouseEvent) {
  if (menuOpen.value && menu.value && !menu.value.contains(event.target as Node)) menuOpen.value = false
}
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  menuOpen.value = false
  mobileOpen.value = false
}
document.addEventListener('click', onDocumentClick)
document.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

watch(() => route.fullPath, () => { mobileOpen.value = false; menuOpen.value = false })

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
  <header class="site-header">
    <div class="header-inner">
      <RouterLink to="/" class="brand" aria-label="张导插件商店 首页">
        <svg class="brand__logo" viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="zdBrand" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#2f5bff" />
              <stop offset="0.5" stop-color="#6a4bff" />
              <stop offset="1" stop-color="#12b5cb" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="9" fill="url(#zdBrand)" />
          <path d="M16 6.8 24.6 11.6v8.8L16 25.2 7.4 20.4v-8.8Z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round" opacity=".96" />
          <path d="M7.7 11.8 16 16.2l8.3-4.4M16 16.4V25" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" opacity=".96" />
        </svg>
        <span class="brand__text">
          <span class="brand__name">张导插件商店</span>
          <span class="brand__tag">IPK · GitHub Release</span>
        </span>
      </RouterLink>

      <nav class="header-nav" aria-label="主要导航">
        <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav-link" active-class="nav-link--active" :class="{ 'nav-link--active': link.to === '/' && route.path.startsWith('/plugins') }">
          <AppIcon :name="link.icon" :size="16" />
          <span>{{ link.label }}</span>
        </RouterLink>
      </nav>

      <div class="header-actions">
        <button type="button" class="icon-btn" :aria-label="isDarkMode ? '切换到浅色主题' : '切换到深色主题'" :title="isDarkMode ? '浅色主题' : '深色主题'" @click="toggleTheme">
          <AppIcon :name="isDarkMode ? 'sun' : 'moon'" :size="17" />
        </button>

        <div v-if="session.user" ref="menu" class="user-menu">
          <button type="button" class="user-trigger" :aria-expanded="menuOpen" aria-haspopup="menu" @click="menuOpen = !menuOpen">
            <MonogramAvatar :name="initials" size="sm" />
            <span class="user-trigger__label">{{ session.user.phone_mask }}</span>
            <AppIcon name="chevron-down" :size="14" />
          </button>
          <Transition name="pop">
            <div v-if="menuOpen" class="menu user-menu__panel" role="menu">
              <RouterLink to="/me" class="menu__item" role="menuitem"><AppIcon name="user" :size="16" />个人中心</RouterLink>
              <RouterLink to="/submit" class="menu__item" role="menuitem"><AppIcon name="upload" :size="16" />提交插件</RouterLink>
              <div class="menu__sep" />
              <button type="button" class="menu__item menu__item--danger" role="menuitem" @click="logout"><AppIcon name="log-out" :size="16" />退出登录</button>
            </div>
          </Transition>
        </div>
        <AppButton v-else to="/login" variant="primary" size="sm" icon="user">手机号进入</AppButton>

        <button type="button" class="icon-btn nav-toggle" :aria-expanded="mobileOpen" aria-label="展开导航" @click="mobileOpen = !mobileOpen">
          <AppIcon :name="mobileOpen ? 'x' : 'menu'" :size="18" />
        </button>
      </div>
    </div>

    <Transition name="pop">
      <nav v-if="mobileOpen" class="mobile-nav" aria-label="移动端导航">
        <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="mobile-nav__link">
          <AppIcon :name="link.icon" :size="17" /><span>{{ link.label }}</span><AppIcon name="chevron-right" :size="15" />
        </RouterLink>
        <RouterLink :to="session.user ? '/me' : '/login'" class="mobile-nav__link">
          <AppIcon name="user" :size="17" /><span>{{ session.user ? '个人中心' : '手机号进入' }}</span><AppIcon name="chevron-right" :size="15" />
        </RouterLink>
      </nav>
    </Transition>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--glass-bg);
  backdrop-filter: saturate(180%) blur(14px);
  border-bottom: 1px solid var(--glass-border);
}
.header-inner {
  display: flex;
  align-items: center;
  gap: 14px;
  width: min(var(--container-wide), 100% - 48px);
  height: var(--header-h);
  margin-inline: auto;
}
.brand { display: inline-flex; align-items: center; gap: 11px; color: var(--text-primary); text-decoration: none; flex: none; }
.brand:hover { text-decoration: none; color: var(--text-primary); }
.brand__logo { width: 34px; height: 34px; border-radius: 10px; box-shadow: var(--shadow-sm); transition: transform var(--dur-2) var(--ease-out); }
.brand:hover .brand__logo { transform: translateY(-1px) rotate(-3deg); }
.brand__text { display: flex; flex-direction: column; line-height: 1.15; }
.brand__name { font-size: 0.9688rem; font-weight: 680; letter-spacing: -0.02em; }
.brand__tag { font-size: 0.6875rem; font-weight: 550; color: var(--text-tertiary); letter-spacing: 0.02em; }

.header-nav { display: flex; align-items: center; gap: 2px; margin-inline-start: 14px; }
.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 13px;
  border-radius: var(--r-sm);
  color: var(--text-secondary);
  font-size: var(--text-body);
  font-weight: 600;
  text-decoration: none;
  transition: background-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
}
.nav-link:hover { background: var(--bg-hover); color: var(--text-primary); text-decoration: none; }
.nav-link--active { background: var(--primary-surface); color: var(--primary-text); }

.header-actions { display: flex; align-items: center; gap: 8px; margin-inline-start: auto; }
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px; height: 36px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  box-shadow: var(--shadow-xs);
  transition: all var(--dur-1) var(--ease-out);
}
.icon-btn:hover { color: var(--text-primary); border-color: var(--border-strong); background: var(--bg-hover); }
.nav-toggle { display: none; }

.user-menu { position: relative; }
.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px 0 5px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-full);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: var(--text-small);
  font-weight: 600;
  box-shadow: var(--shadow-xs);
  transition: all var(--dur-1) var(--ease-out);
}
.user-trigger:hover { border-color: var(--border-strong); background: var(--bg-hover); }
.user-trigger__label { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.user-menu__panel { position: absolute; top: calc(100% + 8px); right: 0; }

.mobile-nav { display: none; flex-direction: column; gap: 2px; padding: 10px 16px 16px; border-top: 1px solid var(--border-subtle); }
.mobile-nav__link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px;
  border-radius: var(--r-sm);
  color: var(--text-primary);
  font-size: var(--text-read);
  font-weight: 600;
  text-decoration: none;
}
.mobile-nav__link:hover { background: var(--bg-hover); text-decoration: none; }
.mobile-nav__link > :last-child { margin-inline-start: auto; color: var(--text-tertiary); }

.pop-enter-active, .pop-leave-active { transition: opacity var(--dur-2) var(--ease-out), transform var(--dur-2) var(--ease-out); }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(-6px); }

@media (max-width: 900px) {
  .header-nav { display: none; }
  .nav-toggle { display: inline-flex; }
  .mobile-nav { display: flex; }
  .user-trigger__label { display: none; }
  .brand__tag { display: none; }
}
@media (max-width: 560px) {
  .header-inner { width: calc(100% - 28px); gap: 10px; }
  .header-actions { gap: 6px; }
}
</style>
