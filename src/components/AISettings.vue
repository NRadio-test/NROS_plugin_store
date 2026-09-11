<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, errorMessage, post, put } from '../lib/api'
import { toast } from '../lib/toast'
import AsyncState from './AsyncState.vue'
import AppIcon from './AppIcon.vue'
import AppBadge from './AppBadge.vue'
import AppButton from './AppButton.vue'
import AppField from './AppField.vue'

interface AIConfig {
  baseUrl: string; model: string; apiKey?: string; timeoutMs: number; maxRetries: number
  inputBudget: number; outputBudget: number; rules: string; structuredOutput: boolean
}

const config = ref<AIConfig>({
  baseUrl: '', model: '', timeoutMs: 45000, maxRetries: 2,
  inputBudget: 100000, outputBudget: 1500, rules: '', structuredOutput: false,
})
const apiKey = ref('')
const mask = ref('')
const loading = ref(true)
const error = ref('')
const feedback = ref<{ ok: boolean; message: string } | null>(null)
const busy = ref('')

const keyHint = computed(() =>
  mask.value ? `已保存密钥 ${mask.value}，留空表示保留现有密钥。` : '密钥由服务端加密保存，读取设置时只返回掩码。',
)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const value = await api<AIConfig | null>('/api/studio/ai')
    if (value) {
      const { apiKey: key, ...rest } = value
      mask.value = key || ''
      Object.assign(config.value, rest)
    }
    apiKey.value = ''
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    loading.value = false
  }
}

async function save() {
  busy.value = 'save'
  feedback.value = null
  try {
    await put('/api/studio/ai', { ...config.value, ...(apiKey.value ? { apiKey: apiKey.value } : {}) })
    feedback.value = { ok: true, message: 'AI 设置已保存。' }
    toast.success('AI 设置已保存')
    await load()
  } catch (caught) {
    feedback.value = { ok: false, message: errorMessage(caught) }
    toast.error('保存未生效', errorMessage(caught))
  } finally {
    busy.value = ''
  }
}

