<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, errorMessage, loadSession, post, session, type Plugin, type Submission } from '../lib/api'
import { statusMeta } from '../lib/status'
import { formatDateTime, formatNumber } from '../lib/format'
import { toast } from '../lib/toast'
import UploadForm from '../components/UploadForm.vue'
import AppModal from '../components/AppModal.vue'
import PluginRow from '../components/PluginRow.vue'
import AsyncState from '../components/AsyncState.vue'
import AppIcon from '../components/AppIcon.vue'
import AppBadge from '../components/AppBadge.vue'
import AppButton from '../components/AppButton.vue'
import MonogramAvatar from '../components/MonogramAvatar.vue'
import { navigateTabs } from '../composables/tabs'

type TabKey = 'submissions' | 'favorites'
const REMOVED = ['removed', 'deleted', 'unlisted']

const router = useRouter()
const loading = ref(true)
const error = ref('')
const busy = ref('')
const updating = ref<Submission | null>(null)
const tab = ref<TabKey>('submissions')
const submissionFilter = ref('all')
const visibleSubmissions = computed(() => submissions.value.filter(item => submissionFilter.value === 'all' || (submissionFilter.value === 'pending' ? item.review_status === 'pending' || ['pending','running','retry'].includes(item.task_status || '') : submissionFilter.value === 'rejected' ? item.review_status === 'rejected' || item.status === 'rejected' : item.status === 'published')))
const submissionState = (item: Submission) => item.review_status === 'pending' ? 'awaiting_review' : item.review_status === 'rejected' ? 'rejected' : item.task_status && ['pending','running','retry'].includes(item.task_status) ? item.task_status : item.status
const submissions = ref<Submission[]>([])
const favorites = ref<Plugin[]>([])

const masked = computed(() => session.user?.display_name || session.user?.phone_mask || '未识别')
const activeCount = computed(() => submissions.value.filter(item => ['pending','running','retry','awaiting_review'].includes(submissionState(item))).length)

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
    toast.success('已请求重新检查', name)
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
          <h1 class="me__profile-name">个人中心</h1><p class="me__account-name">{{ masked }}</p>
          <p class="me__profile-note">
            <AppIcon name="info" :size="14" />
            {{ session.ssoEnabled ? '有赞身份已验证，账号在参与网站间通用。' : '自报号码，未验证归属。' }}
          </p>
        </div>
        <div class="me__profile-actions">
          <AppButton to="/submit" variant="primary" icon="upload">提交插件</AppButton>
          <AppButton variant="ghost" icon="log-out" @click="logout">退出登录</AppButton>
        </div>
        <dl class="me__profile-stats">
          <div class="stat">
            <dt class="stat__label">我的提交</dt>
            <dd class="stat__value">{{ formatNumber(submissions.length) }}</dd>
          </div>
          <div class="stat">
            <dt class="stat__label">等待处理</dt>
            <dd class="stat__value">{{ formatNumber(activeCount) }}</dd>
          </div>
          <div class="stat">
            <dt class="stat__label">我的收藏</dt>
            <dd class="stat__value">{{ formatNumber(favorites.length) }}</dd>
          </div>
        </dl>
      </header>

      <nav class="tabs me__tabs" role="tablist" aria-label="个人中心分区" @keydown="navigateTabs">
        <button id="me-tab-submissions" type="button" role="tab" class="tabs__item" :aria-selected="tab === 'submissions'" :tabindex="tab === 'submissions' ? 0 : -1" aria-controls="me-panel-submissions" @click="tab = 'submissions'">
          <AppIcon name="upload" :size="15" />我的提交
          <span class="tabs__count">{{ submissions.length }}</span>
        </button>
        <button id="me-tab-favorites" type="button" role="tab" class="tabs__item" :aria-selected="tab === 'favorites'" :tabindex="tab === 'favorites' ? 0 : -1" aria-controls="me-panel-favorites" @click="tab = 'favorites'">
          <AppIcon name="heart" :size="15" />我的收藏
          <span class="tabs__count">{{ favorites.length }}</span>
        </button>
      </nav>

      <section v-if="tab === 'submissions'" :id="`me-panel-${tab}`" class="me__panel" role="tabpanel" :aria-labelledby="`me-tab-${tab}`">
        <div class="section__head">
          <div>
            <p class="small muted">查看进度和审核反馈</p>
          </div>
          <AppButton size="sm" icon="refresh" :loading="loading" @click="load">刷新</AppButton>
        </div>

        <div v-if="!submissions.length" class="empty">
          <span class="empty__icon"><AppIcon name="upload" :size="22" /></span>
          <h3 class="empty__title">还没有提交</h3>
          <p class="empty__text">提交 GitHub 仓库或直接上传 IPK。</p>
          <AppButton to="/submit" variant="primary" icon="plus" style="margin-top: 10px">提交第一个插件</AppButton>
        </div>

        <div v-else class="me__list">
          <nav class="me__filters" aria-label="我的提交筛选"><button v-for="choice in [{key:'all',label:'全部'},{key:'pending',label:'等待审核'},{key:'rejected',label:'需要修改'},{key:'published',label:'已上架'}]" :key="choice.key" class="chip" :aria-pressed="submissionFilter === choice.key" @click="submissionFilter = choice.key">{{ choice.label }}</button></nav><p v-if="!visibleSubmissions.length" class="notice">此分类暂无作品。</p>
          <article v-for="item in visibleSubmissions" :key="item.id" class="submission-row">
            <div class="submission-row__main">
              <div class="submission-row__head">
                <RouterLink v-if="item.status === 'published'" :to="`/plugins/${item.id}`" class="submission-row__name">{{ item.full_name }}</RouterLink><h3 v-else class="submission-row__name">{{ item.full_name }}</h3>
                <AppBadge :variant="statusMeta(submissionState(item)).tone" dot>{{ statusMeta(submissionState(item)).label }}</AppBadge>
                <AppBadge v-if="item.status === 'published' && submissionState(item) !== 'published'" variant="neutral">
                  <AppIcon :name="'check-circle'" :size="12" />{{ '旧版本仍已上架' }}
                </AppBadge>
              </div>
              <p class="submission-row__reason">{{ item.review_reason || item.public_reason || '正在整理资料，完成后进入人工审核。' }}</p>
              <p v-if="item.updated_at" class="submission-row__time"><AppIcon name="clock" :size="13" />最近更新 {{ formatDateTime(item.updated_at) }}</p>
            </div>
            <div class="submission-row__actions">
              <AppButton v-if="item.source_kind === 'upload'" size="sm" icon="upload" :disabled="REMOVED.includes(item.status)" @click="updating = item">上传新版本</AppButton>
              <AppButton
                size="sm"
                icon="refresh"
                :disabled="REMOVED.includes(item.status)"
                :loading="busy === item.id"
                @click="refresh(item.id, item.full_name)"
              >
                {{ item.source_kind === 'upload' ? '重新提交审核' : '同步新版本' }}
              </AppButton>
            </div>
          </article>
        </div>
      </section>

      <section v-else :id="`me-panel-${tab}`" class="me__panel" role="tabpanel" :aria-labelledby="`me-tab-${tab}`">
        <div class="section__head">
          <div>
            <p class="small muted">已收藏的插件</p>
          </div>
          <AppButton to="/" size="sm" icon="compass">去市场</AppButton>
        </div>

        <div v-if="!favorites.length" class="empty">
          <span class="empty__icon"><AppIcon name="heart" :size="22" /></span>
          <h3 class="empty__title">还没有收藏</h3>
          <p class="empty__text">在市场里点收藏即可。</p>
          <AppButton to="/" variant="primary" icon="compass" style="margin-top: 10px">去市场</AppButton>
        </div>

        <div v-else class="me__grid">
          <PluginRow v-for="plugin in favorites" :key="plugin.id" :plugin="plugin" />
        </div>
      </section>
    </AsyncState>

    <p v-else-if="!session.loaded" class="loading-row"><span class="spinner" />正在检查会话…</p>

    <div v-else class="empty me__gate">
      <span class="empty__icon"><AppIcon name="lock" :size="22" /></span>
      <h1 class="empty__title">登录后查看个人中心</h1>
      <AppButton to="/login?next=/me" variant="primary" icon="user" style="margin-top: 10px">{{ session.ssoEnabled ? '登录' : '手机号进入' }}</AppButton>
    </div>
    <AppModal :model-value="!!updating" title="上传新版本" @update:model-value="updating = $event ? updating : null">
      <UploadForm v-if="updating" :key="updating.id" :plugin-id="updating.id" :initial="{ name: updating.upload_name || updating.full_name, description: updating.upload_description, tutorial: updating.upload_tutorial }" @submitted="updating = null; load()" />
    </AppModal>
  </div>
