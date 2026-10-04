<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, errorMessage, type StudioOverview } from '../lib/api'
import { statusMeta } from '../lib/status'
import { formatNumber, formatRelative } from '../lib/format'
import AsyncState from './AsyncState.vue'
import AppIcon from './AppIcon.vue'
import AppBadge from './AppBadge.vue'
import AppButton from './AppButton.vue'

type PanelKey = 'reviews' | 'overview' | 'plugins' | 'tasks' | 'logs' | 'ai' | 'sources' | 'security'
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
    { key: 'awaitingReview', label: '等待人工审核', value: counts?.awaitingReview ?? 0, icon: 'activity' as const, tone: '' },
    { key: 'waiting', label: '等待材料或配置', value: counts?.waiting ?? 0, icon: 'clock' as const, tone: 'warning' },
    { key: 'rejected', label: '已退回', value: counts?.rejected ?? 0, icon: 'x-circle' as const, tone: 'danger' },
    { key: 'blocked', label: '已停用', value: counts?.blocked ?? 0, icon: 'ban' as const, tone: 'danger' },
  ]
}
</script>

<template>
  <AsyncState :loading="loading" :error="error" skeleton="row" :skeleton-count="6" @retry="load">
    <template v-if="data">
      <section class="ov__tiles">
        <article v-for="tile in tiles()" :key="tile.key" class="stat-tile">
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
                <p class="ov__config-title">自动审核（备用）</p>
                <p class="ov__config-sub">{{ data.ai.configured ? `${data.ai.model} · ${data.ai.baseUrl}` : '已停用，不影响人工审核' }}</p>
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
                <p class="ov__config-title">整理任务</p>
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
            <p class="card__title">最近处理记录</p>
          </div>
          <AppButton size="sm" variant="ghost" icon-right="chevron-right" @click="emit('open', 'tasks')">全部任务</AppButton>
        </header>
        <div v-if="!data.recentTasks.length" class="card__body">
          <div class="empty" style="border: 0; padding: 28px">
            <span class="empty__icon"><AppIcon name="activity" :size="20" /></span>
            <h3 class="empty__title">还没有整理任务</h3>
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
        <AppButton icon="upload" @click="emit('open', 'plugins')">管理投稿</AppButton>
        <AppButton icon="shield-check" @click="emit('open', 'reviews')">打开审核收件箱</AppButton>
        <AppButton icon="layers" @click="emit('open', 'sources')">测试下载源</AppButton>
        <AppButton icon="lock" @click="emit('open', 'security')">修改管理员密码</AppButton>
      </section>
    </template>
  </AsyncState>
</template>

<style scoped>
.ov__tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: var(--r-group); background: var(--surface); }
.ov__tiles .stat-tile { padding: 20px; border-radius: 0; border: 0; border-right: 1px solid var(--line); box-shadow: none; background: transparent; }
.ov__tiles .stat-tile:nth-child(3n) { border-right: 0; }
.ov__tiles .stat-tile:nth-child(-n+3) { border-bottom: 1px solid var(--line); }
.ov__tiles .stat__value { font-size: 24px; }
.ov__grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 18px; margin-top: 18px; }
.ov__config { display: flex; flex-direction: column; gap: 4px; }
.ov__config-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.ov__config-row:last-child { border-bottom: 0; }
.ov__config-icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: var(--r-control); flex: none; background: var(--surface-raised); color: var(--text-2); }
.ov__config-icon--ok { background: var(--success-surface); color: var(--success); }
.ov__config-icon--warn { background: var(--warning-surface); color: var(--warning); }
.ov__config-text { flex: 1; min-width: 0; }
.ov__config-title { font-size: var(--fs-body); font-weight: 620; }
.ov__config-sub { margin-top: 2px; font-size: var(--fs-sm); color: var(--text-3); overflow-wrap: anywhere; }
.ov__stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.ov__tasks { display: flex; flex-direction: column; }
.ov__task { display: grid; grid-template-columns: 118px minmax(0, 1fr) minmax(0, 1.4fr) auto; gap: 14px; align-items: center; padding: 12px 20px; border-bottom: 1px solid var(--line); font-size: var(--fs-sm); }
.ov__task:last-child { border-bottom: 0; }
.ov__task-name { font-weight: 620; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov__task-reason { color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov__task-time { color: var(--text-3); white-space: nowrap; }
.ov__actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }

@media (max-width: 1000px) {
  .ov__grid { grid-template-columns: 1fr; }
  .ov__task { grid-template-columns: 110px minmax(0, 1fr) auto; }
  .ov__task-reason { display: none; }
}
@media (max-width: 560px) { .ov__tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ov__tiles .stat-tile { padding: 16px; } .ov__tiles .stat-tile:nth-child(3n) { border-right: 1px solid var(--line); } .ov__tiles .stat-tile:nth-child(2n) { border-right: 0; } .ov__tiles .stat-tile:nth-child(-n+4) { border-bottom: 1px solid var(--line); } }
</style>
