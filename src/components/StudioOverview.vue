<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, errorMessage, type StudioOverview } from '../lib/api'
import { statusMeta } from '../lib/status'
import { formatNumber, formatRelative } from '../lib/format'
import AsyncState from './AsyncState.vue'
import AppIcon from './AppIcon.vue'
import AppBadge from './AppBadge.vue'
import AppButton from './AppButton.vue'

type PanelKey = 'overview' | 'plugins' | 'tasks' | 'logs' | 'ai' | 'sources' | 'security'
const emit = defineEmits<{ open: [panel: PanelKey] }>()

const data = ref<StudioOverview | null>(null)
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api<StudioOverview>('/api/studio/overview')
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const tiles = () => {
  const counts = data.value?.counts
  return [
    { key: 'plugins', label: '收录插件', value: counts?.plugins ?? 0, icon: 'package' as const, tone: '' },
    { key: 'published', label: '已上架', value: counts?.published ?? 0, icon: 'check-circle' as const, tone: 'success' },
    { key: 'inReview', label: '审核进行中', value: counts?.inReview ?? 0, icon: 'activity' as const, tone: '' },
    { key: 'waiting', label: '等待材料或配置', value: counts?.waiting ?? 0, icon: 'clock' as const, tone: 'warning' },
    { key: 'rejected', label: '已拒绝', value: counts?.rejected ?? 0, icon: 'x-circle' as const, tone: 'danger' },
    { key: 'blocked', label: '已停用', value: counts?.blocked ?? 0, icon: 'ban' as const, tone: 'danger' },
  ]
}
</script>

<template>
  <AsyncState :loading="loading" :error="error" skeleton="row" :skeleton-count="6" @retry="load">
    <template v-if="data">
      <section class="ov__tiles">
        <article v-for="tile in tiles()" :key="tile.key" class="stat-tile">
          <span class="stat-tile__icon" :class="tile.tone && `stat-tile__icon--${tile.tone}`"><AppIcon :name="tile.icon" :size="17" /></span>
          <div class="stat">
            <span class="stat__label">{{ tile.label }}</span>
            <span class="stat__value">{{ formatNumber(tile.value) }}</span>
          </div>
        </article>
      </section>

      <section class="ov__grid">
        <article class="card">
          <header class="card__head">
            <div>
              <p class="card__title">运行配置</p>
            </div>
            <AppButton size="sm" icon="refresh" @click="load">刷新</AppButton>
          </header>
          <div class="card__body ov__config">
            <div class="ov__config-row">
              <span class="ov__config-icon" :class="data.ai.configured ? 'ov__config-icon--ok' : 'ov__config-icon--warn'">
                <AppIcon :name="data.ai.configured ? 'sparkles' : 'settings'" :size="16" />
              </span>
              <div class="ov__config-text">
                <p class="ov__config-title">AI 审核接口</p>
                <p class="ov__config-sub">{{ data.ai.configured ? `${data.ai.model} · ${data.ai.baseUrl}` : '未配置，新投稿会等待' }}</p>
              </div>
              <AppBadge :variant="data.ai.configured ? 'success' : 'warning'" dot>{{ data.ai.configured ? '已配置' : '待配置' }}</AppBadge>
            </div>
            <div class="ov__config-row">
              <span class="ov__config-icon" :class="data.sources.enabled ? 'ov__config-icon--ok' : 'ov__config-icon--warn'">
                <AppIcon name="layers" :size="16" />
              </span>
              <div class="ov__config-text">
                <p class="ov__config-title">下载源</p>
                <p class="ov__config-sub">共 {{ data.sources.total }} 个来源，启用 {{ data.sources.enabled }} 个</p>
              </div>
              <AppButton size="sm" variant="ghost" icon-right="chevron-right" @click="emit('open', 'sources')">管理</AppButton>
            </div>
            <div class="ov__config-row">
              <span class="ov__config-icon" :class="data.counts.tasksFailed ? 'ov__config-icon--warn' : 'ov__config-icon--ok'">
                <AppIcon name="activity" :size="16" />
              </span>
              <div class="ov__config-text">
                <p class="ov__config-title">审核任务</p>
                <p class="ov__config-sub">进行中 {{ data.counts.tasksActive }} 个 · 失败 {{ data.counts.tasksFailed }} 个</p>
              </div>
              <AppButton size="sm" variant="ghost" icon-right="chevron-right" @click="emit('open', 'tasks')">查看</AppButton>
            </div>
          </div>
        </article>

        <article class="card">
          <header class="card__head">
            <div>
              <p class="card__title">市场统计</p>
            </div>
          </header>
          <div class="card__body ov__stats">
            <div class="stat">
              <span class="stat__label">收藏总数</span>
              <span class="stat__value">{{ formatNumber(data.counts.favorites) }}</span>
            </div>
            <div class="stat">
              <span class="stat__label">下载尝试</span>
              <span class="stat__value">{{ formatNumber(data.counts.downloads) }}</span>
              <span class="stat__meta">成功开始的下载</span>
            </div>
            <div class="stat">
              <span class="stat__label">识别档案</span>
              <span class="stat__value">{{ formatNumber(data.counts.users) }}</span>
            </div>
            <div class="stat">
              <span class="stat__label">已下架 / 已删除</span>
              <span class="stat__value">{{ formatNumber(data.counts.removed) }}</span>
            </div>
          </div>
        </article>
      </section>

      <article class="card">
        <header class="card__head">
          <div>
            <p class="card__title">最近的审核任务</p>
          </div>
          <AppButton size="sm" variant="ghost" icon-right="chevron-right" @click="emit('open', 'tasks')">全部任务</AppButton>
        </header>
        <div v-if="!data.recentTasks.length" class="card__body">
          <div class="empty" style="border: 0; padding: 28px">
            <span class="empty__icon"><AppIcon name="activity" :size="20" /></span>
            <h3 class="empty__title">还没有审核任务</h3>
            <p class="empty__text">提交公开仓库后会显示任务。</p>
          </div>
        </div>
        <div v-else class="ov__tasks">
          <div v-for="task in data.recentTasks" :key="task.id" class="ov__task">
            <AppBadge :variant="statusMeta(task.status).tone" dot>{{ statusMeta(task.status).label }}</AppBadge>
            <span class="ov__task-name">{{ task.full_name || task.plugin_id }}</span>
            <span class="ov__task-reason">{{ task.public_reason || '暂无公开理由' }}</span>
            <span class="ov__task-time">{{ formatRelative(task.created_at) }}</span>
          </div>
        </div>
      </article>

      <section class="ov__actions">
        <AppButton variant="primary" icon="upload" @click="emit('open', 'plugins')">提交 GitHub 仓库</AppButton>
        <AppButton icon="sparkles" @click="emit('open', 'ai')">配置 AI 审核</AppButton>
        <AppButton icon="layers" @click="emit('open', 'sources')">测试下载源</AppButton>
        <AppButton icon="lock" @click="emit('open', 'security')">修改管理员密码</AppButton>
      </section>
    </template>
  </AsyncState>
