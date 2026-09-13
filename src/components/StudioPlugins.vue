<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { api, errorMessage, post, type StudioPlugin, type StudioPluginDetail } from '../lib/api'
import { statusMeta, isActive } from '../lib/status'
import { formatDateTime, formatNumber, formatSize, formatRelative, shortId } from '../lib/format'
import { toast } from '../lib/toast'
import AsyncState from './AsyncState.vue'
import AppPagination from './AppPagination.vue'
import AppIcon from './AppIcon.vue'
import AppBadge from './AppBadge.vue'
import AppButton from './AppButton.vue'
import AppModal from './AppModal.vue'
import AppDrawer from './AppDrawer.vue'
import AppMenu from './AppMenu.vue'
import { navigateTabs } from '../composables/tabs'
import SubmissionForm from './SubmissionForm.vue'
import UploadForm from './UploadForm.vue'

type Action = 'manual-publish' | 'sync' | 'retry' | 'unlist' | 'delete' | 'restore'

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'published', label: '已上架' },
  { key: 'in_review', label: '审核中' },
  { key: 'waiting', label: '等待处理' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'removed', label: '已下架' },
  { key: 'blocked', label: '已停用' },
]

const ACTION_META: Record<Action, { label: string; title: string; confirm: string; danger: boolean; hint: string }> = {
  'manual-publish': { label: '手动上架', title: '手动上架当前版本', confirm: '确认手动上架', danger: false, hint: '跳过 AI 审核和查毒，直接公开当前版本并开放下载。页面将标明手动上架；新版本仍需单独审核或手动上架。' },
  sync: { label: '同步', title: '同步原仓库', confirm: '开始同步', danger: false, hint: '重新读取 GitHub 快照。' },
  retry: { label: '重新审核', title: '重新审核', confirm: '重新审核', danger: false, hint: '重新读取材料并送审。' },
  unlist: { label: '下架', title: '下架插件', confirm: '确认下架', danger: true, hint: '立即移出市场并禁止下载，不可自动恢复。' },
  delete: { label: '删除', title: '删除插件', confirm: '确认删除', danger: true, hint: '清理快照、附件与收藏，仅保留提交状态与原因。' },
  restore: { label: '显式恢复', title: '显式恢复', confirm: '恢复并重新审核', danger: false, hint: '重新进入审核，通过后上架。' },
}

const items = ref<StudioPlugin[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const query = ref('')
const status = ref('all')
const reason = ref('')
const loading = ref(true)
const error = ref('')
const busy = ref('')
const submitOpen = ref(false)
const detailId = ref('')
const uploadOpen = ref(false)
const detail = ref<StudioPluginDetail | null>(null)
const detailLoading = ref(false)
const detailTab = ref<'snapshot' | 'tasks' | 'audits'>('snapshot')
const pending = ref<{ plugin: StudioPlugin; action: Action } | null>(null)


let timer: ReturnType<typeof setTimeout>
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ q: query.value.trim(), status: status.value, page: String(page.value), pageSize: String(pageSize.value) })
    const data = await api<{ items: StudioPlugin[]; total: number; page: number; pageSize: number }>(`/api/studio/plugins?${params}`)
    items.value = data.items
    total.value = data.total
    pageSize.value = data.pageSize
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    loading.value = false
  }
}

function ask(plugin: StudioPlugin, action: Action) {
  pending.value = { plugin, action }
}

async function confirmAction() {
  if (!pending.value) return
  const { plugin, action } = pending.value
  busy.value = plugin.id
  try {
    await post(`/api/studio/plugins/${plugin.id}/${action}`, { reason: reason.value, ...(action === 'manual-publish' ? { confirmed: true, revision: plugin.revision } : {}) })
    toast.success(`${ACTION_META[action].label}已受理`, plugin.full_name)
    pending.value = null
    await load()
    if (detailId.value === plugin.id) await openDetail(plugin.id)
  } catch (caught) {
    toast.error('操作未生效', errorMessage(caught))
  } finally {
    busy.value = ''
  }
}

