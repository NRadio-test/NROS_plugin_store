<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api, errorMessage, post, put, type DownloadSource, type SourceCandidate } from '../lib/api'
import { formatSize } from '../lib/format'
import { toast } from '../lib/toast'
import AsyncState from './AsyncState.vue'
import AppIcon from './AppIcon.vue'
import AppBadge from './AppBadge.vue'
import AppButton from './AppButton.vue'
import AppField from './AppField.vue'

const sources = ref<DownloadSource[]>([])
const candidates = ref<SourceCandidate[]>([])
const loading = ref(true)
const error = ref('')
const busy = ref('')
const feedback = ref<{ ok: boolean; message: string } | null>(null)

const targetPlugin = ref('')
const targetAsset = ref('')

const selectedPlugin = computed(() => candidates.value.find(item => item.pluginId === targetPlugin.value) || null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [list, options] = await Promise.all([
      api<{ items: DownloadSource[] }>('/api/studio/sources'),
      api<{ items: SourceCandidate[] }>('/api/studio/sources/candidates'),
    ])
    sources.value = list.items
    candidates.value = options.items
    if (!candidates.value.some(item => item.pluginId === targetPlugin.value)) {
      targetPlugin.value = candidates.value[0]?.pluginId || ''
    }
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    loading.value = false
  }
}

watch(selectedPlugin, plugin => {
  targetAsset.value = plugin?.assets.find(asset => !asset.disabled)?.id ? String(plugin.assets.find(asset => !asset.disabled)!.id) : ''
})

function addSource() {
  sources.value.push({
    id: `source-${Math.random().toString(36).slice(2, 8)}`,
    name: '第三方镜像',
    template: '',
    allowedHosts: [],
    enabled: false,
    trusted: false,
    priority: 10,
    timeoutMs: 15000,
  })
}

function setHosts(source: DownloadSource, event: Event) {
  source.allowedHosts = (event.target as HTMLInputElement).value.split(',').map(value => value.trim()).filter(Boolean)
}

async function save() {
  busy.value = 'save'
  feedback.value = null
  try {
    await put('/api/studio/sources', { items: sources.value })
    feedback.value = { ok: true, message: '下载源已保存。' }
    await load()
  } catch (caught) {
    feedback.value = { ok: false, message: errorMessage(caught) }
    toast.error('保存未生效', errorMessage(caught))
  } finally {
    busy.value = ''
  }
}

async function test(id: string) {
  if (!targetPlugin.value || !targetAsset.value) {
    feedback.value = { ok: false, message: '请先选择一个已上架插件及其附件作为测试目标。' }
    return
  }
  busy.value = id
  feedback.value = null
  try {
    const result = await post<{ ok: boolean; message: string }>(`/api/studio/sources/${encodeURIComponent(id)}/test`, {
      pluginId: targetPlugin.value,
      assetId: targetAsset.value,
    })
    feedback.value = { ok: result.ok, message: `测试通过：${result.message}` }
    await load()
  } catch (caught) {
    feedback.value = { ok: false, message: `测试失败：${errorMessage(caught)}` }
  } finally {
    busy.value = ''
  }
}

function remove(index: number) {
  sources.value.splice(index, 1)
}

onMounted(load)
</script>

