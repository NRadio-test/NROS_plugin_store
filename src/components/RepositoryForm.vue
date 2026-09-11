<script setup lang="ts">
import { computed, ref } from 'vue'
import { errorMessage, post } from '../lib/api'
import { toast } from '../lib/toast'
import AppIcon from './AppIcon.vue'
import AppButton from './AppButton.vue'
import AppField from './AppField.vue'

interface SubmitResult { taskId?: string | null; pluginId?: string; message: string; status: string }

const props = defineProps<{ studio?: boolean }>()
const emit = defineEmits<{ submitted: [result: SubmitResult] }>()

const url = ref('')
const busy = ref(false)
const error = ref('')
const result = ref<SubmitResult | null>(null)

/** 前端只做明显错误的即时提示，真正的规范化与校验始终在服务端。 */
const preview = computed(() => {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})\/?$/.exec(url.value.trim().replace(/\.git$/, ''))
  return match ? `${match[1]}/${match[2]}` : ''
})

async function submit() {
  busy.value = true
  error.value = ''
  result.value = null
  try {
    const value = await post<SubmitResult>(props.studio ? '/api/studio/submit' : '/api/submit', { url: url.value })
    result.value = value
    url.value = ''
    toast.success('投稿已保存，已进入后台队列')
    emit('submitted', value)
  } catch (caught) {
    error.value = errorMessage(caught)
    toast.error('提交未成功', error.value)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <form class="repo-form" @submit.prevent="submit">
    <AppField
      label="GitHub 公开仓库链接"
      for-id="repository-url"
      :error="error"
      hint="只接受 github.com 的 HTTPS 公开仓库；不支持私有仓库、任意文件地址或代理链接。"
      required
    >
      <div class="repo-form__input">
        <span class="repo-form__prefix" aria-hidden="true"><AppIcon name="github" :size="17" /></span>
        <input
          id="repository-url"
          v-model="url"
          class="input input--lg repo-form__field"
          type="url"
          required
          maxlength="250"
          spellcheck="false"
          autocomplete="off"
          placeholder="https://github.com/owner/repository"
        />
      </div>
      <p v-if="preview" class="repo-form__preview">仓库：{{ preview }}</p>
    </AppField>

    <div class="repo-form__actions">
      <AppButton variant="primary" size="lg" type="submit" icon="send" :loading="busy">
        {{ busy ? '正在提交…' : '提交审核' }}
      </AppButton>
      <span class="repo-form__note">提交者与 GitHub 作者是两个身份，商店不会把提交者认证为仓库所有者。</span>
    </div>

    <div v-if="result" class="notice notice--success repo-form__result" role="status">
      <AppIcon name="check-circle" :size="17" />
      <div>
        <p class="notice__title">{{ result.message }}</p>
        <p class="repo-form__result-line">
          任务在后台继续处理，关闭页面不会中断。
          <RouterLink v-if="!studio" to="/me">查看我的提交 →</RouterLink>
        </p>
        <p v-if="result.taskId" class="repo-form__task">
          <span>任务编号</span><code>{{ result.taskId }}</code>
        </p>
      </div>
    </div>
  </form>
</template>

<style scoped>
.repo-form { display: flex; flex-direction: column; gap: 18px; }
.repo-form__input { position: relative; display: flex; align-items: center; }
.repo-form__prefix { position: absolute; left: 14px; color: var(--text-tertiary); display: inline-flex; }
.repo-form__field { padding-left: 42px; }
.repo-form__preview { color: var(--signal-text); font-family: var(--font-mono); font-size: var(--fs-sm); overflow-wrap: anywhere; }
.repo-form__actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.repo-form__note { flex: 1; min-width: 220px; font-size: var(--text-small); color: var(--text-tertiary); line-height: 1.6; }
.repo-form__result { align-items: flex-start; }
.repo-form__result-line { margin-top: 4px; }
.repo-form__task { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: var(--text-small); }
.repo-form__task span { color: var(--text-tertiary); }
.repo-form__task code { padding: 2px 7px; border-radius: var(--r-xs); background: var(--bg-card); border: 1px solid var(--border-base); font-size: var(--text-micro); }
@media (max-width: 560px) { .repo-form__actions .btn { width: 100%; } .repo-form__task { flex-wrap: wrap; overflow-wrap: anywhere; } }
</style>
