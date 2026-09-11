<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue'
import { errorMessage, loadSession, post, session } from '../lib/api'
import { toast } from '../lib/toast'
import AppIcon from '../components/AppIcon.vue'
import AppButton from '../components/AppButton.vue'
import AppField from '../components/AppField.vue'
import AppBadge from '../components/AppBadge.vue'
import type { IconName } from '../lib/icons'

const StudioOverview = defineAsyncComponent(() => import('../components/StudioOverview.vue'))
const StudioPlugins = defineAsyncComponent(() => import('../components/StudioPlugins.vue'))
const StudioRecords = defineAsyncComponent(() => import('../components/StudioRecords.vue'))
const AISettings = defineAsyncComponent(() => import('../components/AISettings.vue'))
const SourceSettings = defineAsyncComponent(() => import('../components/SourceSettings.vue'))
const StudioSecurity = defineAsyncComponent(() => import('../components/StudioSecurity.vue'))

type PanelKey = 'overview' | 'plugins' | 'tasks' | 'logs' | 'ai' | 'sources' | 'security'

interface NavItem { key: PanelKey; label: string; icon: IconName; desc: string }

const NAV: NavItem[] = [
  { key: 'overview', label: '总览', icon: 'bar-chart', desc: '市场、审核与配置的整体状态' },
  { key: 'plugins', label: '插件管理', icon: 'package', desc: '搜索仓库、同步、重审、下架与显式恢复' },
  { key: 'tasks', label: '审核任务', icon: 'activity', desc: '持久化任务状态、尝试次数与公开理由' },
  { key: 'logs', label: '操作日志', icon: 'history', desc: '管理员敏感操作的审计记录' },
  { key: 'ai', label: 'AI 设置', icon: 'sparkles', desc: 'OpenAI 兼容接口、预算与审核规则' },
  { key: 'sources', label: '下载源', icon: 'layers', desc: '官方源默认启用，第三方源需测试并显式信任' },
  { key: 'security', label: '账号安全', icon: 'lock', desc: '修改当前管理员密码' },
]

const panel = ref<PanelKey>('overview')
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
    panel.value = 'overview'
  } catch (caught) {
    toast.error('退出失败', errorMessage(caught))
  }
}

function select(key: PanelKey) {
  panel.value = key
  navOpen.value = false
}
</script>

<template>
  <div class="studio">
    <p v-if="!session.loaded" class="loading-row"><span class="spinner" />正在检查管理员会话…</p>

    <div v-else-if="!session.admin" class="studio-login container">
      <section class="studio-login__aside">
        <p class="eyebrow"><AppIcon name="lock" :size="14" />仅管理员</p>
        <h1 class="studio-login__title">张导插件商店<br />Studio 控制台</h1>
        <p class="studio-login__lead">审核流程、发布状态、AI 设置与下载源都在这里管理。管理员提交同样走自动审核，不会绕过流程。</p>
        <ul class="studio-login__list">
          <li><AppIcon name="check" :size="15" />审核任务与公开理由</li>
          <li><AppIcon name="check" :size="15" />下架、删除与显式恢复</li>
          <li><AppIcon name="check" :size="15" />审计日志与密钥掩码</li>
        </ul>
      </section>

      <form class="studio-login__form" @submit.prevent="login">
        <header class="studio-login__head">
          <span class="studio-login__icon"><AppIcon name="shield" :size="20" /></span>
          <div>
            <h2>管理员登录</h2>
            <p class="small muted">使用安全导入的当前管理员账号；与旧站会话互相独立。</p>
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

        <div class="notice">
          <AppIcon name="info" :size="16" />
          <span>登录、提交、下架等敏感操作都会写入审计日志；连续失败会被限流。</span>
        </div>
      </form>
    </div>

    <div v-else class="studio-shell">
      <aside class="studio__sidebar" :class="navOpen && 'studio__sidebar--open'">
        <div class="studio__brand">
          <svg class="studio__logo" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="9" fill="url(#zdBrandStudio)" />
            <defs>
              <linearGradient id="zdBrandStudio" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#2f5bff" />
                <stop offset="0.5" stop-color="#6a4bff" />
                <stop offset="1" stop-color="#12b5cb" />
              </linearGradient>
            </defs>
            <path d="M16 6.8 24.6 11.6v8.8L16 25.2 7.4 20.4v-8.8Z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round" opacity=".96" />
            <path d="M7.7 11.8 16 16.2l8.3-4.4M16 16.4V25" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" opacity=".96" />
          </svg>
          <span class="studio__brand-text">
            <span class="studio__brand-name">Studio</span>
            <span class="studio__brand-sub">张导插件商店</span>
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
            <RouterLink to="/" class="btn btn--secondary btn--sm">
              <AppIcon name="arrow-left" :size="15" />返回市场
            </RouterLink>
          </div>
        </header>

        <div class="studio__content">
          <Suspense>
            <StudioOverview v-if="panel === 'overview'" @open="select" />
            <StudioPlugins v-else-if="panel === 'plugins'" />
            <StudioRecords v-else-if="panel === 'tasks'" kind="tasks" />
            <StudioRecords v-else-if="panel === 'logs'" kind="logs" />
            <AISettings v-else-if="panel === 'ai'" />
            <SourceSettings v-else-if="panel === 'sources'" />
            <StudioSecurity v-else />
            <template #fallback><p class="loading-row"><span class="spinner" />正在加载功能…</p></template>
          </Suspense>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.studio { min-height: 70vh; }

