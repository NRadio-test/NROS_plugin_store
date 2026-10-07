<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import BrandLogo from './BrandLogo.vue'
import AppButton from './AppButton.vue'
import AppMenu from './AppMenu.vue'
import UserAvatar from './UserAvatar.vue'
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

const account = computed(() => session.user?.display_name || session.user?.phone_mask || '已登录用户')

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
      <RouterLink to="/" class="brand" aria-label="NRadio 插件商店 首页">
        <BrandLogo />
        <span class="brand__name">插件商店</span>
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
          <template #trigger><UserAvatar :name="account" :src="session.user.avatar_url" size="sm" /><span class="account__label account__name">{{ account }}</span><AppIcon name="chevron-down" :size="13" /></template>
          <div class="account-menu__profile"><UserAvatar :name="account" :src="session.user.avatar_url" /><div><strong>{{ account }}</strong><span>{{ session.ssoEnabled ? '有赞账号 · 已登录' : '已登录' }}</span></div></div>
          <div class="menu__sep" />
          <RouterLink to="/me" class="menu__item" role="menuitem"><AppIcon name="user" :size="17" />个人中心</RouterLink>
          <RouterLink to="/me?tab=submissions" class="menu__item" role="menuitem"><AppIcon name="upload" :size="17" />我的提交</RouterLink>
          <RouterLink to="/me?tab=favorites" class="menu__item" role="menuitem"><AppIcon name="heart" :size="17" />我的收藏</RouterLink>
          <RouterLink to="/submit" class="menu__item" role="menuitem"><AppIcon name="upload" :size="17" />提交插件</RouterLink>
          <RouterLink v-if="session.admin" to="/studio" class="menu__item" role="menuitem"><AppIcon name="shield" :size="17" />管理后台</RouterLink>
          <div class="menu__sep" />
          <button type="button" class="menu__item" role="menuitem" :disabled="loggingOut" @click="logout"><AppIcon name="log-out" :size="17" />{{ loggingOut ? '正在退出…' : '退出登录' }}</button>
        </AppMenu>
        <AppButton v-else to="/login" :aria-label="session.ssoEnabled ? '登录' : '手机号进入'" variant="secondary" icon="user">
          <span class="account__label">{{ session.ssoEnabled ? '登录' : '手机号进入' }}</span>
        </AppButton>
      </div>
    </div>
  </header>
</template>

<style scoped>
.account__name { max-width: 10rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.account-menu__profile { display: flex; align-items: center; gap: 12px; padding: 12px; max-width: 280px; }
.account-menu__profile div { min-width: 0; }
.account-menu__profile strong { display: block; font-size: var(--fs-sm); overflow-wrap: anywhere; }
.account-menu__profile span { display: block; font-size: var(--fs-cap); color: var(--text-2); margin-top: 3px; }
</style>
