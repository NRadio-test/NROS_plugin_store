<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, errorMessage, put, session, type Detail } from '../lib/api'
import { renderReadme } from '../lib/readme'
import { downloadAsset } from '../lib/download'
import { setMetadata } from '../router'
import { formatDateTime, formatNumber, formatSize, shortHash } from '../lib/format'
import { toast } from '../lib/toast'
import AsyncState from '../components/AsyncState.vue'
import AppIcon from '../components/AppIcon.vue'
import AppBadge from '../components/AppBadge.vue'
import AppButton from '../components/AppButton.vue'
import MonogramAvatar from '../components/MonogramAvatar.vue'
import { navigateTabs } from '../composables/tabs'
import CopyButton from '../components/CopyButton.vue'

type TabKey = 'readme' | 'packages' | 'review'

const route = useRoute()
const router = useRouter()
const detail = ref<Detail | null>(null)
const loading = ref(true)
const error = ref('')
const busy = ref('')
const tab = ref<TabKey>('readme')

const uploaded = computed(() => detail.value?.plugin.source_kind === 'upload')
const owner = computed(() => detail.value?.plugin.full_name.split('/')[0] || '')
const name = computed(() => detail.value?.plugin.full_name.split('/').at(-1) || '')
const readmeHtml = computed(() =>
  detail.value?.readme ? renderReadme(detail.value.readme, detail.value.plugin.full_name, detail.value.readmeCommit, detail.value.readmePath, uploaded.value) : '',
)
const TABS: Array<{ key: TabKey; label: string; icon: 'book' | 'package' | 'shield-check' }> = [
  { key: 'readme', label: '说明文档', icon: 'book' },
  { key: 'packages', label: '安装包与校验', icon: 'package' },
  { key: 'review', label: '审核信息', icon: 'shield-check' },
]

async function load() {
  loading.value = true
  error.value = ''
  try {
    detail.value = await api<Detail>(`/api/plugins/${encodeURIComponent(String(route.params.id))}`)
    setMetadata(detail.value.plugin.full_name, detail.value.plugin.description || '查看仓库说明与安装包。')
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    loading.value = false
  }
}

async function favorite() {
  if (!session.user) {
    await router.push({ path: '/login', query: { next: route.fullPath } })
    return
  }
  busy.value = 'favorite'
  try {
    const result = await put<{ favorite_count: number; favorited: boolean }>(`/api/plugins/${detail.value!.plugin.id}/favorite`, { active: !detail.value!.plugin.favorited })
    Object.assign(detail.value!.plugin, result)
    toast.success(result.favorited ? '已加入收藏' : '已取消收藏', detail.value!.plugin.full_name)
  } catch (caught) {
    toast.error('收藏未生效', errorMessage(caught))
  } finally {
    busy.value = ''
  }
}

async function download(assetId: string, assetName: string) {
  busy.value = assetId
  try {
    await downloadAsset(detail.value!.plugin.id, assetId)
    toast.success('已开始下载', assetName)
  } catch (caught) {
    toast.error('下载未开始', errorMessage(caught))
  } finally {
    busy.value = ''
  }
}

/** 只滚动到下载卡片，不切换标签页，保证 README 始终可见。 */
function scrollToDownloads() {
  requestAnimationFrame(() => document.getElementById('downloads')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }))
}

