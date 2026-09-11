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

const benefits = [
  { icon: 'heart' as const, title: '收藏插件', text: '把常用插件收进自己的清单，换设备也能找回。' },
  { icon: 'upload' as const, title: '提交仓库', text: '提交公开 GitHub 仓库，自动审核通过后出现在市场。' },
  { icon: 'history' as const, title: '跟进进度', text: '在个人中心查看审核状态与公开原因，可手动触发重新检查。' },
]

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
        <p class="eyebrow auth__eyebrow">你的插件档案</p>
        <h1 class="auth__headline">用手机号进入，<br />继续你的插件清单。</h1>
        <p class="auth__lead">不需要密码，也不发送短信验证码。这个号码只用来把你的收藏与投稿归到一个档案里。</p>
        <ul class="auth__list">
          <li v-for="item in benefits" :key="item.title">
            <span class="auth__list-icon"><AppIcon :name="item.icon" :size="16" /></span>
            <span>
              <span class="auth__list-title">{{ item.title }}</span>
              <span class="auth__list-text">{{ item.text }}</span>
            </span>
          </li>
        </ul>
      </div>
    </section>

    <section class="auth__form-wrap">
      <form class="auth__form" novalidate @submit.prevent="login">
        <header class="auth__form-head">
          <span class="auth__form-icon"><AppIcon name="user" :size="20" /></span>
          <div>
            <h2 class="auth__form-title">手机号识别</h2>
            <p class="auth__form-sub">输入张导小店绑定的手机号</p>
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
          <RouterLink to="/submit">了解提交流程</RouterLink>
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
  border-radius: var(--r-xl);
  background: transparent;
  box-shadow: none;
}
.auth__aside-inner { position: relative; max-width: 46ch; }
.auth__eyebrow { color: var(--primary-text); }
.auth__headline { margin-top: 16px; font-size: var(--fs-h1); letter-spacing: -0.035em; line-height: 1.4; }
.auth__lead { margin-top: 14px; color: var(--text-secondary); line-height: 1.75; }
.auth__list { display: flex; flex-direction: column; gap: 14px; margin-top: 30px; list-style: none; }
.auth__list li { display: flex; gap: 12px; }
.auth__list-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; border-radius: var(--r-sm); background: var(--signal-surface); border: 0; color: var(--primary-text); box-shadow: var(--shadow-xs); }
.auth__list-title { display: block; font-weight: 640; font-size: var(--text-body); }
.auth__list-text { display: block; margin-top: 2px; font-size: var(--fs-body); color: var(--text-2); line-height: 1.6; }

.auth__form-wrap { display: flex; align-items: center; }
.auth__form { width: 100%; display: flex; flex-direction: column; gap: 20px; padding: var(--sp-8); border: 0; border-radius: var(--r-xl); background: var(--bg-card); box-shadow: var(--shadow-md); }
.auth__form-head { display: flex; align-items: center; gap: 13px; }
.auth__form-icon { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: var(--r-md); background: var(--primary-surface); color: var(--primary-text); }
.auth__form-title { font-size: var(--fs-h2); }
.auth__form-sub { margin-top: 3px; font-size: var(--text-small); color: var(--text-tertiary); }
.auth__foot { display: flex; align-items: center; gap: 8px; font-size: var(--text-small); color: var(--text-tertiary); }

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
