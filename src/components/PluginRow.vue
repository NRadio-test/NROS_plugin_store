<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import AppButton from './AppButton.vue'
import HighlightedText from './HighlightedText.vue'
import { api, errorMessage, put, session, type Detail, type Plugin } from '../lib/api'
import { downloadAsset } from '../lib/download'
import { formatNumber, formatRelative } from '../lib/format'
import { toast } from '../lib/toast'

const props = defineProps<{ plugin: Plugin; index?: number; query?: string }>()
const router = useRouter()
const busy = ref('')
const count = ref(props.plugin.favorite_count)
const active = ref(!!props.plugin.favorited)

watch(() => props.plugin, plugin => {
  count.value = plugin.favorite_count
  active.value = !!plugin.favorited
})

const owner = computed(() => props.plugin.full_name.split('/')[0] || props.plugin.full_name)
const name = computed(() => props.plugin.full_name.split('/').at(-1) || props.plugin.full_name)

async function favorite() {
  if (!session.user) {
    toast.info('请先登录')
    await router.push({ path: '/login', query: { next: router.currentRoute.value.fullPath } })
    return
  }
  busy.value = 'favorite'
  try {
    const result = await put<{ favorite_count: number; favorited: boolean }>(`/api/plugins/${props.plugin.id}/favorite`, { active: !active.value })
    count.value = result.favorite_count
    active.value = result.favorited
    toast.success(result.favorited ? '已加入收藏' : '已取消收藏', props.plugin.full_name)
  } catch (error) {
    toast.error('收藏未生效', errorMessage(error))
  } finally {
    busy.value = ''
  }
}

async function download() {
  busy.value = 'download'
  try {
    const detail = await api<Detail>(`/api/plugins/${props.plugin.id}`)
    if (detail.assets.length !== 1) {
      await router.push(`/plugins/${props.plugin.id}#downloads`)
      return
    }
    await downloadAsset(props.plugin.id, String(detail.assets[0]!.id))
    toast.success('已开始下载', detail.assets[0]!.name)
  } catch (error) {
    toast.error('下载未开始', errorMessage(error))
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <article class="pkg" :class="index !== undefined && 'pkg--indexed'" :data-plugin-id="plugin.id">
    <span v-if="index !== undefined" class="pkg__index mono" aria-hidden="true">{{ String(index).padStart(2, '0') }}</span>
    <div class="pkg__main">
      <h2 class="pkg__name"><RouterLink :to="`/plugins/${plugin.id}`"><HighlightedText :text="name" :query="query" /></RouterLink></h2>
      <p class="pkg__desc"><HighlightedText :text="plugin.description || '暂无描述'" :query="query" /></p>
      <div class="pkg__meta">
        <span class="pkg__source">{{ plugin.source_kind === 'upload' ? 'IPK 直传' : 'GitHub' }}</span>
        <span class="pkg__author">作者 {{ plugin.author || owner }}</span>
        <span aria-hidden="true">·</span>
        <span class="mono">{{ plugin.version || '—' }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ formatRelative(plugin.updated_at) }}更新</span>
      </div>
    </div>

    <div class="pkg__stats">
      <span><b>{{ formatNumber(count) }}</b><span class="sr-only">收藏</span></span><span aria-hidden="true">/</span><span><b>{{ formatNumber(plugin.download_count) }}</b><span class="sr-only">下载</span></span>
    </div>

    <div class="pkg__actions">
      <button
        class="btn btn--raised btn--icon"
        type="button"
        :aria-pressed="active"
        :disabled="!!busy"
        :aria-busy="busy === 'favorite' || undefined"
        :aria-label="active ? `取消收藏 ${plugin.full_name}` : `收藏 ${plugin.full_name}`"
        @click="favorite"
      >
        <span v-if="busy === 'favorite'" class="btn__spinner" aria-hidden="true" />
        <AppIcon v-else :name="active ? 'heart-filled' : 'heart'" :size="19" />
      </button>
      <AppButton
        variant="secondary"
        icon="download"
        :disabled="busy === 'favorite'"
        :loading="busy === 'download'"
        :aria-label="`下载 ${plugin.full_name}`"
        @click="download"
      >
        下载
      </AppButton>
    </div>
  </article>
</template>

<style scoped>
.pkg { gap: 24px; position: relative; background: transparent; transition: background-color var(--dur-fast) var(--ease); }
.pkg:hover { background: var(--surface-raised); }
.pkg__index { width: 32px; flex: none; color: var(--text-3); font-size: 12px; align-self: flex-start; padding-top: 5px; }
.pkg__main { position: relative; }
.pkg__name { font-size: 21px; font-weight: 600; letter-spacing: -0.025em; }
.pkg__desc { color: var(--text-2); margin-top: 6px; font-size: 14px; }
.pkg__meta { margin-top: 12px; font-size: 11px; gap: 8px; }
.pkg__source { color: var(--signal-text); padding-right: 9px; border-right: 1px solid var(--line-strong); }
.pkg__stats { width: 130px; flex: none; display: flex; gap: 12px; font-size: 13px; color: var(--text-3); }
.pkg__stats b { font-weight: 400; color: var(--text-2); }
.pkg__actions { width: 152px; flex: none; justify-content: flex-end; }
.pkg__actions .btn--icon { background: transparent; border-color: transparent; }
.pkg__name a { color: var(--text); text-decoration: none; }
.pkg__name a:hover { color: var(--signal-text); }
/* 标题链接覆盖整块文字区；统计与操作区保持在覆盖层之上 */
.pkg__name a::after { content: ''; position: absolute; inset: 0; }
.pkg__stats, .pkg__actions { position: relative; z-index: 1; }
.pkg__actions [aria-pressed='true'] { color: var(--signal-text); background: var(--signal-surface); }
@media(max-width:640px) {
  .pkg { padding: 20px 0 !important; gap: 12px; }
  .pkg__index { width: 24px; padding-top: 3px; }
  .pkg__main { flex-basis: 100%; min-width: 0; }
  .pkg--indexed .pkg__main { flex-basis: calc(100% - 36px); }
  .pkg__name { font-size: 19px; }
  .pkg--indexed .pkg__stats { margin-left: 36px; }
  .pkg__stats { width: auto; flex: 1; gap: 6px; font-size: 12px; white-space: nowrap; }
  .pkg__stats .sr-only { position: static; width: auto; height: auto; clip-path: none; margin-left: 5px; }
  .pkg__actions { width: auto; }
}
</style>
