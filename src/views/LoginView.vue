<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { errorMessage, loadSession, post, session } from '../lib/api'
import { toast } from '../lib/toast'
import AppIcon from '../components/AppIcon.vue'
import AppButton from '../components/AppButton.vue'
import AppField from '../components/AppField.vue'

const route = useRoute()
const router = useRouter()
const phone = ref('')
const busy = ref(false)
const error = ref(route.query.login_error === 'service' ? '统一登录暂不可用，请稍后重试。' : route.query.login_error ? '统一登录未完成，请重新登录。' : '')

async function login() {
  busy.value = true
  error.value = ''
  try {
    if (session.ssoEnabled) {
      sessionStorage.setItem('plugin-sso-checked', String(Date.now()))
      const result = await post<{ authorizationUrl: string }>('/api/login', { next: route.query.next || '/me' })
      location.assign(result.authorizationUrl)
      return
    }
    await post('/api/login', { phone: phone.value })
    phone.value = ''
    await loadSession()
    toast.success('已进入插件档案')
    const next = String(route.query.next || '/me')
    const safe = next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
    await router.replace(safe ? next : '/me')
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth container">
    <section class="auth__form-wrap">
      <form class="auth__form" novalidate @submit.prevent="login">
        <header class="auth__form-head">
          <AppIcon name="user" :size="22" />
          <h1>登录插件商店</h1>
        </header>

        <p v-if="session.error || (session.ssoEnabled && error)" role="alert">{{ error || session.error }}</p>
        <AppField
          v-if="session.loaded && !session.error && !session.ssoEnabled"
          label="张导小店绑定手机号"
          for-id="phone"
          :error="error"
          hint="非内地号码需加国际区号。"
        >
          <input
            id="phone"
            v-model="phone"
            class="input input--lg"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            maxlength="24"
            required
            placeholder="请输入手机号"
          />
        </AppField>

        <AppButton v-if="session.error && session.ssoEnabled === undefined" block @click="loadSession()">重试</AppButton>
        <AppButton v-else variant="primary" size="lg" type="submit" block :loading="busy" :disabled="!session.loaded" icon-right="arrow-right">
          {{ busy ? '正在进入…' : session.ssoEnabled ? '使用有赞账号登录' : '进入' }}
        </AppButton>

        <p class="auth__foot">
          <RouterLink to="/">返回插件市场</RouterLink>
          <span aria-hidden="true">·</span>
          <RouterLink to="/submit">提交插件</RouterLink>
        </p>
      </form>
    </section>
  </div>
</template>

<style scoped>
.auth { max-width: 440px; padding-top: 48px; }
.auth__form { display: flex; flex-direction: column; gap: 24px; padding: 32px; border: 1px solid var(--line); border-radius: var(--r-group); background: var(--surface); }
.auth__form-head > svg { color: var(--text-2); margin-bottom: 12px; }
.auth__form-head h1 { font-size: 22px; }
.auth__foot { display: flex; align-items: center; gap: 12px; font-size: var(--fs-sm); color: var(--text-2); }
[role=alert] { color: var(--danger); font-size: var(--fs-sm); }
@media (max-width: 560px) { .auth { padding-top: 24px; } .auth__form { padding: 24px 20px; } }
</style>
