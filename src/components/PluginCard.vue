<!-- 市场卡片：结构沿用 Astrbot_Plugins_Market PluginCard.vue 的浏览逻辑，GPL-3.0，2026 年重新设计。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from './AppIcon.vue'
import AppButton from './AppButton.vue'
import AppBadge from './AppBadge.vue'
import MonogramAvatar from './MonogramAvatar.vue'
import { api, errorMessage, put, session, type Detail, type Plugin } from '../lib/api'
import { downloadAsset } from '../lib/download'
import { formatNumber } from '../lib/format'
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
  <article class="plugin-card" :data-plugin-id="plugin.id">
    <div class="plugin-card__top">
      <MonogramAvatar :name="owner" />
      <div class="plugin-card__ident">
        <h3 class="plugin-card__name">
          <RouterLink :to="`/plugins/${plugin.id}`" class="plugin-card__link">{{ name }}</RouterLink>
        </h3>
        <p class="plugin-card__owner">{{ owner }}<span class="plugin-card__dot" aria-hidden="true">·</span>GitHub 作者</p>
      </div>
      <AppBadge v-if="plugin.version" variant="neutral" class="plugin-card__version">
        <AppIcon name="tag" :size="12" />{{ plugin.version }}
      </AppBadge>
    </div>

    <p class="plugin-card__desc">{{ plugin.description || '作者尚未提供仓库描述，详情页仍会展示 GitHub 上的真实 README。' }}</p>

    <div class="plugin-card__foot">
      <div class="plugin-card__stats">
        <span class="plugin-card__stat" :title="`${count} 个识别档案收藏了该插件`">
          <AppIcon name="heart" :size="15" />{{ formatNumber(count) }}
        </span>
        <span class="plugin-card__stat" :title="`${plugin.download_count} 次通过站内入口开始的下载`">
          <AppIcon name="download" :size="15" />{{ formatNumber(plugin.download_count) }}
        </span>
      </div>
      <div class="plugin-card__actions">
        <button
          type="button"
          class="icon-action"
          :class="{ 'icon-action--on': active }"
          :aria-pressed="active"
          :disabled="!!busy"
          :aria-label="active ? `取消收藏 ${plugin.full_name}` : `收藏 ${plugin.full_name}`"
          :title="active ? '取消收藏' : '收藏'"
          @click.stop="favorite"
        >
          <AppIcon :name="active ? 'heart-filled' : 'heart'" :size="16" />
        </button>
        <AppButton
          variant="primary"
          size="sm"
          icon="download"
          :loading="busy === 'download'"
          @click.stop="download"
        >
          下载 IPK
        </AppButton>
      </div>
    </div>
  </article>
</template>

<style scoped>
.plugin-card {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-lg);
  background: var(--bg-card);
  box-shadow: var(--shadow-xs);
  transition: transform var(--dur-2) var(--ease-out), box-shadow var(--dur-2) var(--ease-out), border-color var(--dur-2) var(--ease-out);
}
/* 装饰性渐变停在内容之下 */
.plugin-card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--hero-gradient);
  opacity: 0;
  transition: opacity var(--dur-3) var(--ease-out);
  pointer-events: none;
}
.plugin-card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--border-strong); }
.plugin-card:hover::after { opacity: 0.6; }

.plugin-card__top { display: flex; align-items: flex-start; gap: 12px; }
.plugin-card__ident { flex: 1; min-width: 0; }
.plugin-card__name { font-size: 1.0625rem; font-weight: 660; letter-spacing: -0.02em; line-height: 1.3; }
.plugin-card__link { color: var(--text-primary); text-decoration: none; }
/* 整卡可点：链接伪元素覆盖整张卡片，操作按钮层级更高，避免误触导航。 */
.plugin-card__link::after { content: ''; position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
.plugin-card__link:hover { color: var(--primary-text); text-decoration: none; }
.plugin-card__owner { display: flex; align-items: center; gap: 5px; margin-top: 2px; font-size: var(--text-small); color: var(--text-tertiary); }
.plugin-card__dot { opacity: 0.6; }
.plugin-card__version { flex: none; }
.plugin-card__version :deep(svg) { margin-right: -1px; }

.plugin-card__desc {
  flex: 1;
  font-size: var(--text-body);
  color: var(--text-secondary);
  line-height: 1.65;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.plugin-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}
.plugin-card__stats { display: flex; align-items: center; gap: 14px; }
.plugin-card__stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--text-small);
  font-weight: 600;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.plugin-card__actions { display: flex; align-items: center; gap: 8px; position: relative; z-index: 3; }

.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px; height: 32px;
  border: 1px solid var(--border-base);
  border-radius: var(--r-sm);
  background: var(--bg-card);
  color: var(--text-tertiary);
  transition: all var(--dur-1) var(--ease-out);
}
.icon-action:hover:not(:disabled) { color: var(--danger-text); border-color: var(--danger-border); background: var(--danger-surface); }
.icon-action--on { color: var(--danger-text); border-color: var(--danger-border); background: var(--danger-surface); }
.icon-action:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