watch(() => route.params.id, load, { immediate: true })
watch(() => route.hash, hash => { if (hash === '#downloads') scrollToDownloads() })
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <!-- 仅渲染 lib/readme.ts 经过 DOMPurify 与 URL 允许列表处理的结果。 -->
  <div class="detail">
    <div class="container">
      <AsyncState :loading="loading" :error="error" skeleton="row" :skeleton-count="6" @retry="load">
        <template v-if="detail">
          <nav class="breadcrumb detail__crumbs" aria-label="面包屑">
            <RouterLink to="/"><AppIcon name="compass" :size="14" />插件市场</RouterLink>
            <AppIcon name="chevron-right" :size="13" />
            <span>{{ uploaded ? '直接上传' : owner }}</span>
            <AppIcon name="chevron-right" :size="13" />
            <span class="breadcrumb__current">{{ name }}</span>
          </nav>

          <header class="detail-hero">
            <div class="detail-hero__ident">
              <MonogramAvatar :name="owner" size="lg" />
              <div class="detail-hero__text">
                <h1>{{ name }}</h1>
                <p class="detail-hero__owner">
                  <AppIcon :name="uploaded ? 'upload' : 'git-branch'" :size="14" />{{ uploaded ? '直接上传 IPK' : detail.plugin.full_name }}
                </p>
                <p class="detail-hero__desc">{{ detail.plugin.description || '暂无描述' }}</p>
              </div>
            </div>

            <div class="detail-hero__actions">
              <AppButton v-if="!uploaded" :href="`https://github.com/${detail.plugin.full_name}`" icon="github" icon-right="external-link">GitHub 仓库</AppButton>
              <AppButton
                :variant="detail.plugin.favorited ? 'soft' : 'secondary'"
                :icon="detail.plugin.favorited ? 'heart-filled' : 'heart'"
                :loading="busy === 'favorite'"
                :aria-pressed="!!detail.plugin.favorited"
                @click="favorite"
              >
                {{ detail.plugin.favorited ? '已收藏' : '收藏' }}
              </AppButton>
            </div>

            <dl class="detail-hero__stats">
              <div class="stat">
                <dt class="stat__label">版本</dt>
                <dd class="stat__value">{{ detail.plugin.version || '—' }}</dd>
              </div>
              <div class="stat">
                <dt class="stat__label">收藏</dt>
                <dd class="stat__value">{{ formatNumber(detail.plugin.favorite_count) }}</dd>
              </div>
              <div class="stat">
                <dt class="stat__label">下载</dt>
                <dd class="stat__value">{{ formatNumber(detail.plugin.download_count) }}</dd>
              </div>
              <div class="stat">
                <dt class="stat__label">许可证</dt>
                <dd class="stat__value stat__value--text">{{ detail.license || '—' }}</dd>
              </div>
            </dl>
          </header>

          <div class="detail-layout">
            <div class="detail-main">
              <div class="tabs detail__tabs" role="tablist" aria-label="插件详情分区" @keydown="navigateTabs">
                <button
                  v-for="item in TABS"
                  :id="`detail-tab-${item.key}`"
                  :key="item.key"
                  type="button"
                  role="tab"
                  class="tabs__item"
                  :aria-selected="tab === item.key"
                  :tabindex="tab === item.key ? 0 : -1" :aria-controls="`detail-panel-${item.key}`"
                  :aria-current="tab === item.key ? 'page' : undefined"
                  @click="tab = item.key"
                >
                  <AppIcon :name="item.icon" :size="15" />{{ item.label }}
                </button>
              </div>

              <section v-if="tab === 'readme'" :id="`detail-panel-${tab}`" class="card detail__panel" role="tabpanel" :aria-labelledby="`detail-tab-${tab}`">
                <header class="detail__panel-head">
                  <div>
                    <p class="detail__panel-title">{{ uploaded ? '使用教程' : '仓库 README' }}</p>
                    <p v-if="!uploaded" class="detail__panel-sub">
                      <AppIcon name="file-text" :size="13" />{{ detail.readmePath || '未找到 README' }}
                      <span class="detail__panel-dot" aria-hidden="true">·</span>commit {{ shortHash(detail.readmeCommit) }}
                    </p>
                  </div>
                  <div v-if="!uploaded" class="row gap-2">
                    <CopyButton v-if="detail.readmeCommit" :value="detail.readmeCommit" label="已复制 README commit" />
                    <AppButton
                      :href="`https://github.com/${detail.plugin.full_name}/blob/${detail.readmeCommit}/${detail.readmePath}`"
                      size="sm"
                      variant="ghost"
                      icon-right="external-link"
                    >
                      在 GitHub 查看
                    </AppButton>
                  </div>
                </header>
                <div v-if="readmeHtml" class="readme detail__readme" data-testid="readme" v-html="readmeHtml" />
                <p v-else class="detail__missing">
                  <AppIcon name="alert-circle" :size="16" />{{ uploaded ? '暂无使用教程。' : '仓库没有 README。' }}
                </p>
                <p class="detail__footnote">
                  {{ uploaded ? '提交者填写的内容，外部站点的图片不会加载。' : '作者原文快照，外部站点的图片不会加载。' }}
                </p>
              </section>

              <section v-else-if="tab === 'packages'" :id="`detail-panel-${tab}`" class="card detail__panel" role="tabpanel" :aria-labelledby="`detail-tab-${tab}`">
                <header class="detail__panel-head">
                  <div>
                    <p class="detail__panel-title">安装包与校验</p>
                  </div>
                </header>
                <div class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th scope="col">文件名</th>
                        <th scope="col">包名 / 架构</th>
                        <th scope="col">大小</th>
                        <th scope="col">SHA-256</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="asset in detail.assets" :key="asset.id">
                        <td class="table__primary">{{ asset.name }}</td>
                        <td>
                          <span class="mono small">{{ asset.packageName || '—' }}</span>
                          <span class="detail__panel-dot" aria-hidden="true">·</span>
                          <span class="small muted">{{ asset.architecture || '—' }}</span>
                        </td>
                        <td class="tnum">{{ formatSize(asset.size) }}</td>
                        <td>
                          <span class="row gap-1">
                            <code class="small">{{ shortHash(asset.sha256, 16) }}</code>
                            <CopyButton v-if="asset.sha256" :value="asset.sha256" label="已复制 SHA-256" :size="15" />
                          </span>
                        </td>
                      </tr>
                      <tr v-if="!detail.assets.length">
                        <td colspan="4" class="muted">暂无可下载的附件。</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p class="detail__footnote">
                </p>
              </section>

              <section v-else :id="`detail-panel-${tab}`" class="card detail__panel" role="tabpanel" :aria-labelledby="`detail-tab-${tab}`">
                <header class="detail__panel-head">
                  <div>
                    <p class="detail__panel-title">审核信息</p>
                  </div>
                </header>
                <div class="detail__review">
                  <div class="detail__review-row">
                    <span class="detail__review-label">审核结论</span>
                    <span><AppBadge variant="success" dot><AppIcon name="shield-check" :size="12" />{{ detail.reviewLabel || '通过自动审核' }}</AppBadge></span>
                  </div>
                  <div class="detail__review-row">
                    <span class="detail__review-label">公开理由</span>
                    <span>{{ detail.reviewPublicReason || '未发现拒绝原因。' }}</span>
                  </div>
                  <div class="detail__review-row">
                    <span class="detail__review-label">{{ detail.publicationMode === 'manual' ? '上架时间' : '审核时间' }}</span>
                    <span>{{ (detail.publicationMode === 'manual' ? detail.publishedAt : detail.reviewedAt) ? formatDateTime((detail.publicationMode === 'manual' ? detail.publishedAt : detail.reviewedAt)!) : '—' }}</span>
                  </div>
                  <div v-if="!uploaded" class="detail__review-row">
                    <span class="detail__review-label">README commit</span>
                    <span class="row gap-1"><code class="small">{{ shortHash(detail.readmeCommit) }}</code><CopyButton :value="detail.readmeCommit" label="已复制 commit" :size="15" /></span>
                  </div>
                  <div v-if="!uploaded" class="detail__review-row">
                    <span class="detail__review-label">安装包源码 commit</span>
                    <span class="row gap-1"><code class="small">{{ shortHash(detail.sourceCommit) }}</code><CopyButton :value="detail.sourceCommit" label="已复制 commit" :size="15" /></span>
                  </div>
                </div>
                <div class="notice notice--warning detail__notice">
                  <AppIcon name="alert" :size="16" />
                  <span>{{ detail.publicationMode === 'manual' ? '此版本由管理员直接上架，未经过自动审核或查毒。' : '自动审核为静态检查，不保证无病毒。' }}</span>
                </div>
              </section>
            </div>

            <aside class="detail-aside">
              <div id="downloads" class="card download-card">
                <div class="download-card__head">
                  <span class="download-card__icon"><AppIcon name="package" :size="19" /></span>
                  <div>
                    <p class="download-card__title">下载安装包</p>
                    <p class="download-card__version">{{ detail.plugin.version || '—' }}</p>
                  </div>
                </div>
                <p class="download-card__note">
                  <template v-if="detail.assets.length > 1">请选择与设备架构相符的文件。</template>
                  <template v-else-if="detail.assets.length === 1"></template>
                  <template v-else>暂无可下载的附件。</template>
                </p>

                <div v-for="asset in detail.assets" :key="asset.id" class="asset">
                  <p class="asset__name">{{ asset.name }}</p>
                  <p class="asset__meta">
                    <span>{{ asset.packageName || '—' }}</span>
                    <span class="detail__panel-dot" aria-hidden="true">·</span>
                    <span>{{ asset.architecture || '—' }}</span>
                    <span class="detail__panel-dot" aria-hidden="true">·</span>
                    <span class="tnum">{{ formatSize(asset.size) }}</span>
                  </p>
                  <details class="asset__hash">
                    <summary>SHA-256 摘要</summary>
                    <span class="row gap-1" style="margin-top: 6px">
                      <code class="small">{{ asset.sha256 || '—' }}</code>
                      <CopyButton v-if="asset.sha256" :value="asset.sha256" label="已复制 SHA-256" :size="15" />
                    </span>
                  </details>
                  <AppButton
                    variant="primary"
                    block
                    icon="download"
                    :loading="busy === String(asset.id)"
                    :data-asset-id="asset.id"
                    @click="download(String(asset.id), asset.name)"
                  >
                    下载此文件
                  </AppButton>
                </div>

                <div v-if="!detail.assets.length" class="notice">
                  <AppIcon name="alert-circle" :size="16" />
                  <span>作者尚未上传可用的 IPK。</span>
                </div>

                <div class="download-card__extra">
                  <div class="download-card__line">
                    <span class="detail__review-label">下载统计</span>
                    <span class="tnum">{{ formatNumber(detail.plugin.download_count) }} 次尝试</span>
                  </div>
                  <div class="download-card__line">
                    <span class="detail__review-label">最近更新</span>
                    <span>{{ formatDateTime(detail.publishedAt || detail.plugin.updated_at) }}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div class="detail-mobile-bar">
            <div class="detail-mobile-bar__info">
              <span class="strong">{{ detail.plugin.version || '—' }}</span>
              <span class="small muted">{{ detail.assets.length }} 个安装包</span>
            </div>
            <AppButton
              variant="primary"
              size="sm"
              icon="download"
              @click="scrollToDownloads"
            >
              查看安装包
            </AppButton>
          </div>
        </template>
      </AsyncState>
    </div>
  </div>
