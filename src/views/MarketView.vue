<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, errorMessage, session, type Plugin } from '../lib/api'
import { formatNumber, formatRelative } from '../lib/format'
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
const syncedAt = ref<number | null>(null)

let sequence = 0
let timer: ReturnType<typeof setTimeout>
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const searching = computed(() => search.value.trim().length > 0)

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
    syncedAt.value = Date.now()
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
  <div class="wrap">
    <div class="page-head">
      <h1>插件市场</h1>
      <p class="muted">收录通过自动静态审核的 IPK 安装包，源码与 Release 由作者维护在 GitHub。</p>
      <p class="page-head__meta">
        <template v-if="loading">正在读取插件目录…</template>
        <template v-else>
          <span>共 <b class="num">{{ formatNumber(total) }}</b> 个插件</span>
          <span aria-hidden="true">·</span>
          <span>{{ searching ? `匹配「${search.trim()}」` : '按最近更新排序' }}</span>
          <template v-if="syncedAt"><span aria-hidden="true">·</span><span>最近同步 {{ formatRelative(syncedAt) }}</span></template>
        </template>
      </p>
    </div>

    <div class="toolbar">
      <div class="grow">
        <SearchToolbar v-model:search-query="search" v-model:current-page="page" />
      </div>
      <div class="toolbar__end">
        <label class="sr-only" for="market-sort">排序方式</label>
        <select id="market-sort" v-model="sort" class="select" @change="page = 1">
          <option v-for="item in SORTS" :key="item.key" :value="item.key">{{ item.label }}</option>
        </select>
      </div>
    </div>

    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!plugins.length"
      :skeleton-count="6"
      :empty-title="searching ? '没有找到匹配的插件' : '插件目录等待第一份发布'"
      :empty-text="searching ? '试试更短的关键词，或清空搜索浏览全部插件。' : '提交公开 GitHub 仓库，正式 Release 中的 IPK 通过自动审核后会出现在这里。'"
      @retry="load"
    >
      <div class="list" style="margin-top: var(--sp-5)">
        <PluginRow v-for="plugin in plugins" :key="plugin.id" :plugin="plugin" />
      </div>
      <template #empty>
        <RouterLink v-if="!searching" to="/submit" class="btn btn--signal" style="margin-top: var(--sp-2)">提交插件</RouterLink>
        <button v-else type="button" class="btn btn--raised" style="margin-top: var(--sp-2)" @click="search = ''">清空搜索条件</button>
      </template>
    </AsyncState>

    <AppPagination v-if="!loading && !error && pages > 1" v-model="page" :total-pages="pages" :total="total" />
  </div>
</template>
