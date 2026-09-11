<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, errorMessage, session, type Plugin } from '../lib/api'
import { formatNumber } from '../lib/format'
import SearchToolbar from '../components/SearchToolbar.vue'
import AppPagination from '../components/AppPagination.vue'
import PluginCard from '../components/PluginCard.vue'
import AsyncState from '../components/AsyncState.vue'
import AppIcon from '../components/AppIcon.vue'

type SortKey = 'updated' | 'favorites' | 'downloads'

const route = useRoute()
const router = useRouter()

const SORTS: Array<{ key: SortKey; label: string; icon: 'history' | 'heart' | 'download' }> = [
  { key: 'updated', label: '最近更新', icon: 'history' },
  { key: 'favorites', label: '最受欢迎', icon: 'heart' },
  { key: 'downloads', label: '下载最多', icon: 'download' },
]

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

const heroFacts = [
  { icon: 'git-branch' as const, title: '只收 GitHub 正式 Release', text: '安装包来自作者仓库的正式发布，不用源码压缩包替代。' },
  { icon: 'shield-check' as const, title: '上架前自动静态审核', text: '读取 README 与源码快照，静态解析 IPK 之后才允许公开下载。' },
  { icon: 'zap' as const, title: '直连官方源转发下载', text: '由商店核验资产身份后流式转发到本地，不保存安装包副本。' },
]