async function openDetail(id: string) {
  detailId.value = id
  detail.value = null
  detailLoading.value = true
  detailTab.value = 'snapshot'
  try {
    detail.value = await api<StudioPluginDetail>(`/api/studio/plugins/${id}`)
  } catch (caught) {
    toast.error('无法读取插件详情', errorMessage(caught))
    detailId.value = ''
  } finally {
    detailLoading.value = false
  }
}

watch([query, status], () => {
  page.value = 1
  clearTimeout(timer)
  timer = setTimeout(load, 260)
})
watch(page, load)
onUnmounted(() => clearTimeout(timer))
void load()
</script>

<template>
  <section class="sp">
    <header class="sp__head">
      <div>
        <h2 class="sp__title">插件管理</h2>
        <p class="sp__desc">搜索插件，执行同步、重审、下架与恢复。</p>
      </div>
      <AppButton variant="primary" icon="plus" @click="submitOpen = true">提交插件</AppButton>
    </header>

    <div class="sp__toolbar">
      <div class="input-icon sp__search">
        <AppIcon name="search" :size="16" />
        <label for="studio-search" class="sr-only">搜索名称或描述</label>
        <input id="studio-search" v-model="query" class="input" type="search" placeholder="搜索仓库名称或描述" autocomplete="off" />
      </div>
      <div class="input-icon sp__search">
        <AppIcon name="flag" :size="16" />
        <label for="studio-reason" class="sr-only">操作原因（对用户可见）</label>
        <input id="studio-reason" v-model="reason" class="input" maxlength="300" placeholder="操作原因" />
      </div>
      <AppButton size="md" icon="refresh" :loading="loading" @click="load">刷新</AppButton>
    </div>

    <div class="sp__filters" role="group" aria-label="状态筛选">
      <button
        v-for="item in FILTERS"
        :key="item.key"
        type="button"
        class="chip"
        :aria-pressed="status === item.key"
        @click="status = item.key"
      >
        {{ item.label }}
      </button>
    </div>

    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!items.length"
      skeleton="row"
      :skeleton-count="6"
      empty-title="没有匹配的插件"
      empty-text="换个关键词或筛选条件试试。"
      @retry="load"
    >
      <div class="card sp__table-card">
        <div class="table-wrap" role="region" aria-label="插件管理表格，可横向滚动" tabindex="0">
          <table class="table sp__table">
            <thead>
              <tr>
                <th scope="col">仓库</th>
                <th scope="col">状态</th>
                <th scope="col">版本</th>
                <th scope="col">收藏 / 下载</th>
                <th scope="col">最近检查</th>
                <th scope="col" class="sp__actions-col">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="plugin in items" :key="plugin.id">
                <td>
                  <div class="sp__repo">
                    <span class="sp__repo-name">{{ plugin.full_name }}</span>
                    <span class="sp__repo-meta">
                      <span class="mono">ID {{ shortId(plugin.id) }}</span>
                      <span aria-hidden="true">·</span>
                      <span class="mono">{{ plugin.source_kind === 'upload' ? '直传' : 'repo ' + plugin.repository_id }}</span>
                      <span aria-hidden="true">·</span>
                      <span>revision {{ plugin.revision }}</span>
                    </span>
                    <span class="sp__repo-reason">{{ plugin.public_reason || '—' }}</span>
                  </div>
                </td>
                <td>
                  <div class="sp__status">
                    <AppBadge :variant="statusMeta(plugin.status).tone" :dot="isActive(plugin.status)" :pulse="isActive(plugin.status)">
                      <AppIcon :name="statusMeta(plugin.status).icon" :size="12" />{{ statusMeta(plugin.status).label }}
                    </AppBadge>
                    <AppBadge v-if="plugin.blocked" variant="danger"><AppIcon name="ban" :size="12" />禁止自动恢复</AppBadge>
                    <span v-if="plugin.task_status && plugin.task_status !== plugin.status" class="sp__task">
                      任务：{{ statusMeta(plugin.task_status).label }}
                    </span>
                  </div>
                </td>
                <td class="mono small">{{ plugin.version || '—' }}</td>
                <td class="tnum small">{{ formatNumber(plugin.favorite_count) }} / {{ formatNumber(plugin.download_count) }}</td>
                <td class="small muted">{{ plugin.checked_at ? formatRelative(plugin.checked_at) : '尚未检查' }}</td>
                <td>
                  <div class="table__actions">
                    <AppButton size="sm" variant="ghost" icon="external-link" @click="openDetail(plugin.id)">详情</AppButton>
                    <AppButton v-if="plugin.source_kind !== 'upload'" size="sm" :loading="busy === plugin.id && pending?.action === 'sync'" @click="ask(plugin, 'sync')">同步</AppButton>
                    <AppButton size="sm" :disabled="!!busy" @click="ask(plugin, 'manual-publish')">手动上架</AppButton>
                    <AppMenu :label="`${plugin.full_name} 的更多操作`">
                      <template #trigger><AppIcon name="sliders" :size="19" /></template>
                      <button type="button" class="menu__item" role="menuitem" @click="ask(plugin, 'retry')"><AppIcon name="refresh" :size="15" />重新审核</button>
                      <button type="button" class="menu__item" role="menuitem" :disabled="!!plugin.blocked" @click="ask(plugin, 'unlist')"><AppIcon name="ban" :size="15" />下架</button>
                      <button type="button" class="menu__item menu__item--danger" role="menuitem" @click="ask(plugin, 'delete')"><AppIcon name="trash" :size="15" />删除</button>
                      <template v-if="plugin.blocked || ['deleted', 'unlisted', 'removed'].includes(plugin.status || '')">
                        <div class="menu__sep" />
                        <button type="button" class="menu__item" role="menuitem" @click="ask(plugin, 'restore')"><AppIcon name="rotate-ccw" :size="15" />显式恢复</button>
                      </template>
                    </AppMenu>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="pages > 1" class="sp__pager">
        <AppPagination v-model="page" :total-pages="pages" :total="total" />
      </div>
    </AsyncState>

    <AppModal v-model="submitOpen" title="提交插件">
      <SubmissionForm studio @submitted="submitOpen = false; load()" />
    </AppModal>

    <AppModal
      :model-value="!!pending"
      :title="pending ? `${ACTION_META[pending.action].title}：${pending.plugin.full_name}` : ''"
      @update:model-value="pending = null"
    >
      <template v-if="pending">
        <div class="notice" :class="ACTION_META[pending.action].danger && 'notice--danger'">
          <AppIcon :name="ACTION_META[pending.action].danger ? 'alert' : 'info'" :size="16" />
          <span>{{ ACTION_META[pending.action].hint }}</span>
        </div>
        <dl class="sp__confirm">
          <div><dt>当前状态</dt><dd><AppBadge :variant="statusMeta(pending.plugin.status).tone">{{ statusMeta(pending.plugin.status).label }}</AppBadge></dd></div>
          <div><dt>已批准版本</dt><dd class="mono small">{{ pending.plugin.version || '尚无' }}</dd></div>
          <div><dt>公开原因</dt><dd class="small">{{ reason || pending.plugin.public_reason || '未填写' }}</dd></div>
        </dl>
      </template>
      <template #footer>
        <AppButton variant="ghost" @click="pending = null">取消</AppButton>
        <AppButton :variant="pending && ACTION_META[pending.action].danger ? 'danger-solid' : 'primary'" :loading="!!busy" @click="confirmAction">
          {{ pending ? ACTION_META[pending.action].confirm : '' }}
        </AppButton>
      </template>
    </AppModal>

    <AppModal v-model="uploadOpen" title="上传新版本">
      <UploadForm
        v-if="uploadOpen && detail"
        :key="detail.plugin.id"
        studio
        :plugin-id="detail.plugin.id"
        :initial="{ name: detail.upload?.name || detail.plugin.full_name, description: detail.upload?.description || detail.plugin.description || undefined, tutorial: detail.upload?.tutorial || undefined }"
        @submitted="uploadOpen = false; openDetail(detail.plugin.id); load()"
      />
    </AppModal>

    <AppDrawer :model-value="!!detailId" :title="detail?.plugin.full_name || '插件详情'" wide @update:model-value="detailId = ''">
      <template #subtitle>
        <p v-if="detail" class="sp__drawer-sub">
          <AppBadge :variant="statusMeta(detail.plugin.status).tone" dot>{{ statusMeta(detail.plugin.status).label }}</AppBadge>
          <span class="mono small">{{ detail.plugin.id }}</span>
        </p>
      </template>

      <p v-if="detailLoading" class="loading-row"><span class="spinner" />正在读取详情…</p>

      <template v-else-if="detail">
        <div class="sp__drawer-facts">
          <div><span>来源</span><span class="mono">{{ detail.plugin.source_kind === 'upload' ? '直接上传 IPK' : 'repository ID ' + detail.plugin.repository_id }}</span></div>
          <div><span>revision</span><span class="mono">{{ detail.plugin.revision }}</span></div>
          <div><span>提交者</span><span class="mono">{{ detail.plugin.submitter_id ? shortId(detail.plugin.submitter_id) : '管理员' }}</span></div>
          <div><span>创建时间</span><span>{{ formatDateTime(detail.plugin.created_at) }}</span></div>
          <div><span>最近检查</span><span>{{ detail.plugin.checked_at ? formatDateTime(detail.plugin.checked_at) : '尚未检查' }}</span></div>
          <div><span>收藏 / 下载</span><span class="tnum">{{ formatNumber(detail.plugin.favorite_count) }} / {{ formatNumber(detail.plugin.download_count) }}</span></div>
        </div>

        <p class="sp__drawer-reason">{{ detail.plugin.public_reason || '—' }}</p>

        <nav class="tabs sp__drawer-tabs" role="tablist" aria-label="插件管理详情" @keydown="navigateTabs">
          <button id="studio-tab-snapshot" type="button" role="tab" class="tabs__item" :aria-selected="detailTab === 'snapshot'" :tabindex="detailTab === 'snapshot' ? 0 : -1" aria-controls="studio-panel-snapshot" @click="detailTab = 'snapshot'">
            <AppIcon name="shield-check" :size="15" />已批准快照
          </button>
          <button id="studio-tab-tasks" type="button" role="tab" class="tabs__item" :aria-selected="detailTab === 'tasks'" :tabindex="detailTab === 'tasks' ? 0 : -1" aria-controls="studio-panel-tasks" @click="detailTab = 'tasks'">
            <AppIcon name="activity" :size="15" />任务记录
            <span class="tabs__count">{{ detail.tasks.length }}</span>
          </button>
          <button id="studio-tab-audits" type="button" role="tab" class="tabs__item" :aria-selected="detailTab === 'audits'" :tabindex="detailTab === 'audits' ? 0 : -1" aria-controls="studio-panel-audits" @click="detailTab = 'audits'">
            <AppIcon name="history" :size="15" />审计
          </button>
        </nav>

        <section v-if="detailTab === 'snapshot'" :id="`studio-panel-${detailTab}`" class="sp__drawer-section" role="tabpanel" :aria-labelledby="`studio-tab-${detailTab}`">
          <template v-if="detail.snapshot">
            <div class="sp__kv">
              <div><span>结论</span><span><AppBadge :variant="statusMeta(detail.snapshot.verdict).tone">{{ statusMeta(detail.snapshot.verdict).label }}</AppBadge></span></div>
              <div><span>审核版本</span><span class="mono small">{{ detail.snapshot.review_version }}</span></div>
              <div><span>快照时间</span><span>{{ formatDateTime(detail.snapshot.created_at) }}</span></div>
              <div><span>快照 revision</span><span class="mono">{{ detail.snapshot.revision }}</span></div>
            </div>
            <p class="sp__block-title">公开理由</p>
            <p class="sp__block-text">{{ detail.snapshot.public_reason || '—' }}</p>
            <p class="sp__block-title">内部依据（仅管理员可见）</p>
            <pre class="sp__internal">{{ detail.snapshot.internal_reason || '—' }}</pre>

            <p class="sp__block-title">已批准附件</p>
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr><th scope="col">文件名</th><th scope="col">架构</th><th scope="col">大小</th><th scope="col">状态</th></tr>
                </thead>
                <tbody>
                  <tr v-for="asset in detail.assets" :key="asset.id">
                    <td>
                      <span class="mono small">{{ asset.name }}</span>
                      <span class="sp__asset-sub mono">{{ shortId(asset.sha256, 16) }}</span>
                    </td>
                    <td class="small">{{ asset.architecture || '—' }}</td>
                    <td class="tnumsmall small">{{ formatSize(asset.size) }}</td>
                    <td>
                      <AppBadge :variant="asset.disabled ? 'danger' : 'success'">{{ asset.disabled ? '已停用' : '可下载' }}</AppBadge>
                    </td>
                  </tr>
                  <tr v-if="!detail.assets.length"><td colspan="4" class="muted">—</td></tr>
                </tbody>
              </table>
            </div>
          </template>
          <p v-else class="muted small">—</p>
        </section>

        <section v-else-if="detailTab === 'tasks'" :id="`studio-panel-${detailTab}`" class="sp__drawer-section" role="tabpanel" :aria-labelledby="`studio-tab-${detailTab}`">
          <article v-for="task in detail.tasks" :key="task.id" class="sp__task-card">
            <div class="row gap-2 wrap">
              <AppBadge :variant="statusMeta(task.status).tone" dot>{{ statusMeta(task.status).label }}</AppBadge>
              <span class="mono micro muted">revision {{ task.revision }} · 尝试 {{ task.attempts }} 次</span>
            </div>
            <p class="small" style="margin-top: 8px">{{ task.public_reason || '—' }}</p>
            <details v-if="task.internal_reason">
              <summary>内部依据</summary>
              <pre class="sp__internal">{{ task.internal_reason }}</pre>
            </details>
            <p class="micro muted" style="margin-top: 6px">{{ formatDateTime(task.created_at) }} · 更新于 {{ formatDateTime(task.updated_at) }}</p>
          </article>
          <p v-if="!detail.tasks.length" class="muted small">—</p>
        </section>

        <section v-else :id="`studio-panel-${detailTab}`" class="sp__drawer-section" role="tabpanel" :aria-labelledby="`studio-tab-${detailTab}`">
          <article v-for="entry in detail.audits" :key="entry.id" class="sp__audit">
            <AppIcon name="history" :size="15" />
            <span class="grow">{{ entry.action }}</span>
            <span class="mono micro muted">{{ shortId(entry.admin_id || '', 8) }}</span>
            <span class="micro muted">{{ formatDateTime(entry.created_at) }}</span>
          </article>
          <p v-if="!detail.audits.length" class="muted small">—</p>
        </section>
      </template>

      <template #footer>
        <AppButton v-if="detail" variant="ghost" icon="refresh" @click="openDetail(detail.plugin.id)">重新读取</AppButton>
        <AppButton v-if="detail?.plugin.source_kind === 'upload'" variant="primary" icon="upload" @click="uploadOpen = true">上传新版本</AppButton>
        <AppButton v-if="detail" variant="secondary" icon="external-link" :href="`/plugins/${detail.plugin.id}`">打开公开页</AppButton>
      </template>
    </AppDrawer>
  </section>
