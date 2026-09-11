<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import AppButton from './AppButton.vue'
import AppMenu from './AppMenu.vue'
import { toast } from '../lib/toast'
import { errorMessage, loadSession, post, session } from '../lib/api'
import { isDarkMode, toggleTheme } from '../lib/theme'

const route = useRoute()
const router = useRouter()
const loggingOut = ref(false)

const links = [
  { to: '/', label: '插件市场', icon: 'compass' as const },
  { to: '/submit', label: '提交插件', icon: 'upload' as const },
]

const account = computed(() => session.user?.phone_mask || '')

async function logout() {
  loggingOut.value = true
  try {
    await post('/api/logout')
    await loadSession()
    await router.push('/')
    toast.info('已退出登录')
  } catch (error) { toast.error('退出失败', errorMessage(error)) }
  finally { loggingOut.value = false }
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
          :aria-label="link.label"
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

        <AppMenu v-if="session.user" :label="`个人中心与账号操作 ${account}`" button-class="btn btn--raised">
          <template #trigger><AppIcon name="user" :size="19" /><span class="account__label">{{ account }}</span></template>
          <RouterLink to="/me" class="menu__item" role="menuitem"><AppIcon name="user" :size="17" />个人中心</RouterLink>
          <RouterLink to="/submit" class="menu__item" role="menuitem"><AppIcon name="upload" :size="17" />提交插件</RouterLink>
          <div class="menu__sep" />
          <button type="button" class="menu__item" role="menuitem" :disabled="loggingOut" @click="logout"><AppIcon name="log-out" :size="17" />{{ loggingOut ? '正在退出…' : '退出登录' }}</button>
        </AppMenu>
        <AppButton v-else to="/login" aria-label="手机号进入" variant="primary" icon="user">
          <span class="account__label">手机号进入</span>
        </AppButton>
      </div>
    </div>
  </header>
</template>