<template>
  <section class="src">
    <header class="src__head">
      <div>
        <h2 class="src__title">下载源设置</h2>
        <p class="src__desc">
          默认只启用 GitHub 官方源。第三方源需先停用测试，再信任并启用。
        </p>
      </div>
      <div class="row gap-2">
        <AppButton icon="plus" @click="addSource">添加下载源</AppButton>
        <AppButton variant="primary" icon="check" :loading="busy === 'save'" @click="save">保存全部</AppButton>
      </div>
    </header>

    <AsyncState :loading="loading" :error="error" skeleton="row" :skeleton-count="4" @retry="load">
      <article class="card src__target">
        <header class="card__head">
          <div>
            <p class="card__title">测试目标</p>
          </div>
          <AppBadge variant="neutral"><AppIcon name="hash" :size="12" />{{ candidates.length }} 个已上架插件</AppBadge>
        </header>
        <div class="card__body form-grid">
          <AppField label="已上架插件" for-id="source-target-plugin">
            <select id="source-target-plugin" v-model="targetPlugin" class="select">
              <option value="">请选择插件</option>
              <option v-for="item in candidates" :key="item.pluginId" :value="item.pluginId">
                {{ item.fullName }}{{ item.version ? ` · ${item.version}` : '' }}
              </option>
            </select>
          </AppField>
          <AppField label="安装包附件" for-id="source-target-asset">
            <select id="source-target-asset" v-model="targetAsset" class="select">
              <option value="">请选择附件</option>
              <option v-for="asset in selectedPlugin?.assets || []" :key="asset.id" :value="String(asset.id)">
                {{ asset.name }} · {{ formatSize(asset.size) }}{{ asset.disabled ? '（已停用）' : '' }}
              </option>
            </select>
          </AppField>
        </div>
        <div v-if="!candidates.length" class="card__body src__empty">
          <AppIcon name="info" :size="15" />没有已上架的插件，无法测试。
        </div>
      </article>

      <div class="src__list">
        <article v-for="(source, index) in sources" :key="source.id" class="card src__card">
          <header class="src__card-head">
            <div class="src__card-ident">
              <span class="src__card-icon" :class="source.id === 'github' && 'src__card-icon--official'">
                <AppIcon :name="source.id === 'github' ? 'github' : 'layers'" :size="17" />
              </span>
              <div>
                <p class="src__card-name">{{ source.name }}</p>
                <p class="src__card-sub">
                  <span class="mono">{{ source.id }}</span>
                  <span aria-hidden="true">·</span>
                  <span>优先级 {{ source.priority }}</span>
                  <span aria-hidden="true">·</span>
                  <span>超时 {{ source.timeoutMs }} ms</span>
                </p>
              </div>
            </div>
            <div class="src__card-badges">
              <AppBadge v-if="source.id === 'github'" variant="brand">官方源</AppBadge>
              <AppBadge :variant="source.enabled ? 'success' : 'neutral'" dot>{{ source.enabled ? '已启用' : '已停用' }}</AppBadge>
              <AppBadge :variant="source.trusted ? 'info' : 'warning'">{{ source.trusted ? '已信任' : '未信任' }}</AppBadge>
            </div>
          </header>

          <div class="card__body">
            <div class="form-grid">
              <AppField :label="`名称`" :for-id="`source-name-${index}`" required>
                <input :id="`source-name-${index}`" v-model="source.name" class="input" required maxlength="80" :readonly="source.id === 'github'" />
              </AppField>
              <AppField label="优先级" :for-id="`source-priority-${index}`" required hint="数字越小越先尝试。">
                <input :id="`source-priority-${index}`" v-model.number="source.priority" class="input" type="number" min="0" max="100" required />
              </AppField>
              <div class="full">
                <AppField
                  label="HTTPS 地址规则"
                  :for-id="`source-template-${index}`"
                  required
                  hint="支持 {owner}、{repo}、{assetId}、{releaseId}、{tag}、{filename}，必须包含固定的 {assetId}。"
                >
                  <input
                    :id="`source-template-${index}`"
                    v-model="source.template"
                    class="input mono"
                    :readonly="source.id === 'github'"
                    required
                    placeholder="https://mirror.example.com/assets/{assetId}/{filename}"
                  />
                </AppField>
              </div>
              <AppField label="允许主机" :for-id="`source-hosts-${index}`" required hint="英文逗号分隔。">
                <input
                  :id="`source-hosts-${index}`"
                  class="input mono"
                  :readonly="source.id === 'github'"
                  :value="source.allowedHosts.join(', ')"
                  required
                  placeholder="github.com, release-assets.githubusercontent.com"
                  @input="setHosts(source, $event)"
                />
              </AppField>
              <AppField label="超时（毫秒）" :for-id="`source-timeout-${index}`" required>
                <input :id="`source-timeout-${index}`" v-model.number="source.timeoutMs" class="input" type="number" min="1000" max="60000" required />
              </AppField>
            </div>

            <div class="src__card-actions">
              <label class="switch">
                <input v-model="source.trusted" type="checkbox" :disabled="source.id === 'github'" />
                <span class="switch__track" aria-hidden="true" />
                <span>我信任此来源</span>
              </label>
              <label class="switch">
                <input v-model="source.enabled" type="checkbox" />
                <span class="switch__track" aria-hidden="true" />
                <span>启用</span>
              </label>
              <span class="grow" />
              <AppButton size="sm" icon="zap" :loading="busy === source.id" @click="test(source.id)">测试已保存源</AppButton>
              <AppButton v-if="source.id !== 'github'" size="sm" variant="danger" icon="trash" @click="remove(index)">移除</AppButton>
            </div>

            <p v-if="source.id !== 'github' && source.enabled && !source.trusted" class="field__hint field__hint--error" style="margin-top: 10px">
              第三方源必须显式信任后才能启用。
            </p>
          </div>
        </article>
      </div>

      <div v-if="feedback" class="notice" :class="feedback.ok ? 'notice--success' : 'notice--danger'" role="status">
        <AppIcon :name="feedback.ok ? 'check-circle' : 'alert-circle'" :size="16" />
        <span>{{ feedback.message }}</span>
      </div>

      <div class="notice">
        <AppIcon name="info" :size="16" />
        <span>
          
        </span>
      </div>
    </AsyncState>
  </section>
</template>

<style scoped>
.src { display: flex; flex-direction: column; gap: 16px; }
.src__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.src__title { font-size: var(--fs-h2); }
.src__desc { margin-top: 5px; max-width: 92ch; font-size: var(--fs-sm); color: var(--text-3); line-height: 1.65; }
.src__target { margin-bottom: 16px; }
.src__empty { display: flex; align-items: center; gap: 8px; color: var(--text-3); font-size: var(--fs-sm); }
.src__list { display: flex; flex-direction: column; gap: 14px; }
.src__card-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.src__card-ident { display: flex; align-items: center; gap: 12px; }
.src__card-icon { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--r-control); background: var(--surface-raised); color: var(--text-2); }
.src__card-icon--official { background: var(--signal-surface); color: var(--signal-text); }
.src__card-name { font-size: var(--fs-body); font-weight: 650; }
.src__card-sub { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: var(--fs-cap); color: var(--text-3); flex-wrap: wrap; }
.src__card-badges { display: flex; gap: 8px; flex-wrap: wrap; }
.src__card-actions { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }

@media (max-width: 767px) {
  .src__card-actions { gap: 12px; }
  .src__card-actions .grow { display: none; }
}
</style>