</template>

<style scoped>
.detail { padding-top: 26px; }
.detail__crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 20px; font-size: var(--fs-sm); color: var(--text-3); }
.detail__crumbs > svg { flex: none; }
.breadcrumb__current { overflow-wrap: anywhere; }
.detail__crumbs a { display: inline-flex; align-items: center; gap: 5px; }

.detail-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 22px 28px;
  align-items: start;
  padding: 26px;
  border-radius: var(--r-page);
  background: var(--surface);
  box-shadow: var(--shadow-shell);
}
.detail-hero__ident { display: flex; gap: 16px; min-width: 0; }
.detail-hero__text { min-width: 0; }
.detail-hero__text h1 { overflow-wrap: anywhere; font-size: var(--fs-h1); letter-spacing: -0.032em; }
.detail-hero__owner { overflow-wrap: anywhere; word-break: break-word; display: inline-flex; align-items: center; gap: 6px; margin-top: 7px; font-size: var(--fs-sm); color: var(--text-3); font-family: var(--font-mono); }
.detail-hero__desc { margin-top: 12px; max-width: 68ch; color: var(--text-2); line-height: 1.7; }
.detail-hero__actions { display: flex; gap: 10px; flex-wrap: wrap; }
.detail-hero__stats {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin: 4px 0 0;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}
.detail-hero__stats dd { margin: 0; }
.stat__value--text { font-size: var(--fs-body); font-weight: 620; }

