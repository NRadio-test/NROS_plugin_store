<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { api, errorMessage, post, type StudioPlugin, type StudioPluginDetail } from '../lib/api'
import { renderReadme } from '../lib/readme'
import { formatDateTime, formatSize } from '../lib/format'
import { toast } from '../lib/toast'
import { statusMeta } from '../lib/status'
import AsyncState from './AsyncState.vue'
import AppButton from './AppButton.vue'
import AppBadge from './AppBadge.vue'
import AppIcon from './AppIcon.vue'
import AppDrawer from './AppDrawer.vue'
import AppField from './AppField.vue'
import AppPagination from './AppPagination.vue'

const props = defineProps<{ initialId?: string }>()
const items = ref<StudioPlugin[]>([]), total = ref(0), page = ref(1)
const query = ref(''), filter = ref('awaiting_review'), loading = ref(true), error = ref('')
const selected = ref(''), detail = ref<StudioPluginDetail | null>(null), detailLoading = ref(false), detailError = ref('')
const reason = ref(''), internalReason = ref(''), decisionError = ref(''), busy = ref(false)
const candidate = computed(() => detail.value?.candidate)
const rendered = computed(() => candidate.value ? renderReadme(candidate.value.readme, candidate.value.name, candidate.value.readmeCommit, candidate.value.readmePath, candidate.value.uploaded) : '')
const filters = [{ key: 'awaiting_review', label: '待我审核' }, { key: 'in_review', label: '资料整理中' }, { key: 'rejected', label: '已退回' }, { key: 'published', label: '已上架' }]
let timer: ReturnType<typeof setTimeout>
let listRequest = 0, detailRequest = 0
async function load() {
  const request = ++listRequest
  loading.value = true; error.value = ''
  try {
    const result = await api<{items:StudioPlugin[];total:number}>(`/api/studio/plugins?q=${encodeURIComponent(query.value)}&status=${filter.value}&page=${page.value}&pageSize=20`)
    if (request === listRequest) { items.value = result.items; total.value = result.total }
  } catch (caught) { if (request === listRequest) error.value = errorMessage(caught) }
  finally { if (request === listRequest) loading.value = false }
}
async function open(id: string) {
  const request = ++detailRequest
  selected.value = id; detail.value = null; detailLoading.value = true; detailError.value = ''; decisionError.value = ''; reason.value = ''; internalReason.value = ''
  try { const result = await api<StudioPluginDetail>(`/api/studio/plugins/${id}`); if (request === detailRequest) detail.value = result }
  catch (caught) { if (request === detailRequest) detailError.value = errorMessage(caught) }
  finally { if (request === detailRequest) detailLoading.value = false }
}
async function decide(decision: 'approve' | 'reject') {
  if (!candidate.value || busy.value || candidate.value.decision !== 'pending') return
  if (decision === 'reject' && reason.value.trim().length < 5) { decisionError.value = '请写至少 5 字的退回原因，告诉作者需要修改什么。'; document.getElementById('review-reason')?.focus(); return }
  busy.value = true; decisionError.value = ''
  try {
    await post(`/api/studio/plugins/${selected.value}/review`, { revision: candidate.value.revision, decision, reason: reason.value.trim(), internalReason: internalReason.value.trim() })
    toast.success(decision === 'approve' ? '审核通过，已上架' : '已退回给作者')
    selected.value = ''; detail.value = null; await load()
  } catch (caught) { decisionError.value = errorMessage(caught) }
  finally { busy.value = false }
}
watch(() => props.initialId, value => { if (value) void open(value) }, { immediate: true })
watch([query, filter], () => { page.value = 1; clearTimeout(timer); timer = setTimeout(load, 220) })
watch(page, load)
onUnmounted(() => { clearTimeout(timer); listRequest++; detailRequest++ })
void load()
</script>

