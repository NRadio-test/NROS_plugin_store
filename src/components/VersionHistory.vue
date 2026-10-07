<script setup lang="ts">
import { ref, watch } from 'vue'
import { api, errorMessage, type VersionPage } from '../lib/api'
import { downloadAsset } from '../lib/download'
import { formatDateTime, formatSize } from '../lib/format'
import { toast } from '../lib/toast'
import AppButton from './AppButton.vue'
import AppPagination from './AppPagination.vue'
import AsyncState from './AsyncState.vue'

const props = defineProps<{ pluginId: string }>()
const page = ref(1)
const data = ref<VersionPage | null>(null)
const loading = ref(true)
const error = ref('')
const busy = ref(new Set<string>())
let requestId = 0

async function load() {
  const current = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await api<VersionPage>(`/api/plugins/${encodeURIComponent(props.pluginId)}/versions?page=${page.value}`)
    if (current === requestId) data.value = result
  } catch (caught) {
    if (current === requestId) error.value = errorMessage(caught)
  } finally {
    if (current === requestId) loading.value = false
  }
}
async function download(versionId: string, assetId: string, name: string) {
  const key = `${versionId}:${assetId}`
  busy.value.add(key)
  try {
    await downloadAsset(props.pluginId, String(assetId), versionId)
    toast.success('已开始下载', name)
  } catch (caught) { toast.error('下载未开始', errorMessage(caught)) }
  finally { busy.value.delete(key) }
}
watch(() => props.pluginId, () => { data.value = null; page.value = 1 }, { flush: 'sync' })
watch([() => props.pluginId, page], load, { immediate: true })
</script>

<template>
  <AsyncState :loading="loading" :error="error" :empty="!data?.items.length" empty-title="暂无历史版本" skeleton="row" :skeleton-count="2" @retry="load">
    <div class="versions">
      <article v-for="version in data?.items" :key="version.id" class="version">
        <header class="version__head">
          <h2>{{ version.version || '未标注版本' }}</h2>
          <time>{{ formatDateTime(version.publishedAt) }}</time>
        </header>
        <ul class="version__files">
          <li v-for="asset in version.assets" :key="asset.id" class="version-file">
            <div class="version-file__info">
              <h3>{{ asset.name }}</h3>
              <p class="version-file__meta"><span v-if="asset.architecture">{{ asset.architecture }}</span><span>{{ formatSize(asset.size) }}</span></p>
            </div>
            <AppButton v-if="asset.available" icon="download" size="sm" :aria-label="`下载 ${asset.name}（${version.version}）`" :loading="busy.has(`${version.id}:${asset.id}`)" @click="download(version.id, asset.id, asset.name)">下载</AppButton>
            <span v-else class="version-file__unavailable">文件已不可用</span>
          </li>
        </ul>
        <p v-if="!version.assets.length" class="muted small">文件已不可用</p>
      </article>
    </div>
    <AppPagination v-if="data && data.total > data.pageSize" v-model="page" :total="data.total" :total-pages="Math.ceil(data.total / data.pageSize)" />
  </AsyncState>
</template>

<style scoped>
.versions { min-width: 0; }
.version + .version { border-top: 1px solid var(--line); margin-top: 24px; padding-top: 24px; }
.version__head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 20px; margin-bottom: 16px; }
.version__head h2 { font-size: var(--fs-h3); font-family: var(--font-mono); overflow-wrap: anywhere; min-width: 0; }
.version__head time { font-size: var(--fs-sm); color: var(--text-3); }
.version__files { list-style: none; padding: 0; margin: 0; }
.version-file { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 16px 24px; }
.version-file + .version-file { margin-top: 20px; }
.version-file__info { min-width: 0; }
.version-file h3 { font-size: var(--fs-sm); font-weight: 600; overflow-wrap: anywhere; line-height: 1.6; }
.version-file__meta { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: var(--fs-cap); color: var(--text-3); margin-top: 6px; overflow-wrap: anywhere; }
.version-file__meta span { min-width: 0; }
.version-file__unavailable { font-size: var(--fs-sm); color: var(--text-3); }
@media (max-width: 560px) {
  .version-file { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .version-file > .btn { justify-self: start; }
}
</style>
