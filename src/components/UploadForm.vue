<script setup lang="ts">
import { computed, ref } from 'vue'
import { api, errorMessage } from '../lib/api'
import { toast } from '../lib/toast'
import AppField from './AppField.vue'
import AppButton from './AppButton.vue'
import { formatSize } from '../lib/format'

const props = defineProps<{ studio?: boolean; pluginId?: string; initial?: { name?: string; description?: string; tutorial?: string } }>()
const emit = defineEmits<{ submitted: [] }>()
const name = ref(props.initial?.name ?? '')
const description = ref(props.initial?.description ?? '')
const tutorial = ref(props.initial?.tutorial ?? '')
const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const error = ref('')
const message = ref('')
const ready = computed(() => !!name.value.trim() && !!description.value.trim() && !!tutorial.value.trim())
function select(event: Event) { file.value = (event.target as HTMLInputElement).files?.[0] ?? null; error.value = '' }
async function submit() {
  error.value = ''; message.value = ''
  if (!ready.value || !file.value) { error.value = '请填写完整资料并选择安装包'; return }
  if (!/\.ipk$/i.test(file.value.name) || !file.value.size || file.value.size > 32 * 1024 * 1024) { error.value = '请选择不超过 32 MiB 的 .ipk 文件'; return }
  const form = new FormData()
  form.set('name', name.value); form.set('description', description.value); form.set('tutorial', tutorial.value); form.set('file', file.value)
  busy.value = true
  try {
    const path = props.pluginId ? `/api/plugins/${props.pluginId}/upload` : props.studio ? '/api/studio/submit/upload' : '/api/submit/upload'
    const result = await api<{ message: string }>(path, { method: 'POST', body: form })
    message.value = result.message
    file.value = null
    if (fileInput.value) fileInput.value.value = ''
    emit('submitted')
  } catch (caught) { error.value = errorMessage(caught); toast.error('上传未成功', error.value) }
  finally { busy.value = false }
}
</script>

<template>
  <form class="upload-form" :aria-busy="busy" @submit.prevent="submit">
    <fieldset :disabled="busy">
      <AppField label="插件名称" for-id="upload-name" required>
        <input id="upload-name" v-model="name" class="input" required maxlength="80" autocomplete="off" />
      </AppField>
      <AppField label="插件简介" for-id="upload-description" required hint="简要说明用途。">
        <textarea id="upload-description" v-model="description" class="textarea" required maxlength="500" rows="3" />
      </AppField>
      <AppField label="使用教程" for-id="upload-tutorial" required hint="支持 Markdown。">
        <textarea id="upload-tutorial" v-model="tutorial" class="textarea" required maxlength="20000" rows="8" />
      </AppField>
      <AppField label="IPK 安装包" for-id="upload-file" required :hint="ready ? '最大 32 MiB，版本与架构从包内读取。' : '先填写上面的资料。'">
        <input id="upload-file" ref="fileInput" class="input upload-form__file" type="file" accept=".ipk" :disabled="!ready" required @change="select" />
        <p v-if="file" class="upload-form__filename">{{ file.name }} · {{ formatSize(file.size) }}</p>
      </AppField>
    </fieldset>
    <p class="upload-form__hint">含无法核验来源的二进制时，需要通过 GitHub 补充源码与构建配置。</p>
    <p v-if="error" class="notice notice--danger" role="alert">{{ error }}</p>
    <p v-if="message" class="notice notice--success" role="status">{{ message }} <RouterLink v-if="!studio && !pluginId" to="/me">查看我的提交 →</RouterLink></p>
    <AppButton type="submit" variant="primary" icon="upload" :loading="busy" :disabled="!ready || !file">{{ busy ? '正在上传…' : '上传并提交审核' }}</AppButton>
  </form>
</template>

<style scoped>
.upload-form, .upload-form fieldset { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.upload-form fieldset { border: 0; padding: 0; margin: 0; }
.upload-form__hint, .upload-form__filename { font-size: var(--fs-sm); color: var(--text-3); overflow-wrap: anywhere; }
.upload-form__file { height: auto; min-height: 48px; padding: 10px; max-width: 100%; }
.upload-form__file::file-selector-button { font: inherit; color: var(--text); background: var(--surface-raised); border: 1px solid var(--line); border-radius: var(--r-control); padding: 8px 12px; margin-right: 12px; cursor: pointer; }
.upload-form > .btn { align-self: flex-start; }
@media (max-width: 560px) { .upload-form > .btn { width: 100%; } }
</style>
