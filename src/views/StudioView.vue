<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { errorMessage, loadSession, post, session } from '../lib/api'
import { toast } from '../lib/toast'
import AppIcon from '../components/AppIcon.vue'
import BrandLogo from '../components/BrandLogo.vue'
import AppButton from '../components/AppButton.vue'
import AppField from '../components/AppField.vue'
import AppBadge from '../components/AppBadge.vue'
import type { IconName } from '../lib/icons'

const StudioReviews = defineAsyncComponent(() => import('../components/StudioReviews.vue'))
const StudioOverview = defineAsyncComponent(() => import('../components/StudioOverview.vue'))
const StudioPlugins = defineAsyncComponent(() => import('../components/StudioPlugins.vue'))
const StudioRecords = defineAsyncComponent(() => import('../components/StudioRecords.vue'))
const AISettings = defineAsyncComponent(() => import('../components/AISettings.vue'))
const SourceSettings = defineAsyncComponent(() => import('../components/SourceSettings.vue'))
const StudioSecurity = defineAsyncComponent(() => import('../components/StudioSecurity.vue'))

type PanelKey = 'reviews' | 'overview' | 'plugins' | 'tasks' | 'logs' | 'ai' | 'sources' | 'security'

interface NavItem { key: PanelKey; label: string; icon: IconName; desc: string }

const NAV: NavItem[] = [
  { key: 'reviews', label: '审核收件箱', icon: 'shield-check', desc: '查看待审作品，通过或退回修改' },
  { key: 'overview', label: '总览', icon: 'bar-chart', desc: '整体状态' },
  { key: 'plugins', label: '插件管理', icon: 'package', desc: '搜索、同步、下架与恢复' },
  { key: 'tasks', label: '整理任务', icon: 'activity', desc: '任务状态与理由' },
  { key: 'logs', label: '操作日志', icon: 'history', desc: '管理员操作记录' },
  { key: 'ai', label: '自动审核配置', icon: 'sparkles', desc: '接口、预算与规则' },
  { key: 'sources', label: '下载源', icon: 'layers', desc: '官方源与第三方源' },
  { key: 'security', label: '账号安全', icon: 'lock', desc: '前往留言箱管理密码' },
]

const panel = ref<PanelKey>('reviews')
const reviewId = ref('')
const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const navOpen = ref(false)

const current = computed(() => NAV.find(item => item.key === panel.value) ?? NAV[0]!)

async function login() {
  busy.value = true
  error.value = ''
  try {
    await post('/api/studio/login', { username: username.value, password: password.value })
    password.value = ''
    await loadSession()
    toast.success('已进入 Studio')
  } catch (caught) {
    error.value = errorMessage(caught)
    password.value = ''
  } finally {
    busy.value = false
  }
}

async function logout() {
  try {
    await post('/api/studio/logout')
    await loadSession()
    toast.info('已退出管理员会话')
    panel.value = 'reviews'
  } catch (caught) {
    toast.error('退出失败', errorMessage(caught))
  }
}

function select(key: PanelKey) {
  reviewId.value = ''
  panel.value = key
  navOpen.value = false
}
</script>

<template>
  <div class="studio">
    <p v-if="!session.loaded" class="loading-row"><span class="spinner" />加载中…</p>

    <div v-else-if="!session.admin" class="studio-login container">
      <form class="studio-login__form" @submit.prevent="login">
        <header class="studio-login__head">
          <span class="studio-login__icon"><AppIcon name="shield" :size="20" /></span>
          <div>
            <h1>管理员登录</h1>
            <p class="small muted">使用留言箱的管理员账号。</p>
          </div>
        </header>

        <AppField label="用户名" for-id="admin-username" required>
          <input id="admin-username" v-model="username" class="input" autocomplete="username" required maxlength="100" />
        </AppField>
        <AppField label="密码" for-id="admin-password" :error="error" required>
          <input id="admin-password" v-model="password" class="input" type="password" autocomplete="current-password" required maxlength="500" />
        </AppField>

        <AppButton variant="primary" size="lg" type="submit" block icon="log-out" :loading="busy">
          {{ busy ? '正在登录…' : '管理员登录' }}
        </AppButton>

        <AppButton href="https://msg.zdwifi.com/studio" variant="ghost" icon="lock">前往留言箱修改密码</AppButton>

        <div class="notice">
          <AppIcon name="info" :size="16" />
          <span>敏感操作会写入审计日志。</span>
        </div>
      </form>
    </div>

    <div v-else class="studio-shell">
      <aside class="studio__sidebar" :class="navOpen && 'studio__sidebar--open'">
        <div class="studio__brand">
          <BrandLogo compact />
          <span class="studio__brand-text">
            <span class="studio__brand-name">管理后台</span>
            <span class="studio__brand-sub">插件商店</span>
          </span>
        </div>

        <nav class="studio__nav" aria-label="Studio 功能">
          <button
            v-for="item in NAV"
            :key="item.key"
            type="button"
            class="studio__nav-item"
            :class="panel === item.key && 'studio__nav-item--active'"
            :aria-current="panel === item.key ? 'page' : undefined"
            @click="select(item.key)"
          >
            <AppIcon :name="item.icon" :size="17" />
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <div class="studio__sidebar-foot">
          <div class="studio__admin">
            <span class="studio__admin-avatar"><AppIcon name="user" :size="15" /></span>
            <span class="studio__admin-text">
              <span class="studio__admin-name">{{ session.admin.username }}</span>
              <span class="studio__admin-role">管理员会话</span>
            </span>
          </div>
          <AppButton size="sm" variant="ghost" icon="log-out" block @click="logout">退出管理员</AppButton>
        </div>
      </aside>

      <div class="studio__main">
        <header class="studio__topbar">
          <div class="studio__topbar-text">
            <div class="row gap-2">
              <h1 class="studio__title">{{ current.label }}</h1>
              <AppBadge variant="brand"><AppIcon name="shield" :size="12" />管理员</AppBadge>
            </div>
            <p class="studio__desc">{{ current.desc }}</p>
          </div>
          <div class="studio__topbar-actions">
            <AppButton
              size="sm"
              icon="menu"
              class="studio__nav-toggle"
              aria-label="切换 Studio 导航"
              :aria-expanded="navOpen"
              @click="navOpen = !navOpen"
            >
              {{ current.label }}
            </AppButton>
            <RouterLink to="/" class="btn btn--raised btn--sm">
              <AppIcon name="arrow-left" :size="15" />返回市场
            </RouterLink>
          </div>
        </header>

        <div class="studio__content">
          <Suspense>
            <StudioReviews v-if="panel === 'reviews'" :initial-id="reviewId" />
            <StudioOverview v-else-if="panel === 'overview'" @open="select" />
            <StudioPlugins v-else-if="panel === 'plugins'" @review="id => { reviewId = id; panel = 'reviews' }" />
            <StudioRecords v-else-if="panel === 'tasks'" kind="tasks" />
            <StudioRecords v-else-if="panel === 'logs'" kind="logs" />
            <AISettings v-else-if="panel === 'ai'" />
            <SourceSettings v-else-if="panel === 'sources'" />
            <StudioSecurity v-else />
            <template #fallback><p class="loading-row"><span class="spinner" />加载中…</p></template>
          </Suspense>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.studio { min-height: 70vh; }

