<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { errorMessage, loadSession, post } from '../lib/api'
import { toast } from '../lib/toast'
import AppIcon from '../components/AppIcon.vue'
import AppButton from '../components/AppButton.vue'
import AppField from '../components/AppField.vue'

const route = useRoute()
const router = useRouter()
const phone = ref('')
const busy = ref(false)
const error = ref('')

async function login() {
  busy.value = true
  error.value = ''
  try {
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
    <section class="auth__aside">
      <div class="auth__aside-inner">
        <h1 class="auth__headline">手机号进入</h1>
        <p class="auth__lead">用来收藏插件、查看投稿进度。</p>
      </div>
    </section>

    <section class="auth__form-wrap">
      <form class="auth__form" novalidate @submit.prevent="login">
        <header class="auth__form-head">
          <span class="auth__form-icon"><AppIcon name="user" :size="20" /></span>
          <div>
            <h2 class="auth__form-title">手机号识别</h2>
          </div>
        </header>

        <AppField
          label="张导小店绑定手机号"
          for-id="phone"
          :error="error"
          hint="内地手机号可直接填写 11 位；其他地区请加国际区号。"
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

        <AppButton variant="primary" size="lg" type="submit" block :loading="busy" icon-right="arrow-right">
          {{ busy ? '正在进入…' : '进入' }}
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
.auth { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 32px; align-items: center; padding-top: var(--sp-12); max-width: 66rem; }
.auth__aside {
  position: relative;
  overflow: hidden;
  padding: 40px;
  border-radius: var(--r-page);
  background: transparent;
  box-shadow: none;
}
.auth__aside-inner { position: relative; max-width: 46ch; }
.auth__eyebrow { color: var(--signal-text); }
.auth__headline { margin-top: 16px; font-size: var(--fs-h1); letter-spacing: -0.035em; line-height: 1.4; }
.auth__lead { margin-top: 14px; color: var(--text-2); line-height: 1.75; }
.auth__list { display: flex; flex-direction: column; gap: 14px; margin-top: 30px; list-style: none; }
.auth__list li { display: flex; gap: 12px; }
.auth__list-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; border-radius: var(--r-control); background: var(--signal-surface); border: 0; color: var(--signal-text); box-shadow: var(--shadow-xs); }
.auth__list-title { display: block; font-weight: 640; font-size: var(--fs-body); }
.auth__list-text { display: block; margin-top: 2px; font-size: var(--fs-body); color: var(--text-2); line-height: 1.6; }

.auth__form-wrap { display: flex; align-items: center; }
.auth__form { width: 100%; display: flex; flex-direction: column; gap: 20px; padding: var(--sp-8); border: 0; border-radius: var(--r-page); background: var(--surface); box-shadow: var(--shadow-shell); }
.auth__form-head { display: flex; align-items: center; gap: 13px; }
.auth__form-icon { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: var(--r-control); background: var(--signal-surface); color: var(--signal-text); }
.auth__form-title { font-size: var(--fs-h2); }
.auth__form-sub { margin-top: 3px; font-size: var(--fs-sm); color: var(--text-3); }
.auth__foot { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); color: var(--text-3); }

@media (max-width: 900px) {
  .auth { grid-template-columns: 1fr; gap: 20px; padding-top: 28px; }
  .auth__aside { padding: 0; }
  .auth__list { display: none; }
  .auth__headline { margin-top: var(--sp-2); }
  .auth__lead { margin-top: var(--sp-3); }
  .auth__list { margin-top: 22px; }
  .auth__form { padding: 24px; }
}
</style>
