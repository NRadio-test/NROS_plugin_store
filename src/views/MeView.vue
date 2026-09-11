<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, errorMessage, loadSession, post, session, type Plugin, type Submission } from '../lib/api'
import { statusMeta } from '../lib/status'
import { formatDateTime, formatNumber } from '../lib/format'
import { toast } from '../lib/toast'
import PluginRow from '../components/PluginRow.vue'
import AsyncState from '../components/AsyncState.vue'
import AppIcon from '../components/AppIcon.vue'
import AppBadge from '../components/AppBadge.vue'
import AppButton from '../components/AppButton.vue'
import MonogramAvatar from '../components/MonogramAvatar.vue'

type TabKey = 'submissions' | 'favorites'
const REMOVED = ['removed', 'deleted', 'unlisted']

const router = useRouter()
const loading = ref(true)
const error = ref('')
const busy = ref('')
const tab = ref<TabKey>('submissions')
const submissions = ref<Submission[]>([])
const favorites = ref<Plugin[]>([])

const masked = computed(() => session.user?.phone_mask || '未识别')
const activeCount = computed(() => submissions.value.filter(item => !statusMeta(item.status).tone.match(/success|neutral|danger/)).length)

async function load() {
  if (!session.user) { loading.value = false; return }
  loading.value = true
  error.value = ''
  try {
    const data = await api<{ submissions: Submission[]; favorites: Plugin[] }>('/api/me')
    submissions.value = data.submissions
    favorites.value = data.favorites
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    loading.value = false
  }
}

async function refresh(id: string, name: string) {
  busy.value = id
  try {
    await post(`/api/plugins/${id}/refresh`)
    toast.success('已请求重新检查', `${name} 会在后台重新读取原仓库。`)
    await load()
  } catch (caught) {
    toast.error('请求未生效', errorMessage(caught))
  } finally {
    busy.value = ''
  }
}

async function logout() {
  try {
    await post('/api/logout')
    await loadSession()
    toast.info('已退出登录')
    await router.replace('/')
  } catch (caught) {
    toast.error('退出失败', errorMessage(caught))
  }
}

watch(() => session.user?.id, load, { immediate: true })
</script>

<template>
  <div class="me container">
    <AsyncState v-if="session.loaded && session.user" :loading="loading" :error="error" skeleton="row" :skeleton-count="5" @retry="load">
      <header class="me__profile">
        <MonogramAvatar :name="masked" size="lg" />
        <div class="me__profile-text">
          <p class="eyebrow">手机号识别档案</p>
          <h1 class="me__profile-name">{{ masked }}</h1>
          <p class="me__profile-note">
            <AppIcon name="info" :size="14" />
            自报号码识别，未验证归属，也不代表已绑定小店会员。知道同一号码的人可能进入同一档案。
          </p>
        </div>
        <div class="me__profile-actions">
          <AppButton to="/submit" icon="upload">提交插件</AppButton>
          <AppButton variant="ghost" icon="log-out" @click="logout">退出登录</AppButton>
        </div>
        <dl class="me__profile-stats">
          <div class="stat">
            <dt class="stat__label">我的提交</dt>
            <dd class="stat__value">{{ formatNumber(submissions.length) }}</dd>
          </div>
          <div class="stat">
            <dt class="stat__label">审核进行中</dt>
            <dd class="stat__value">{{ formatNumber(activeCount) }}</dd>
          </div>
          <div class="stat">
            <dt class="stat__label">我的收藏</dt>
            <dd class="stat__value">{{ formatNumber(favorites.length) }}</dd>
          </div>
        </dl>
      </header>

      <nav class="tabs me__tabs" role="tablist" aria-label="个人中心分区">
        <button type="button" role="tab" class="tabs__item" :aria-selected="tab === 'submissions'" @click="tab = 'submissions'">
          <AppIcon name="upload" :size="15" />我的提交
          <span class="tabs__count">{{ submissions.length }}</span>
        </button>
        <button type="button" role="tab" class="tabs__item" :aria-selected="tab === 'favorites'" @click="tab = 'favorites'">
          <AppIcon name="heart" :size="15" />我的收藏
          <span class="tabs__count">{{ favorites.length }}</span>
        </button>
      </nav>

      <section v-if="tab === 'submissions'" class="me__panel" role="tabpanel">
        <div class="section__head">
          <div>
            <h2>我的提交</h2>
            <p class="muted small">审核由后台自动完成；材料不足时会显示公开原因，可按需重新检查。</p>
          </div>
          <AppButton size="sm" icon="refresh" :loading="loading" @click="load">更新状态</AppButton>
        </div>

        <div v-if="!submissions.length" class="empty">
          <span class="empty__icon"><AppIcon name="upload" :size="22" /></span>
          <h3 class="empty__title">还没有提交</h3>
          <p class="empty__text">提交公开 GitHub 仓库，正式 Release 里的 IPK 通过自动审核后会出现在市场。</p>
          <AppButton to="/submit" variant="primary" icon="plus" style="margin-top: 10px">提交第一个仓库</AppButton>
        </div>

        <div v-else class="me__list">
          <article v-for="item in submissions" :key="item.id" class="submission-row">
            <div class="submission-row__main">
              <div class="submission-row__head">
                <RouterLink :to="`/plugins/${item.id}`" class="submission-row__name">{{ item.full_name }}</RouterLink>
                <AppBadge :variant="statusMeta(item.status).tone" dot>{{ statusMeta(item.status).label }}</AppBadge>
                <AppBadge v-if="item.task_status && item.task_status !== item.status" variant="neutral">
                  <AppIcon :name="statusMeta(item.task_status).icon" :size="12" />{{ statusMeta(item.task_status).label }}
                </AppBadge>
              </div>
              <p class="submission-row__reason">{{ item.public_reason || '等待后台检查结果。' }}</p>
              <p v-if="item.updated_at" class="submission-row__time"><AppIcon name="clock" :size="13" />最近更新 {{ formatDateTime(item.updated_at) }}</p>
            </div>
            <div class="submission-row__actions">
              <AppButton
                size="sm"
                icon="refresh"
                :disabled="REMOVED.includes(item.status)"
                :loading="busy === item.id"
                @click="refresh(item.id, item.full_name)"
              >
                检查更新
              </AppButton>
            </div>
          </article>
        </div>
      </section>

      <section v-else class="me__panel" role="tabpanel">
        <div class="section__head">
          <div>
            <h2>我的收藏</h2>
            <p class="muted small">收藏数是去重识别档案的当前有效数量，不代表已核验的自然人数。</p>
          </div>
          <AppButton to="/" size="sm" icon="compass">去市场看看</AppButton>
        </div>

        <div v-if="!favorites.length" class="empty">
          <span class="empty__icon"><AppIcon name="heart" :size="22" /></span>
          <h3 class="empty__title">还没有收藏</h3>
          <p class="empty__text">在市场里点一下卡片上的心形按钮，插件就会出现在这里。</p>
          <AppButton to="/" variant="primary" icon="compass" style="margin-top: 10px">发现插件</AppButton>
        </div>

        <div v-else class="me__grid">
          <PluginRow v-for="plugin in favorites" :key="plugin.id" :plugin="plugin" />
        </div>
      </section>
    </AsyncState>

    <p v-else-if="!session.loaded" class="loading-row"><span class="spinner" />正在检查会话…</p>

    <div v-else class="empty me__gate">
      <span class="empty__icon"><AppIcon name="lock" :size="22" /></span>
      <h3 class="empty__title">登录后查看个人中心</h3>
      <p class="empty__text">用手机号进入你的档案，即可查看提交与收藏。</p>
      <AppButton to="/login?next=/me" variant="primary" icon="user" style="margin-top: 10px">手机号进入</AppButton>
    </div>
  </div>
