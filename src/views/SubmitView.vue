<script setup lang="ts">
import { loadSession, session } from '../lib/api'
import SubmissionForm from '../components/SubmissionForm.vue'
import AppIcon from '../components/AppIcon.vue'
import AppButton from '../components/AppButton.vue'

</script>

<template>
  <div class="submit">
    <section class="submit__hero">
      <div class="container submit__hero-inner">
        <h1 class="submit__title">提交插件</h1>
      </div>
    </section>

    <div class="container submit__body">
      <div class="submit__main">
        <p v-if="!session.loaded" class="loading-row"><span class="spinner" />加载中…</p>
        <div v-else-if="session.error" class="card card--pad submit__gate">
          <p role="alert">{{ session.error }}</p>
          <AppButton @click="loadSession()">重试</AppButton>
        </div>
        <div v-else-if="!session.user" class="card card--pad submit__gate">
          <span class="submit__gate-icon"><AppIcon name="lock" :size="20" /></span>
          <div>
            <h2 class="submit__gate-title">请先登录</h2>
          </div>
          <AppButton to="/login?next=/submit" variant="primary" icon="user">{{ session.ssoEnabled ? '登录' : '手机号进入' }}</AppButton>
        </div>
        <div v-else class="card card--pad">
          <SubmissionForm />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.submit__hero-inner { max-width: 680px; padding: 32px 0 24px; }
.submit__title { margin: 0; letter-spacing: -0.04em; }
.submit__body { max-width: 680px; }
.submit__main { min-width: 0; }
.submit__main > .card { padding: 32px; border-top: 2px solid var(--signal); }
.submit__gate { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.submit__gate-icon { display: flex; color: var(--text-2); }
.submit__gate-title { font-size: 16px; }
.submit__gate > div { flex: 1; }
@media (max-width: 767px) { .submit__hero-inner { padding: 24px 0 20px; } .submit__main > .card { padding: 20px 16px; } .submit__gate .btn { width: 100%; } }
</style>