.studio-login { max-width: 440px; padding-top: 48px; }
.studio-login__form { display: flex; flex-direction: column; gap: 24px; padding: 32px; border: 1px solid var(--line); border-radius: var(--r-group); background: var(--surface); }
.studio-login__head { display: flex; align-items: flex-start; gap: 12px; }
.studio-login__head h1 { font-size: 22px; margin-bottom: 8px; }
.studio-login__icon { display: inline-flex; color: var(--text-2); padding-top: 5px; }

.studio-shell { display: grid; grid-template-columns: var(--sidebar) minmax(0, 1fr); gap: 0; width: min(var(--page-max-wide), 100% - 2 * var(--safe-x)); margin-inline: auto; padding: 22px 0 40px; align-items: start; }
.studio__sidebar {
  position: sticky;
  top: calc(var(--header-h) + 22px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 4px 16px 16px 0;
  border-right: 1px solid var(--line);
  background: transparent;
}
.studio__brand { display: flex; align-items: center; gap: 11px; padding: 2px 4px 14px; border-bottom: 1px solid var(--line); }
.studio__brand-text { display: flex; flex-direction: column; line-height: 1.2; }
.studio__brand-name { font-weight: 700; letter-spacing: -0.02em; }
.studio__brand-sub { font-size: var(--fs-cap); color: var(--text-3); }
.studio__nav { display: flex; flex-direction: column; gap: 2px; }
.studio__nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 9px 11px;
  border: 0;
  border-radius: var(--r-control);
  background: transparent;
  color: var(--text-2);
  font-size: var(--fs-sm);
  font-weight: 500;
  text-align: left;
  transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.studio__nav-item:hover { background: var(--surface-hover); color: var(--text); }
.studio__nav-item--active { background: var(--surface-hover); color: var(--text); font-weight: 600; box-shadow: inset 3px 0 var(--signal); }
.studio__sidebar-foot { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid var(--line); }
.studio__admin { display: flex; align-items: center; gap: 10px; }
.studio__admin-avatar { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--r-control); background: var(--surface-raised); color: var(--text-2); flex: none; }
.studio__admin-text { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
.studio__admin-name { font-size: var(--fs-sm); font-weight: 640; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.studio__admin-role { font-size: var(--fs-cap); color: var(--text-3); }

.studio__main { min-width: 0; padding-inline-start: 26px; }
.studio__topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; flex-wrap: wrap; margin-bottom: 20px; }
.studio__title { font-size: var(--fs-h1); letter-spacing: -0.03em; }
.studio__desc { margin-top: 5px; font-size: var(--fs-sm); color: var(--text-3); }
.studio__topbar-actions { display: flex; align-items: center; gap: 10px; }
.studio__nav-toggle { display: none; }
.studio__content { display: flex; flex-direction: column; gap: 20px; }

@media (max-width: 1000px) {
  .studio-shell { grid-template-columns: 1fr; gap: 16px; padding-top: 18px; }
  .studio__sidebar { position: static; border: 1px solid var(--line); border-radius: var(--r-group); padding: 16px; background: var(--surface); }
  .studio__sidebar:not(.studio__sidebar--open) { display: none; }
  .studio__sidebar:not(.studio__sidebar--open) .studio__nav,
  .studio__sidebar:not(.studio__sidebar--open) .studio__sidebar-foot { display: none; }
  .studio__nav { flex-direction: row; flex-wrap: wrap; }
  .studio__nav-item { width: auto; flex: 1 1 9rem; }
  .studio__main { padding-inline-start: 0; }
  .studio__nav-toggle { display: inline-flex; }
}
@media (max-width: 900px) {
  .studio-login { grid-template-columns: 1fr; gap: 20px; padding-top: 28px; }
  .studio-login__aside { padding: 0; background: transparent; }
  .studio-login__list { display: none; }
  .studio-login__form { padding: 24px; }
}
</style>