</template>

<style scoped>
.ov__tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.ov__grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 18px; margin-top: 18px; }
.ov__config { display: flex; flex-direction: column; gap: 4px; }
.ov__config-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border-subtle); }
.ov__config-row:last-child { border-bottom: 0; }
.ov__config-icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: var(--r-sm); flex: none; background: var(--bg-subtle); color: var(--text-secondary); }
.ov__config-icon--ok { background: var(--success-surface); color: var(--success-text); }
.ov__config-icon--warn { background: var(--warning-surface); color: var(--warning-text); }
.ov__config-text { flex: 1; min-width: 0; }
.ov__config-title { font-size: var(--text-body); font-weight: 620; }
.ov__config-sub { margin-top: 2px; font-size: var(--text-small); color: var(--text-tertiary); overflow-wrap: anywhere; }
.ov__stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.ov__tasks { display: flex; flex-direction: column; }
.ov__task { display: grid; grid-template-columns: 118px minmax(0, 1fr) minmax(0, 1.4fr) auto; gap: 14px; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--border-subtle); font-size: var(--text-small); }
.ov__task:last-child { border-bottom: 0; }
.ov__task-name { font-weight: 620; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov__task-reason { color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov__task-time { color: var(--text-tertiary); white-space: nowrap; }
.ov__actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }

@media (max-width: 1000px) {
  .ov__grid { grid-template-columns: 1fr; }
  .ov__task { grid-template-columns: 110px minmax(0, 1fr) auto; }
  .ov__task-reason { display: none; }
}
@media (max-width: 560px) { .ov__tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } }
</style>
