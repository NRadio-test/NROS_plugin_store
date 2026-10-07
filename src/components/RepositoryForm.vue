<script setup lang="ts">
import { ref } from 'vue'
import { errorMessage, post } from '../lib/api'
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

async function submit() {
  busy.value = true
  error.value = ''
  result.value = null
  try {
    const value = await post<SubmitResult>(props.studio ? '/api/studio/submit' : '/api/submit', { url: url.value })
    result.value = value
    url.value = ''
    emit('submitted', value)
  } catch (caught) {
    error.value = errorMessage(caught)
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
      hint="需提供 README，并在正式 Release 中上传 .ipk。"
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
    </AppField>

    <div class="repo-form__actions">
      <AppButton variant="primary" size="lg" type="submit" icon="send" :loading="busy">
        {{ busy ? '正在提交…' : '提交审核' }}
      </AppButton>
    </div>

    <div v-if="result" class="notice notice--success repo-form__result" role="status">
      <AppIcon name="check-circle" :size="17" />
      <div>
        <p class="notice__title">{{ result.message }}</p>
        <p v-if="!studio" class="repo-form__result-line">
          <RouterLink to="/me">查看我的提交 →</RouterLink>
        </p>
      </div>
    </div>
  </form>
</template>

<style scoped>
.repo-form { display: flex; flex-direction: column; gap: 18px; }
.repo-form__input { position: relative; display: flex; align-items: center; }
.repo-form__prefix { position: absolute; left: 14px; color: var(--text-3); display: inline-flex; }
.repo-form__field { padding-left: 42px; }
.repo-form__actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.repo-form__result { align-items: flex-start; }
.repo-form__result-line { margin-top: 4px; }
@media (max-width: 560px) { .repo-form__actions .btn { width: 100%; } }
</style>