.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 24px; margin-top: 24px; align-items: start; }
.detail-main { min-width: 0; }
.detail__tabs { margin-bottom: 16px; flex-wrap: wrap; }
.detail__panel { padding: 24px; }
.detail__panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-bottom: 16px; margin-bottom: 20px; border-bottom: 1px solid var(--line); }
.detail__panel-title { font-size: var(--fs-h3); font-weight: 650; }
.detail__panel-sub { display: flex; align-items: center; gap: 5px; margin-top: 4px; font-size: var(--fs-sm); color: var(--text-3); flex-wrap: wrap; }
.detail__panel-dot { opacity: 0.6; padding-inline: 2px; }
.detail__readme { max-width: 78ch; }
.detail__missing { display: flex; align-items: center; gap: 8px; padding: 18px; border: 1px dashed var(--line); border-radius: var(--r-control); color: var(--text-3); }
.detail__footnote { margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--line); font-size: var(--fs-sm); color: var(--text-3); line-height: 1.6; }
.detail__review { display: flex; flex-direction: column; gap: 0; }
.detail__review-row { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--line); font-size: var(--fs-body); align-items: center; }
.detail__review-row:last-child { border-bottom: 0; }
.detail__review-label { font-size: var(--fs-sm); color: var(--text-3); }
.detail__review code { padding: 2px 6px; border-radius: var(--r-control); background: var(--surface-raised); border: 1px solid var(--line); }
.detail__notice { margin-top: 18px; align-items: flex-start; }