async function load() {
  const current = ++sequence
  loading.value = true
  error.value = ''
  try {
    const query = new URLSearchParams({ q: search.value.trim(), page: String(page.value), sort: sort.value })
    const data = await api<{ items: Plugin[]; total: number; pageSize: number; sort?: string }>(`/api/plugins?${query}`)
    if (current === sequence) {
      plugins.value = data.items
      total.value = data.total
      pageSize.value = data.pageSize
      if (data.sort) sort.value = readSort(data.sort)
    }
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
  <div>
    <section class="hero">
      <div class="hero__glow" aria-hidden="true" />
      <div class="hero__grid" aria-hidden="true" />
      <div class="container hero__inner">
        <p class="eyebrow"><AppIcon name="sparkles" :size="14" />张导的开放插件目录</p>
        <h1 class="hero__title">
          找到需要的插件，<br />
          <span class="hero__title-accent">从可信来源开始。</span>
        </h1>
        <p class="hero__lead">
          浏览作者写在 GitHub 仓库里的真实说明，选择与你设备架构匹配的 IPK。
          商店不代写内容、不代作者构建，只把通过自动静态审核的正式 Release 安装包转发到本地。
        </p>

        <div class="hero__search">
          <SearchToolbar v-model:search-query="search" v-model:current-page="page" size="lg" />
          <p class="hero__hint">
            <template v-if="loading">正在读取插件目录…</template>
            <template v-else-if="searching">在名称与描述中匹配「{{ search.trim() }}」，共 {{ total }} 个结果</template>
            <template v-else>当前目录收录 {{ formatNumber(total) }} 个已上架插件，按最近更新排序</template>
          </p>
        </div>

        <ul class="hero__facts">
          <li v-for="fact in heroFacts" :key="fact.title" class="fact">
            <span class="fact__icon"><AppIcon :name="fact.icon" :size="17" /></span>
            <span class="fact__body">
              <span class="fact__title">{{ fact.title }}</span>
              <span class="fact__text">{{ fact.text }}</span>
            </span>
          </li>
        </ul>
      </div>
    </section>

    <section class="container market" aria-label="插件目录">
      <header class="market__bar">
        <div class="market__heading">
          <h2>{{ searching ? '搜索结果' : '全部插件' }}</h2>
          <span class="market__meta">
            <span v-if="loading" class="market__loading"><span class="spinner" />正在获取目录</span>
            <template v-else>{{ total }} 个插件<span v-if="pages > 1"> · 第 {{ page }} / {{ pages }} 页</span></template>
          </span>
        </div>
        <div class="segmented" role="group" aria-label="排序方式">
          <button
            v-for="item in SORTS"
            :key="item.key"
            type="button"
            class="segmented__item"
            :aria-pressed="sort === item.key"
            @click="sort = item.key; page = 1"
          >
            <AppIcon :name="item.icon" :size="14" />{{ item.label }}
          </button>
        </div>
      </header>

      <AsyncState
        :loading="loading"
        :error="error"
        :empty="!plugins.length"
        :skeleton-count="6"
        :empty-title="searching ? '没有找到匹配的插件' : '插件目录等待第一份发布'"
        :empty-text="searching ? '试试更短的关键词，或清空搜索浏览全部插件。' : '提交公开 GitHub 仓库，正式 Release 中的 IPK 通过自动审核后会出现在这里。'"
        @retry="load"
      >
        <div class="plugin-grid">
          <PluginCard v-for="plugin in plugins" :key="plugin.id" :plugin="plugin" />
        </div>
        <template #empty>
          <RouterLink v-if="!searching" to="/submit" class="btn btn--primary" style="margin-top: 10px">
            <AppIcon name="upload" :size="16" />提交第一个仓库
          </RouterLink>
          <button v-else type="button" class="btn btn--secondary" style="margin-top: 10px" @click="search = ''">
            <AppIcon name="x" :size="16" />清空搜索条件
          </button>
        </template>
      </AsyncState>

      <div v-if="!loading && !error && pages > 1" class="market__pager">
        <AppPagination v-model="page" :total-pages="pages" :total="total" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero { position: relative; overflow: hidden; border-bottom: 1px solid var(--border-base); }
.hero__glow { position: absolute; inset: 0; background: var(--hero-gradient); pointer-events: none; }
.hero__grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(120% 80% at 50% 0%, #000 20%, transparent 75%);
  pointer-events: none;
}
.hero__inner { position: relative; padding: 72px 0 56px; max-width: 940px; }
.hero__title { margin-top: 18px; font-size: var(--text-display); font-weight: 700; letter-spacing: -0.038em; line-height: 1.08; }
.hero__title-accent {
  background: var(--brand-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.hero__lead { margin-top: 18px; max-width: 62ch; font-size: 1.0625rem; line-height: 1.75; color: var(--text-secondary); }
.hero__search { margin-top: 30px; max-width: 640px; }
.hero__hint { margin-top: 10px; font-size: var(--text-small); color: var(--text-tertiary); }

.hero__facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 44px;
  list-style: none;
}
.fact { display: flex; gap: 11px; padding: 15px; border: 1px solid var(--border-base); border-radius: var(--r-md); background: var(--bg-card); box-shadow: var(--shadow-xs); }
.fact__icon { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; border-radius: var(--r-sm); background: var(--primary-surface); color: var(--primary-text); }
.fact__body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.fact__title { font-size: var(--text-body); font-weight: 640; letter-spacing: -0.01em; }
.fact__text { font-size: var(--text-small); color: var(--text-tertiary); line-height: 1.6; }

.market { padding-top: 40px; }
.market__bar { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; flex-wrap: wrap; margin-bottom: 22px; }
.market__heading { display: flex; flex-direction: column; gap: 4px; }
.market__heading h2 { font-size: 1.25rem; }
.market__meta { font-size: var(--text-small); color: var(--text-tertiary); }
.market__loading { display: inline-flex; align-items: center; gap: 8px; }
.market__loading .spinner { width: 13px; height: 13px; border-width: 2px; }
.plugin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 18px; }
.market__pager { margin-top: 34px; }

@media (max-width: 1000px) {
  .hero__facts { grid-template-columns: 1fr; gap: 12px; }
  .hero__inner { padding: 52px 0 44px; }
}
@media (max-width: 767px) {
  .hero__inner { padding: 38px 0 32px; }
  .hero__lead { font-size: var(--text-body); }
  .hero__facts { margin-top: 30px; }
  .market { padding-top: 28px; }
  .market__bar { align-items: stretch; }
  .market__bar .segmented { width: 100%; overflow-x: auto; }
  .plugin-grid { grid-template-columns: 1fr; gap: 14px; }
}
</style>
