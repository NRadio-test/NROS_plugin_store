<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import AppButton from './AppButton.vue'
import { api, errorMessage, put, session, type Detail, type Plugin } from '../lib/api'
import { downloadAsset } from '../lib/download'
import { formatNumber, formatRelative } from '../lib/format'
import { toast } from '../lib/toast'

const props = defineProps<{ plugin: Plugin }>()
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
    toast.info('先识别手机号', '收藏需要先进入你的插件档案。')
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
  <article class="pkg" :data-plugin-id="plugin.id">
    <div class="pkg__main">
      <div class="pkg__title">
        <h2 class="pkg__name"><RouterLink :to="`/plugins/${plugin.id}`">{{ name }}</RouterLink></h2>
        <span class="pkg__repo">{{ owner }}/{{ name }}</span>
      </div>
      <p class="pkg__desc">{{ plugin.description || '作者尚未提供仓库描述。' }}</p>
      <div class="pkg__meta">
        <span class="mono">{{ plugin.version || '版本未提供' }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ formatRelative(plugin.updated_at) }}更新</span>
      </div>
    </div>

    <div class="pkg__stats">
      <div class="pkg__stat"><b>{{ formatNumber(count) }}</b><span>收藏</span></div>
      <div class="pkg__stat"><b>{{ formatNumber(plugin.download_count) }}</b><span>下载</span></div>
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
.pkg__main { position: relative; }
.pkg__name a { color: var(--text); text-decoration: none; }
.pkg__name a:hover { color: var(--signal-text); }
/* 标题链接覆盖整块文字区；统计与操作区保持在覆盖层之上 */
.pkg__name a::after { content: ''; position: absolute; inset: 0; }
.pkg__stats, .pkg__actions { position: relative; z-index: 1; }
.pkg__actions [aria-pressed='true'] { color: var(--signal-text); background: var(--signal-surface); }
</style>