.detail-aside { display: flex; flex-direction: column; gap: 16px; position: sticky; top: calc(var(--header-h) + 18px); }
.download-card { padding: 20px; scroll-margin-top: calc(var(--header-h) + 20px); }
.download-card__head { display: flex; align-items: center; gap: 12px; }
.download-card__icon { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: var(--r-control); background: var(--signal-surface); color: var(--signal-text); }
.download-card__title { font-size: var(--fs-sm); font-weight: 600; color: var(--text-3); }
.download-card__version { font-size: var(--fs-h2); font-weight: 680; letter-spacing: -0.025em; }
.download-card__note { margin-top: 12px; font-size: var(--fs-sm); color: var(--text-2); line-height: 1.6; }
.asset { display: flex; flex-direction: column; gap: 9px; margin-top: 16px; padding: 14px; border: 1px solid var(--line); border-radius: var(--r-control); background: var(--surface-raised); }
.asset__name { font-family: var(--font-mono); font-size: var(--fs-sm); font-weight: 600; word-break: break-all; }
.asset__meta { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: var(--fs-cap); color: var(--text-3); }
.asset__hash { font-size: var(--fs-cap); color: var(--text-3); }
.asset__hash summary { cursor: pointer; padding-block: 2px; min-height: 44px; display: flex; align-items: center; }
.asset__hash code { display: block; word-break: break-all; color: var(--text-2); }
.download-card__extra { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.download-card__line { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: var(--fs-sm); }

.detail__side-card { padding: 18px; }
.detail__side-title { display: flex; align-items: center; gap: 8px; font-size: var(--fs-body); font-weight: 640; }
.detail__side-list { list-style: disc; margin-top: 10px; padding-left: 18px; display: flex; flex-direction: column; gap: 7px; font-size: var(--fs-sm); color: var(--text-3); line-height: 1.6; }
.detail__side-list li::marker { color: var(--signal); }

.detail-mobile-bar { display: none; }

@media (max-width: 1000px) {
  .detail-layout { grid-template-columns: 1fr; }
  .detail-aside { position: static; }
  .detail-hero__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 767px) {
  .detail { padding-top: 16px; padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px)); }
  .detail-hero { grid-template-columns: 1fr; padding: 20px; gap: 18px; }
  .detail-hero__ident { gap: 12px; }
  .detail-hero__actions { width: 100%; }
  .detail-hero__actions .btn { flex: 1; }
  .detail__panel { padding: 18px; }
  .detail__review-row { grid-template-columns: 1fr; gap: 6px; }
  .detail-mobile-bar {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px var(--safe-x) calc(12px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid var(--line);
    background: var(--surface);
    box-shadow: var(--shadow-shell);
  }
  .detail-mobile-bar__info { display: flex; flex-direction: column; line-height: 1.35; min-width: 0; }
}
</style>
