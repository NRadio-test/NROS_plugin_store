<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, errorMessage, session, type Plugin } from '../lib/api'
import { formatNumber } from '../lib/format'
import SearchToolbar from '../components/SearchToolbar.vue'
import AppPagination from '../components/AppPagination.vue'
import PluginRow from '../components/PluginRow.vue'
import AsyncState from '../components/AsyncState.vue'
import AppButton from '../components/AppButton.vue'

type SortKey = 'updated' | 'favorites' | 'downloads'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'updated', label: '最近更新' },
  { key: 'favorites', label: '收藏最多' },
  { key: 'downloads', label: '下载最多' },
]

const route = useRoute()
const router = useRouter()

const readSort = (value: unknown): SortKey => (SORTS.some(item => item.key === value) ? value as SortKey : 'updated')

const search = ref(String(route.query.q || ''))
const page = ref(Math.max(1, Number(route.query.page) || 1))
const sort = ref<SortKey>(readSort(route.query.sort))
const plugins = ref<Plugin[]>([])
const total = ref(0)
const pageSize = ref(12)
const loading = ref(true)
const error = ref('')

let sequence = 0
let timer: ReturnType<typeof setTimeout>
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const searching = computed(() => search.value.trim().length > 0)
const sortLabel = computed(() => SORTS.find(item => item.key === sort.value)!.label)

async function load() {
  const current = ++sequence
  loading.value = true
  error.value = ''
  try {
    const query = new URLSearchParams({ q: search.value.trim(), page: String(page.value), sort: sort.value })
    const data = await api<{ items: Plugin[]; total: number; pageSize: number; sort?: string }>(`/api/plugins?${query}`)
    if (current !== sequence) return
    plugins.value = data.items
    total.value = data.total
    pageSize.value = data.pageSize
    if (data.sort) sort.value = readSort(data.sort)
  } catch (caught) {
    if (current === sequence) error.value = errorMessage(caught)
  } finally {
    if (current === sequence) loading.value = false
  }
}

function syncQuery() {
  void router.replace({
    query: {
      ...(search.value.trim() ? { q: search.value.trim() } : {}),
      ...(page.value > 1 ? { page: String(page.value) } : {}),
      ...(sort.value !== 'updated' ? { sort: sort.value } : {}),
    },
  })
}

watch([search, page, sort], () => {
  clearTimeout(timer)
  timer = setTimeout(() => { syncQuery(); void load() }, 220)
})
watch(() => session.user?.id, load)
watch(() => route.query, query => {
  search.value = String(query.q || '')
  page.value = Math.max(1, Number(query.page) || 1)
  sort.value = readSort(query.sort)
})
onUnmounted(() => { sequence++; clearTimeout(timer) })
void load()
</script>

<template>
  <div class="wrap market">
    <header class="market__head">
      <div><h1>插件市场</h1><p>浏览已通过人工审核的路由器插件。</p></div>
      <AppButton to="/submit" variant="primary" icon="plus">提交插件</AppButton>
    </header>

    <section class="market__catalog" aria-label="插件目录">
      <div class="market__toolbar">
        <div class="market__search"><SearchToolbar v-model:search-query="search" v-model:current-page="page" /></div>
        <div class="market__sort"><label for="market-sort">排序</label><select id="market-sort" v-model="sort" class="select" @change="page = 1"><option v-for="item in SORTS" :key="item.key" :value="item.key">{{ item.label }}</option></select></div>
      </div>
      <div class="market__result-meta" aria-live="polite">
        <template v-if="loading">加载中…</template>
        <template v-else-if="error">加载失败。</template>
        <template v-else>
          <span><b>{{ formatNumber(total) }}</b> 个插件</span>
          <span aria-hidden="true">·</span>
          <span>{{ searching ? `匹配「${search.trim()}」` : `按${sortLabel}排序` }}</span>
        </template>
      </div>
      <div v-if="!loading && !error && plugins.length" class="market__columns" aria-hidden="true"><span>插件</span><span>收藏 / 下载</span><span>操作</span></div>
      <div class="market__results">
        <AsyncState
          :loading="loading"
          :error="error"
          :empty="!plugins.length"
          :skeleton-count="6"
          skeleton="row"
          :empty-title="searching ? '没有找到匹配的插件' : '暂无已上架插件'"
          :empty-text="searching ? '换个关键词试试。' : '上传 IPK 或提交 GitHub 仓库，人工审核通过后在这里展示。'"
          @retry="load"
        >
          <div class="list">
            <PluginRow v-for="plugin in plugins" :key="plugin.id" :plugin="plugin" />
          </div>
          <template #empty>
            <RouterLink v-if="!searching" to="/submit" class="btn btn--signal" style="margin-top: var(--sp-2)">提交插件</RouterLink>
            <button v-else type="button" class="btn btn--raised" style="margin-top: var(--sp-2)" @click="search = ''">清空搜索</button>
          </template>
        </AsyncState>
      </div>

      <AppPagination v-if="!loading && !error && pages > 1" v-model="page" :total-pages="pages" :total="total" />
    </section>
  </div>
</template>

<style scoped>
.market { padding-top: 32px; padding-bottom: 48px; }
.market__head { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 24px; }
.market__head p { color: var(--text-3); font-size: var(--fs-sm); margin-top: 6px; }
.market__catalog { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-group); overflow: hidden; }
.market__toolbar { display: flex; align-items: center; gap: 20px; padding: 16px 20px; }
.market__search { flex: 1; min-width: 0; max-width: 28rem; }
.market__sort { display: flex; align-items: center; gap: var(--sp-3); margin-inline-start: auto; }
.market__sort label { font-size: var(--fs-sm); color: var(--text-3); white-space: nowrap; }
.market__sort .select { width: auto; min-width: 9rem; height: 44px; font-size: var(--fs-sm); }
.market__result-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 0 20px 16px; font-size: var(--fs-cap); color: var(--text-3); }
.market__columns { display: grid; grid-template-columns: minmax(0,1fr) 130px 152px; gap: 20px; padding: 10px 20px; border-top: 1px solid var(--line); background: var(--surface-raised); color: var(--text-3); font-size: var(--fs-cap); }
.market__columns span:last-child { text-align: right; }
.market__results :deep(.list) { border-top: 0; }
.market__results :deep(.pkg:last-child) { border-bottom: 0; }
.market__results :deep(.pkg) { padding: 20px; }
.market__results { min-height: 300px; }
@media (max-width: 640px) {
  .market { padding-top: 24px; }
  .market__head { align-items: flex-start; }
  .market__head .btn { padding-inline: 12px; }
  .market__columns { display: none; }
  .market__toolbar { flex-wrap: wrap; gap: var(--sp-3); }
  .market__search { flex-basis: 100%; max-width: none; }
  .market__sort { width: 100%; justify-content: space-between; }
  .market__sort .select { min-width: 10rem; height: 44px; }
}
</style>
