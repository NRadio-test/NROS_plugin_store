<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, errorMessage, type StudioTask } from '../lib/api'
import { statusMeta, isActive } from '../lib/status'
import { formatDateTime, shortId } from '../lib/format'
import AsyncState from './AsyncState.vue'
import AppPagination from './AppPagination.vue'
import AppIcon from './AppIcon.vue'
import AppBadge from './AppBadge.vue'
import AppButton from './AppButton.vue'

interface LogItem { id: string; action: string; target: string; created_at: number; admin_id?: string | null }

const props = defineProps<{ kind: 'tasks' | 'logs' }>()

const tasks = ref<StudioTask[]>([])
const logs = ref<LogItem[]>([])
const loading = ref(true)
const error = ref('')
const page = ref(1)
const expanded = ref('')
const pageSize = 20

const total = computed(() => (props.kind === 'tasks' ? tasks.value.length : logs.value.length))
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const visibleTasks = computed(() => tasks.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const visibleLogs = computed(() => logs.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const ACTION_LABELS: Record<string, string> = {
  login: '管理员登录', logout: '退出登录', submit: '提交仓库', sync: '同步仓库', retry: '重新审核',
  unlist: '下架插件', delete: '删除插件', restore: '显式恢复', 'ai-settings': '更新 AI 设置',
  'ai-test': '测试 AI 接口', 'download-sources': '更新下载源', 'source-test': '测试下载源',
  'password-change': '修改管理员密码',
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (props.kind === 'tasks') tasks.value = (await api<{ items: StudioTask[] }>('/api/studio/tasks')).items
    else logs.value = (await api<{ items: LogItem[] }>('/api/studio/logs')).items
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    loading.value = false
  }
}
watch(() => props.kind, () => { page.value = 1; expanded.value = ''; void load() }, { immediate: true })
</script>

<template>
  <section class="records">
    <header class="records__head">
      <div>
        <h2 class="records__title">{{ kind === 'tasks' ? '审核任务' : '操作日志' }}</h2>
        <p class="records__desc">
          {{ kind === 'tasks'
            ? '任务按 revision 持久化保存，可重复、乱序与崩溃重试；公开理由对用户可见，内部依据仅管理员可见。'
            : '所有敏感操作都会记录管理员、动作与目标，便于回溯下架与恢复过程。' }}
        </p>
      </div>
      <AppButton size="sm" icon="refresh" :loading="loading" @click="load">刷新记录</AppButton>
    </header>

    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!total"
      skeleton="row"
      :skeleton-count="6"
      :empty-title="kind === 'tasks' ? '暂无审核任务' : '暂无操作日志'"
      :empty-text="kind === 'tasks' ? '新投稿、定时同步与手动刷新都会生成任务。' : '管理员登录、下架、配置变更等操作会出现在这里。'"
      @retry="load"
    >
      <div v-if="kind === 'tasks'" class="records__list">
        <article v-for="task in visibleTasks" :key="task.id" class="record">
          <div class="record__main">
            <div class="record__head">
              <AppBadge :variant="statusMeta(task.status).tone" :dot="isActive(task.status)" :pulse="isActive(task.status)">
                <AppIcon :name="statusMeta(task.status).icon" :size="12" />{{ statusMeta(task.status).label }}
              </AppBadge>
              <span class="record__rev">revision {{ task.revision }}</span>
              <span class="record__attempts">尝试 {{ task.attempts }} 次</span>
            </div>
            <p class="record__reason">{{ task.public_reason || '暂无公开理由' }}</p>
            <p class="record__meta">
              <span class="mono">任务 {{ shortId(task.id) }}</span>
              <span aria-hidden="true">·</span>
              <span class="mono">插件 {{ shortId(task.plugin_id) }}</span>
              <span aria-hidden="true">·</span>
              <time>{{ formatDateTime(task.created_at) }}</time>
            </p>
          </div>
          <AppButton v-if="task.internal_reason" size="sm" variant="ghost" @click="expanded = expanded === task.id ? '' : task.id">
            {{ expanded === task.id ? '收起依据' : '内部依据' }}
          </AppButton>
          <pre v-if="expanded === task.id" class="record__internal">{{ task.internal_reason }}</pre>
        </article>
      </div>

      <div v-else class="records__list">
        <article v-for="log in visibleLogs" :key="log.id" class="record record--log">
          <span class="record__icon"><AppIcon name="history" :size="15" /></span>
          <div class="record__main">
            <p class="record__action">{{ ACTION_LABELS[log.action] || log.action }}</p>
            <p class="record__meta">
              <span class="mono">{{ shortId(log.target, 12) }}</span>
              <span aria-hidden="true">·</span>
              <time>{{ formatDateTime(log.created_at) }}</time>
            </p>
          </div>
        </article>
      </div>

      <div v-if="pages > 1" class="records__pager">
        <AppPagination v-model="page" :total-pages="pages" :total="total" />
      </div>
    </AsyncState>
  </section>
</template>

<style scoped>
.records { display: flex; flex-direction: column; gap: 16px; }
.records__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.records__title { font-size: var(--text-h2); }
.records__desc { margin-top: 5px; max-width: 80ch; font-size: var(--text-small); color: var(--text-tertiary); line-height: 1.65; }
.records__list { display: flex; flex-direction: column; gap: 10px; }
.record {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 16px;
  align-items: start;
  padding: 16px 18px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-xs);
}
.record--log { grid-template-columns: auto minmax(0, 1fr); align-items: center; padding: 13px 16px; }
.record__head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.record__rev, .record__attempts { font-size: var(--text-micro); color: var(--text-tertiary); font-family: var(--font-mono); }
.record__reason { margin-top: 8px; font-size: var(--text-body); color: var(--text-secondary); line-height: 1.6; }
.record__action { font-size: var(--text-body); font-weight: 620; }
.record__meta { display: flex; align-items: center; gap: 6px; margin-top: 7px; font-size: var(--text-small); color: var(--text-tertiary); flex-wrap: wrap; }
.record__internal {
  grid-column: 1 / -1;
  margin: 4px 0 0;
  padding: 12px 14px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-sm);
  background: var(--bg-sunken);
  color: var(--text-secondary);
  font-size: var(--text-small);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
}
.record__icon { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: var(--r-sm); background: var(--bg-subtle); color: var(--text-tertiary); }
.records__pager { margin-top: 12px; }
</style>