<template>
  <section class="review-inbox">
    <div class="review-inbox__toolbar">
      <div class="input-icon"><AppIcon name="search" :size="16" /><label for="review-search" class="sr-only">搜索待审作品</label><input id="review-search" v-model="query" class="input" type="search" placeholder="搜索作品名称或简介" /></div>
      <AppButton icon="refresh" :loading="loading" @click="load">刷新</AppButton>
    </div>
    <nav class="review-inbox__filters" aria-label="审核队列筛选"><button v-for="item in filters" :key="item.key" class="tabs__item" :aria-pressed="filter === item.key" @click="filter = item.key">{{ item.label }}</button><span class="review-inbox__count">{{ total }} 项</span></nav>
    <AsyncState :loading="loading" :error="error" :empty="!items.length" skeleton="row" :skeleton-count="4" :empty-title="filter === 'awaiting_review' ? '待审队列已清空' : '这里暂时没有作品'" :empty-text="query ? '试试其他关键词。' : '新投稿和新版本整理完成后会出现在这里。'" @retry="load">
      <div class="review-list">
        <article v-for="item in items" :key="item.id" class="review-item">
          <span class="review-item__icon"><AppIcon :name="item.source_kind === 'upload' ? 'package' : 'github'" :size="21" /></span>
          <div class="review-item__content"><button class="review-item__name" @click="open(item.id)">{{ item.full_name }}</button><p>{{ filter === 'rejected' ? item.public_reason : item.description }}</p><div class="review-item__meta"><span>{{ item.source_kind === 'upload' ? 'IPK 直传' : 'GitHub 仓库' }}</span><span v-if="item.version" class="mono">{{ item.version }}</span><time>{{ formatDateTime(item.created_at) }}</time></div></div>
          <AppButton variant="secondary" icon-right="chevron-right" @click="open(item.id)">{{ filter === 'awaiting_review' ? '开始审核' : '查看作品' }}</AppButton>
        </article>
      </div>
      <AppPagination v-if="total > 20" v-model="page" :total="total" :total-pages="Math.ceil(total / 20)" />
    </AsyncState>
    <AppDrawer :model-value="!!selected" :title="candidate?.name || '作品审核'" description="审核决定只适用于当前展示的版本。" @update:model-value="value => { if (!value && !busy) { selected = ''; detailRequest++ } }">
      <AsyncState :loading="detailLoading" :error="detailError" skeleton="row" :skeleton-count="4" @retry="open(selected)">
        <template v-if="candidate">
          <div class="review-facts"><AppBadge :variant="candidate.decision === 'pending' ? 'warning' : candidate.decision === 'approved' ? 'success' : 'danger'">{{ candidate.decision === 'pending' ? '等待人工审核' : candidate.decision === 'approved' ? '人工审核通过' : '已退回' }}</AppBadge><span class="mono">{{ candidate.version }}</span><span>{{ candidate.uploaded ? 'IPK 直传' : 'GitHub 仓库' }}</span></div>
          <section class="review-section"><h3>作品简介</h3><p>{{ candidate.description || '作者尚未提供简介。' }}</p></section>
          <section class="review-section">
            <h3>使用说明</h3>
            <!-- rendered passes through the same DOMPurify renderer as public documentation. -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="readme review-readme" v-html="rendered" />
          </section>
          <section class="review-section"><h3>本次安装包 <span class="muted">{{ candidate.assets.length }}</span></h3><div v-for="asset in candidate.assets" :key="asset.id" class="review-file"><div><strong>{{ asset.name }}</strong><p>{{ formatSize(asset.size) }} · {{ asset.architecture || '未提供架构' }}</p></div><AppButton v-if="candidate.decision === 'pending'" size="sm" :href="`/api/studio/plugins/${selected}/review/download/${asset.id}`" icon="download">下载检查</AppButton></div></section>
          <section v-if="candidate.decision === 'pending'" class="review-section review-decision">
            <h3>给出审核结论</h3>
            <AppField label="给作者的反馈" for-id="review-reason" hint="退回时必填，说明具体需要修改的内容；通过时可留空。" :error="decisionError"><textarea id="review-reason" v-model="reason" class="textarea" maxlength="240" rows="3" :disabled="busy" placeholder="例如：请补充支持的路由器型号及卸载步骤。" /></AppField>
            <details><summary>内部备注</summary><label for="review-internal" class="sr-only">仅管理员可见的内部备注</label><textarea id="review-internal" v-model="internalReason" class="textarea" maxlength="6000" rows="3" :disabled="busy" placeholder="只在后台保存，不会展示给作者。" /></details>
            <p class="small muted">人工通过表示允许收录；当前未执行自动查毒。</p>
          </section>
          <section v-else class="review-section"><h3>审核反馈</h3><p>{{ candidate.publicReason }}</p><p v-if="candidate.reviewedAt" class="small muted">{{ formatDateTime(candidate.reviewedAt) }}</p></section>
        </template>
        <div v-else-if="detail" class="notice"><AppIcon name="clock" :size="16" />{{ statusMeta(detail.plugin.task_status).label }}。资料整理完成后才能审核。</div>
      </AsyncState>
      <template #footer><template v-if="candidate?.decision === 'pending'"><AppButton variant="secondary" icon="x-circle" :disabled="busy" @click="decide('reject')">退回修改</AppButton><AppButton variant="primary" icon="check-circle" :loading="busy" @click="decide('approve')">通过并上架</AppButton></template><AppButton v-else @click="selected = ''">关闭</AppButton></template>
    </AppDrawer>
  </section>
