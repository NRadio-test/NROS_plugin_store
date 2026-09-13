<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, errorMessage, session, type Plugin } from '../lib/api'
import { formatNumber } from '../lib/format'
import SearchToolbar from '../components/SearchToolbar.vue'
import AppPagination from '../components/AppPagination.vue'
import PluginRow from '../components/PluginRow.vue'
import AsyncState from '../components/AsyncState.vue'

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
    <div class="page-head">
      <h1>插件市场</h1>
      <p class="muted">收录通过自动审核的 IPK 安装包。</p>
      <p class="page-head__meta">
        <template v-if="loading">加载中…</template>
        <template v-else-if="error">加载失败。</template>
        <template v-else>
          <span>共 <b class="num">{{ formatNumber(total) }}</b> 个插件</span>
          <span aria-hidden="true">·</span>
          <span>{{ searching ? `匹配「${search.trim()}」` : `按${sortLabel}排序` }}</span>
        </template>
      </p>
    </div>

    <div class="market__toolbar">
      <div class="market__search">
        <SearchToolbar v-model:search-query="search" v-model:current-page="page" />
      </div>
      <div class="market__sort">
        <label for="market-sort">排序</label>
        <select id="market-sort" v-model="sort" class="select" @change="page = 1">
          <option v-for="item in SORTS" :key="item.key" :value="item.key">{{ item.label }}</option>
        </select>
      </div>
    </div>

    <div class="market__results" aria-label="插件目录">
      <AsyncState
        :loading="loading"
        :error="error"
        :empty="!plugins.length"
        :skeleton-count="6"
        skeleton="row"
        :empty-title="searching ? '没有找到匹配的插件' : '插件目录等待第一份发布'"
        :empty-text="searching ? '换个关键词试试。' : '提交公开 GitHub 仓库即可收录。'"
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
  </div>
</template>

<style scoped>
.market__toolbar { display: flex; align-items: center; gap: var(--sp-5); padding-bottom: var(--sp-5); }
.market__search { flex: 1; min-width: 0; max-width: 38rem; }
.market__sort { display: flex; align-items: center; gap: var(--sp-3); margin-inline-start: auto; }
.market__sort label { font-size: var(--fs-sm); color: var(--text-3); white-space: nowrap; }
.market__sort .select { width: auto; min-width: 9rem; height: 48px; }
.market__results { min-height: 300px; }
@media (max-width: 640px) {
  .market__toolbar { flex-wrap: wrap; gap: var(--sp-3); }
  .market__search { flex-basis: 100%; max-width: none; }
  .market__sort { width: 100%; justify-content: space-between; }
  .market__sort .select { min-width: 10rem; height: 44px; }
}
</style>