</template>

<style scoped>
.sp { display: flex; flex-direction: column; gap: 16px; }
.sp__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sp__title { font-size: var(--fs-h2); }
.sp__desc { margin-top: 5px; max-width: 88ch; font-size: var(--fs-sm); color: var(--text-3); line-height: 1.65; }
.sp__toolbar { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.6fr) auto; gap: 10px; align-items: center; }
.sp__search { display: flex; align-items: center; gap: 10px; padding-inline: 12px; min-width: 0; border: 1px solid var(--line); border-radius: var(--r-control); background: var(--surface); color: var(--text-3); }
.sp__search:focus-within { border-color: var(--signal); }
.sp__search > svg { flex: none; }
.sp__search .input { flex: 1; width: 0; min-width: 0; padding-inline: 0; border: 0; background: transparent; box-shadow: none; }
.sp__search .input:focus-visible { outline-offset: 1px; }
.sp__filters { display: flex; gap: 8px; flex-wrap: wrap; }
.sp__table-card { overflow: hidden; }
.sp__table { min-width: 900px; }
.sp__table :deep(td) { vertical-align: top; }
.sp__actions-col { text-align: right; }
.sp__repo { display: flex; flex-direction: column; gap: 4px; min-width: 220px; }
.sp__repo-name { font-weight: 640; font-size: var(--fs-body); }
.sp__repo-meta { display: flex; align-items: center; gap: 6px; font-size: var(--fs-cap); color: var(--text-3); flex-wrap: wrap; }
.sp__repo-reason { font-size: var(--fs-sm); color: var(--text-3); max-width: 46ch; }
.sp__status { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.sp__task { font-size: var(--fs-cap); color: var(--text-3); }
.sp__menu-wrap { position: relative; }
.sp__menu { top: calc(100% + 6px); right: 0; }
.sp__pager { margin-top: 14px; }
.sp__confirm { display: flex; flex-direction: column; gap: 0; margin: 14px 0 4px; }
.sp__confirm > div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); align-items: center; }
.sp__confirm dt { font-size: var(--fs-sm); color: var(--text-3); }
.sp__confirm dd { margin: 0; }
.sp__drawer-sub { display: flex; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
.sp__drawer-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; padding: 14px; border: 1px solid var(--line); border-radius: var(--r-control); background: var(--surface-raised); }
.sp__drawer-facts > div { display: flex; flex-direction: column; gap: 2px; }
.sp__drawer-facts span:first-child { font-size: var(--fs-cap); color: var(--text-3); }
.sp__drawer-facts span:last-child { font-size: var(--fs-sm); font-weight: 600; }
.sp__drawer-reason { margin-top: 14px; font-size: var(--fs-body); color: var(--text-2); line-height: 1.6; }
.sp__drawer-tabs { margin-top: 18px; }
.sp__drawer-section { padding-top: 18px; display: flex; flex-direction: column; gap: 10px; }
.sp__kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; }
.sp__kv > div { display: flex; flex-direction: column; gap: 3px; }
.sp__kv span:first-child { font-size: var(--fs-cap); color: var(--text-3); }
.sp__block-title { margin-top: 12px; font-size: var(--fs-sm); font-weight: 650; color: var(--text-2); }
.sp__block-text { font-size: var(--fs-sm); color: var(--text-2); line-height: 1.6; }
.sp__internal {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-control);
  background: var(--bg-deep);
  color: var(--text-2);
  font-size: var(--fs-sm);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow: auto;
}
.sp__asset-sub { display: block; font-size: var(--fs-cap); color: var(--text-3); }
.sp__task-card { padding: 14px; border: 1px solid var(--line); border-radius: var(--r-control); background: var(--surface); }
.sp__task-card details { margin-top: 8px; }
.sp__task-card summary { font-size: var(--fs-sm); color: var(--signal-text); }
.sp__audit { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--r-control); background: var(--surface); font-size: var(--fs-sm); }

@media (max-width: 1000px) {
  .sp__toolbar { grid-template-columns: 1fr; }
  .sp__drawer-facts, .sp__kv { grid-template-columns: 1fr; }
}
</style>