</template>

<style scoped>
.review-inbox { border: 1px solid var(--line); border-radius: var(--r-group); background: var(--surface); overflow: hidden; }
.review-inbox__toolbar { display: grid; grid-template-columns: minmax(0, 440px) auto; justify-content: space-between; gap: 12px; padding: 16px 20px; }
.review-inbox__filters { display: flex; align-items: center; border-bottom: 1px solid var(--line); padding: 0 12px; overflow-x: auto; }
.review-inbox__filters .tabs__item { white-space: nowrap; flex: none; }
.review-inbox__filters .tabs__item[aria-pressed=true] { color: var(--text); font-weight: 600; border-bottom-color: var(--signal); }
.review-inbox__count { color: var(--text-3); font-size: var(--fs-cap); margin-left: auto; padding: 0 8px; white-space: nowrap; }
.review-item { display: flex; align-items: center; gap: 16px; padding: 20px; border-bottom: 1px solid var(--line); }
.review-item:last-child { border-bottom: 0; }
.review-item:hover { background: var(--surface-raised); }
.review-item__icon { color: var(--text-3); display: flex; flex: none; }
.review-item__content { flex: 1; min-width: 0; }
.review-item__name { display: inline-block; font: inherit; font-size: 15px; font-weight: 600; border: 0; padding: 0; background: transparent; color: var(--text); text-align: left; overflow-wrap: anywhere; cursor: pointer; }
.review-item__name:hover { text-decoration: underline; text-underline-offset: 3px; }
.review-item__content p { margin-top: 5px; font-size: var(--fs-sm); color: var(--text-2); overflow-wrap: anywhere; }
.review-item__meta { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 8px; color: var(--text-3); font-size: var(--fs-cap); }
.review-list + .pagination { padding: 16px; }
.review-facts { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: var(--fs-sm); color: var(--text-2); }
.review-section { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--line); }
.review-section h3 { margin-bottom: 14px; font-size: 15px; }
.review-section p { line-height: 1.7; overflow-wrap: anywhere; }
.review-readme { padding: 16px; font-size: var(--fs-sm); background: var(--bg-deep); border: 1px solid var(--line); border-radius: var(--r-control); }
.review-readme :deep(h1) { font-size: 20px; margin-bottom: 12px; }
.review-readme :deep(h2) { font-size: 16px; }
.review-file { display: flex; align-items: center; gap: 12px; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid var(--line); }
.review-file > div { min-width: 0; }
.review-file strong { display: block; overflow-wrap: anywhere; font-size: var(--fs-sm); }
.review-file p { color: var(--text-3); font-size: var(--fs-cap); }
.review-decision { display: grid; gap: 16px; }
.review-decision h3 { margin: 0; }
.review-decision summary { color: var(--text-2); font-size: var(--fs-sm); margin-bottom: 12px; cursor: pointer; }
@media(max-width:640px) { .review-inbox__toolbar { padding: 12px; grid-template-columns: minmax(0,1fr) auto; } .review-inbox__filters { padding: 0; } .review-inbox__count { display: none; } .review-item { flex-wrap: wrap; padding: 18px; gap: 12px; } .review-item__icon { display: none; } .review-item > .btn { width: 100%; } .review-item__content { flex-basis: 100%; } .review-readme :deep(h1) { font-size: 20px; margin-bottom: 12px; }
.review-readme :deep(h2) { font-size: 16px; }
.review-file { flex-wrap: wrap; } }
</style>
