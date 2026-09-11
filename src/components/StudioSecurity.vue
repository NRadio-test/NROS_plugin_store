<script setup lang="ts">
import { computed, ref } from 'vue'
import { errorMessage, loadSession, post, session } from '../lib/api'
import { toast } from '../lib/toast'
import AppIcon from './AppIcon.vue'
import AppButton from './AppButton.vue'
import AppField from './AppField.vue'

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const busy = ref(false)
const error = ref('')

const strength = computed(() => {
  const value = newPassword.value
  if (!value) return { level: 0, label: '尚未填写', tone: 'neutral' as const }
  let score = 0
  if (value.length >= 12) score++
  if (value.length >= 16) score++
  if (/[a-z]/i.test(value) && /\d/.test(value)) score++
  if (/[^A-Za-z0-9]/.test(value)) score++
  if (score <= 1) return { level: 1, label: '强度偏弱', tone: 'danger' as const }
  if (score === 2) return { level: 2, label: '强度一般', tone: 'warning' as const }
  if (score === 3) return { level: 3, label: '强度良好', tone: 'info' as const }
  return { level: 4, label: '强度很高', tone: 'success' as const }
})

async function submit() {
  error.value = ''
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的新密码不一致'
    return
  }
  busy.value = true
  try {
    await post('/api/studio/password', { currentPassword: currentPassword.value, newPassword: newPassword.value })
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    await loadSession()
    toast.success('密码已更新', '其他管理员会话已失效，当前会话已自动续期。')
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="sec">
    <header class="sec__head">
      <div>
        <h2 class="sec__title">账号安全</h2>
        <p class="sec__desc">使用与导入兼容的 PBKDF2-SHA256 参数重新散列密码；保存后该管理员的其它会话会立即失效。</p>
      </div>
      <span class="sec__who"><AppIcon name="user" :size="15" />{{ session.admin?.username }}</span>
    </header>

    <div class="sec__grid">
      <article class="card">
        <header class="card__head">
          <div>
            <p class="card__title">修改密码</p>
            <p class="card__desc">新密码至少 12 位，需同时包含字母与数字</p>
          </div>
        </header>
        <form class="card__body form-section" @submit.prevent="submit">
          <AppField label="当前密码" for-id="current-password" required>
            <input id="current-password" v-model="currentPassword" class="input" type="password" autocomplete="current-password" required maxlength="500" />
          </AppField>
          <AppField label="新密码" for-id="new-password" required>
            <input id="new-password" v-model="newPassword" class="input" type="password" autocomplete="new-password" required maxlength="200" />
          </AppField>
          <div class="sec__meter" :class="`sec__meter--${strength.tone}`">
            <span v-for="step in 4" :key="step" class="sec__meter-seg" :class="step <= strength.level && 'sec__meter-seg--on'" />
            <span class="sec__meter-label">{{ strength.label }}</span>
          </div>
          <AppField label="确认新密码" for-id="confirm-password" :error="error" required>
            <input id="confirm-password" v-model="confirmPassword" class="input" type="password" autocomplete="new-password" required maxlength="200" />
          </AppField>
          <div>
            <AppButton variant="primary" type="submit" icon="lock" :loading="busy">{{ busy ? '正在更新…' : '更新密码' }}</AppButton>
          </div>
        </form>
      </article>

      <aside class="sec__aside">
        <div class="card sec__note">
          <p class="sec__note-title"><AppIcon name="shield-check" :size="15" />安全边界</p>
          <ul>
            <li>新商店与旧站使用独立 Cookie 与会话，不共享父域管理员会话。</li>
            <li>密码哈希与盐不会出现在页面、日志或文档中。</li>
            <li>连续失败的登录尝试会被限流。</li>
            <li>所有敏感操作都会写入审计日志。</li>
          </ul>
        </div>
        <div class="card sec__note">
          <p class="sec__note-title"><AppIcon name="key" :size="15" />忘了密码？</p>
          <p class="small muted">
            请在服务器上使用仓库提供的 <code class="mono">pnpm run admin</code> 导入或重置命令，
            不要把明文密码写进配置或文档。
          </p>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.sec { display: flex; flex-direction: column; gap: 16px; }
.sec__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sec__title { font-size: var(--text-h2); }
.sec__desc { margin-top: 5px; max-width: 80ch; font-size: var(--text-small); color: var(--text-tertiary); line-height: 1.65; }
.sec__who { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border: 1px solid var(--border-base); border-radius: var(--r-full); background: var(--bg-card); font-size: var(--text-small); font-weight: 600; }
.sec__grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 18px; align-items: start; }
.sec__meter { display: flex; align-items: center; gap: 6px; }
.sec__meter-seg { height: 4px; flex: 1; border-radius: var(--r-full); background: var(--bg-sunken); transition: background-color var(--dur-2) var(--ease-out); }
.sec__meter--danger .sec__meter-seg--on { background: var(--danger-solid); }
.sec__meter--warning .sec__meter-seg--on { background: var(--warning-solid); }
.sec__meter--info .sec__meter-seg--on { background: var(--info-border); }
.sec__meter--success .sec__meter-seg--on { background: var(--success-solid); }
.sec__meter-label { flex: none; margin-left: 6px; font-size: var(--text-micro); color: var(--text-tertiary); }
.sec__aside { display: flex; flex-direction: column; gap: 14px; }
.sec__note { padding: 18px; }
.sec__note-title { display: flex; align-items: center; gap: 8px; font-weight: 640; margin-bottom: 10px; }
.sec__note ul { display: flex; flex-direction: column; gap: 8px; padding-left: 18px; font-size: var(--text-small); color: var(--text-tertiary); line-height: 1.6; }
.sec__note li::marker { color: var(--primary); }

@media (max-width: 1000px) { .sec__grid { grid-template-columns: 1fr; } }
</style>