</template>

<style scoped>
.me { padding-top: 32px; display: flex; flex-direction: column; gap: 22px; }
.me__profile {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 18px 20px;
  align-items: center;
  padding: 26px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-xl);
  background: var(--bg-card);
  background-image: var(--hero-gradient);
  box-shadow: var(--shadow-sm);
}
.me__profile-text { min-width: 0; }
.me__profile-name { margin-top: 6px; font-size: clamp(1.4rem, 1.1rem + 1vw, 1.9rem); letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.me__profile-note { display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; font-size: var(--text-small); color: var(--text-tertiary); line-height: 1.6; max-width: 62ch; }
.me__profile-note svg { margin-top: 3px; }
.me__profile-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.me__profile-stats {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin: 0;
  padding-top: 18px;
  border-top: 1px solid var(--border-subtle);
}
.me__profile-stats dd { margin: 0; }
.me__tabs { margin-bottom: -6px; }
.me__panel { display: flex; flex-direction: column; gap: 18px; }
.me__list { display: flex; flex-direction: column; gap: 12px; }
.submission-row {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 18px 20px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-xs);
  transition: border-color var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out);
}
.submission-row:hover { border-color: var(--border-strong); box-shadow: var(--shadow-sm); }
.submission-row__main { flex: 1; min-width: 0; }
.submission-row__head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.submission-row__name { font-size: var(--text-h3); font-weight: 640; letter-spacing: -0.015em; color: var(--text-primary); }
.submission-row__reason { margin-top: 7px; font-size: var(--text-body); color: var(--text-secondary); line-height: 1.6; }
.submission-row__time { display: flex; align-items: center; gap: 5px; margin-top: 7px; font-size: var(--text-small); color: var(--text-tertiary); }
.submission-row__actions { flex: none; }
.me__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 18px; }
.me__gate { margin-top: 40px; }

@media (max-width: 900px) {
  .me__profile { grid-template-columns: auto minmax(0, 1fr); }
  .me__profile-actions { grid-column: 1 / -1; }
}
@media (max-width: 767px) {
  .me { padding-top: 20px; }
  .me__profile { padding: 20px; }
  .me__profile-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .submission-row { flex-direction: column; align-items: stretch; gap: 14px; }
  .submission-row__actions .btn { width: 100%; }
  .me__grid { grid-template-columns: 1fr; }
}
</style>