</template>

<style scoped>
.me { padding-top: 32px; display: flex; flex-direction: column; gap: 22px; }
.me__profile {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 18px 20px;
  align-items: center;
  padding: 0 0 24px;
  border-bottom: 1px solid var(--line);
}
.me__profile-text { min-width: 0; }
.me__account-name { font-size: var(--fs-sm); color: var(--text-2); margin-top: 4px; }
.me__profile-name { margin-top: 0; font-size: 24px; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.me__profile-note { display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; font-size: var(--fs-sm); color: var(--text-3); line-height: 1.6; max-width: 62ch; }
.me__profile-note svg { margin-top: 3px; }
.me__profile-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.me__profile-stats {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 0;
}
.me__profile-stats .stat { flex-direction: row; align-items: baseline; gap: 8px; }
.me__profile-stats dd { margin: 0; font-size: var(--fs-sm); font-weight: 600; }
.me__tabs { margin-bottom: -6px; }
.me__panel { display: flex; flex-direction: column; gap: 18px; }
.me__filters { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
.me__list { display: flex; flex-direction: column; }
.me__filters { padding: 0 0 16px; margin: 0; }
.submission-row {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-bottom: 0;
  background: var(--surface);
}
.submission-row:last-child { border-bottom: 1px solid var(--line); border-radius: 0 0 var(--r-group) var(--r-group); }
.submission-row:first-of-type { border-radius: var(--r-group) var(--r-group) 0 0; }
.submission-row:hover { background: var(--surface-raised); }
.submission-row__main { flex: 1; min-width: 0; }
.submission-row__head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.submission-row__name { overflow-wrap: anywhere; font-size: 15px; font-weight: 600; letter-spacing: -0.015em; color: var(--text); }
.submission-row__reason { margin-top: 7px; font-size: var(--fs-sm); color: var(--text-2); line-height: 1.6; }
.submission-row__time { display: flex; align-items: center; gap: 5px; margin-top: 7px; font-size: var(--fs-sm); color: var(--text-3); }
.submission-row__actions { display: flex; gap: 8px; flex-wrap: wrap; flex: none; }
.me__grid { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--r-group); background: var(--surface); padding: 0 20px; }
.me__gate { margin-top: 40px; }

@media (max-width: 900px) {
  .me__profile { grid-template-columns: auto minmax(0, 1fr); }
  .me__profile-actions { grid-column: 1 / -1; }
}
@media (max-width: 767px) {
  .me { padding-top: 20px; }
  .me__profile { padding: 0 0 20px; }
  .me__profile-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .submission-row { flex-direction: column; align-items: stretch; gap: 14px; }
  .submission-row__actions .btn { width: 100%; }
  .me__grid { grid-template-columns: 1fr; }
}
</style>