.studio-login { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 32px; padding-top: 48px; align-items: stretch; }
.studio-login__aside {
  padding: 40px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-xl);
  background: var(--bg-card);
  background-image: var(--hero-gradient);
  box-shadow: var(--shadow-sm);
}
.studio-login__title { margin-top: 16px; font-size: clamp(1.6rem, 1.2rem + 1.4vw, 2.25rem); letter-spacing: -0.035em; line-height: 1.16; }
.studio-login__lead { margin-top: 14px; max-width: 46ch; color: var(--text-secondary); line-height: 1.75; }
.studio-login__list { display: flex; flex-direction: column; gap: 10px; margin-top: 26px; list-style: none; font-size: var(--text-small); color: var(--text-secondary); }
.studio-login__list li { display: flex; align-items: center; gap: 9px; }
.studio-login__list svg { color: var(--success-text); }
.studio-login__form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-self: center;
  padding: 32px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-md);
}
.studio-login__head { display: flex; align-items: center; gap: 13px; }
.studio-login__icon { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: var(--r-md); background: var(--primary-surface); color: var(--primary-text); flex: none; }

.studio-shell { display: grid; grid-template-columns: 252px minmax(0, 1fr); gap: 0; width: min(var(--container-wide), 100% - 48px); margin-inline: auto; padding: 22px 0 40px; align-items: start; }
.studio__sidebar {
  position: sticky;
  top: calc(var(--header-h) + 22px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-xs);
}
.studio__brand { display: flex; align-items: center; gap: 11px; padding: 2px 4px 14px; border-bottom: 1px solid var(--border-subtle); }
.studio__logo { width: 32px; height: 32px; border-radius: 9px; }
.studio__brand-text { display: flex; flex-direction: column; line-height: 1.2; }
.studio__brand-name { font-weight: 700; letter-spacing: -0.02em; }
.studio__brand-sub { font-size: var(--text-micro); color: var(--text-tertiary); }
.studio__nav { display: flex; flex-direction: column; gap: 2px; }
.studio__nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 11px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-body);
  font-weight: 600;
  text-align: left;
  transition: background-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
}
.studio__nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.studio__nav-item--active { background: var(--primary-surface); color: var(--primary-text); }
.studio__sidebar-foot { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid var(--border-subtle); }
.studio__admin { display: flex; align-items: center; gap: 10px; }
.studio__admin-avatar { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--r-sm); background: var(--bg-subtle); color: var(--text-secondary); flex: none; }
.studio__admin-text { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
.studio__admin-name { font-size: var(--text-small); font-weight: 640; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.studio__admin-role { font-size: var(--text-micro); color: var(--text-tertiary); }

.studio__main { min-width: 0; padding-inline-start: 26px; }
.studio__topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; flex-wrap: wrap; margin-bottom: 20px; }
.studio__title { font-size: 1.5rem; letter-spacing: -0.03em; }
.studio__desc { margin-top: 5px; font-size: var(--text-small); color: var(--text-tertiary); }
.studio__topbar-actions { display: flex; align-items: center; gap: 10px; }
.studio__nav-toggle { display: none; }
.studio__content { display: flex; flex-direction: column; gap: 20px; }

@media (max-width: 1000px) {
  .studio-shell { grid-template-columns: 1fr; gap: 16px; padding-top: 18px; }
  .studio__sidebar { position: static; }
  .studio__sidebar:not(.studio__sidebar--open) .studio__nav,
  .studio__sidebar:not(.studio__sidebar--open) .studio__sidebar-foot { display: none; }
  .studio__nav { flex-direction: row; flex-wrap: wrap; }
  .studio__nav-item { width: auto; }
  .studio__main { padding-inline-start: 0; }
  .studio__nav-toggle { display: inline-flex; }
}
@media (max-width: 900px) {
  .studio-login { grid-template-columns: 1fr; gap: 20px; padding-top: 28px; }
  .studio-login__aside { padding: 26px; }
  .studio-login__form { padding: 24px; }
}
</style>
