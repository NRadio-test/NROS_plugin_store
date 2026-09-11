<script setup lang="ts">
import { session } from '../lib/api'
import AppIcon from './AppIcon.vue'
import AppButton from './AppButton.vue'
</script>

<template>
  <section class="sec">
    <header class="sec__head">
      <div>
        <h2 class="sec__title">账号安全</h2>
        <p class="sec__desc">密码由留言箱统一管理。</p>
      </div>
      <span class="sec__who"><AppIcon name="user" :size="15" />{{ session.admin?.username }}</span>
    </header>
    <div class="sec__grid">
      <article class="card">
        <header class="card__head">
          <div>
            <p class="card__title">修改管理员密码</p>
          </div>
        </header>
        <div class="card__body">
          <AppButton variant="primary" icon="lock" href="https://msg.zdwifi.com/studio">前往留言箱修改密码</AppButton>
        </div>
      </article>
      <aside class="sec__aside">
        <div class="card sec__note">
          <p class="sec__note-title"><AppIcon name="shield-check" :size="15" />登录说明</p>
          <ul>
            <li>商店与留言箱分别登录、分别退出。</li>
            <li>忘记密码请走留言箱的恢复流程。</li>
          </ul>
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
.sec__aside { display: flex; flex-direction: column; gap: 14px; }
.sec__note { padding: 18px; }
.sec__note-title { display: flex; align-items: center; gap: 8px; font-weight: 640; margin-bottom: 10px; }
.sec__note ul { list-style: disc; display: flex; flex-direction: column; gap: 8px; padding-left: 18px; font-size: var(--text-small); color: var(--text-tertiary); line-height: 1.6; }
.sec__note li::marker { color: var(--primary); }

@media (max-width: 1000px) { .sec__grid { grid-template-columns: 1fr; } }
</style>