async function test() {
  busy.value = 'test'
  feedback.value = null
  try {
    const result = await post<{ ok: boolean; message: string }>('/api/studio/ai/test')
    feedback.value = { ok: result.ok, message: `连接成功：${result.message}` }
  } catch (caught) {
    feedback.value = { ok: false, message: `连接失败：${errorMessage(caught)}` }
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>

<template>
  <section class="ai">
    <header class="ai__head">
      <div>
        <h2 class="ai__title">AI 审核设置</h2>
        <p class="ai__desc">
          使用一个 OpenAI 兼容的 Chat Completions 提供商。缺少配置、连接失败、超时、限额或输出格式错误都不会默认通过审核。
        </p>
      </div>
      <AppBadge :variant="config.model && mask ? 'success' : 'warning'" dot>
        {{ config.model && mask ? '已配置' : '待配置' }}
      </AppBadge>
    </header>

    <AsyncState :loading="loading" :error="error" skeleton="row" :skeleton-count="6" @retry="load">
      <form class="ai__form" @submit.prevent="save">
        <article class="card">
          <header class="card__head">
            <div>
              <p class="card__title">接口与凭据</p>
              <p class="card__desc">Base URL 会自动规范化到 /chat/completions，不会重复追加 /v1</p>
            </div>
          </header>
          <div class="card__body form-grid">
            <AppField label="Base URL" for-id="ai-base-url" required hint="仅允许公共 HTTPS 主机，不接受内网地址或查询参数。">
              <input id="ai-base-url" v-model="config.baseUrl" class="input" type="url" required placeholder="https://api.example.com/v1" />
            </AppField>
            <AppField label="模型名称" for-id="ai-model" required hint="填写提供商实际的模型 ID。">
              <input id="ai-model" v-model="config.model" class="input" required maxlength="150" placeholder="模型 ID" />
            </AppField>
            <div class="full">
              <AppField label="API Key" for-id="ai-key" :hint="keyHint">
                <input id="ai-key" v-model="apiKey" class="input" type="password" autocomplete="new-password" :placeholder="mask ? '留空保留已保存密钥' : '填写服务端加密保存的密钥'" />
              </AppField>
            </div>
          </div>
        </article>

        <article class="card">
          <header class="card__head">
            <div>
              <p class="card__title">预算与重试</p>
              <p class="card__desc">超出预算的材料会进入未完成状态，不会被静默截断后宣称通过</p>
            </div>
          </header>
          <div class="card__body form-grid">
            <AppField label="请求超时（毫秒）" for-id="ai-timeout" required>
              <input id="ai-timeout" v-model.number="config.timeoutMs" class="input" type="number" required min="1000" max="120000" step="1000" />
            </AppField>
            <AppField label="最大重试次数" for-id="ai-retry" required hint="429 与 5xx 会按退避重试，耗尽后保留失败状态。">
              <input id="ai-retry" v-model.number="config.maxRetries" class="input" type="number" min="0" max="3" required />
            </AppField>
            <AppField label="输入预算（字符）" for-id="ai-input" required>
              <input id="ai-input" v-model.number="config.inputBudget" class="input" type="number" min="4000" max="200000" required />
            </AppField>
            <AppField label="输出预算（token）" for-id="ai-output" required hint="作为兼容接口的 max_tokens 上限，请匹配提供商能力。">
              <input id="ai-output" v-model.number="config.outputBudget" class="input" type="number" min="200" max="8000" required />
            </AppField>
            <div class="full">
              <label class="switch">
                <input v-model="config.structuredOutput" type="checkbox" />
                <span class="switch__track" aria-hidden="true" />
                <span>提供商支持 JSON Schema 结构化输出</span>
              </label>
              <p class="field__hint" style="margin-top: 8px">
                不勾选时商店仍会请求 JSON 并在服务端严格校验枚举、必填项与长度；两种方式都不会因为格式错误而放行。
              </p>
            </div>
          </div>
        </article>

        <article class="card">
          <header class="card__head">
            <div>
              <p class="card__title">审核规则</p>
              <p class="card__desc">补充规则会附加在固定系统提示之后，不能改变输出契约</p>
            </div>
          </header>
          <div class="card__body">
            <AppField label="补充审核规则" for-id="ai-rules" optional hint="例如：结合插件用途判断联网行为；不要仅因出现 shell 或系统服务调用而拒绝。">
              <textarea id="ai-rules" v-model="config.rules" class="textarea" rows="7" maxlength="12000" placeholder="结合插件用途识别垃圾、欺骗和恶意行为；不要仅因正常网络与系统操作拒绝。" />
            </AppField>
          </div>
        </article>

        <div class="ai__actions">
          <AppButton variant="primary" type="submit" icon="check" :loading="busy === 'save'">{{ busy === 'save' ? '正在保存…' : '保存设置' }}</AppButton>
          <AppButton type="button" icon="zap" :loading="busy === 'test'" @click="test">测试已保存配置</AppButton>
          <span class="ai__note">测试会发送一次不发布任何插件的审核请求。</span>
        </div>

        <div v-if="feedback" class="notice" :class="feedback.ok ? 'notice--success' : 'notice--danger'" role="status">
          <AppIcon :name="feedback.ok ? 'check-circle' : 'alert-circle'" :size="16" />
          <span>{{ feedback.message }}</span>
        </div>
      </form>
    </AsyncState>
  </section>
</template>

<style scoped>
.ai { display: flex; flex-direction: column; gap: 16px; }
.ai__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ai__title { font-size: var(--text-h2); }
.ai__desc { margin-top: 5px; max-width: 88ch; font-size: var(--text-small); color: var(--text-tertiary); line-height: 1.65; }
.ai__form { display: flex; flex-direction: column; gap: 16px; }
.ai__actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.ai__note { font-size: var(--text-small); color: var(--text-tertiary); }
</style>
