<script setup lang="ts">
import { ref } from 'vue'
import { session } from '../lib/api'
import SubmissionForm from '../components/SubmissionForm.vue'
import AppIcon from '../components/AppIcon.vue'
import AppButton from '../components/AppButton.vue'

const mode = ref('github')
</script>

<template>
  <div class="submit">
    <section class="submit__hero">
      <div class="container submit__hero-inner">
        <h1 class="submit__title">提交插件</h1>
        <p class="submit__lead">选择提交方式。每个版本通过人工审核后上架。</p>
      </div>
    </section>

    <div class="container submit__body">
      <div class="submit__main">
        <p v-if="!session.loaded" class="loading-row"><span class="spinner" />正在检查会话…</p>
        <div v-else-if="!session.user" class="card card--pad submit__gate">
          <span class="submit__gate-icon"><AppIcon name="lock" :size="20" /></span>
          <div>
            <h2 class="submit__gate-title">请先登录</h2>
          </div>
          <AppButton to="/login?next=/submit" variant="primary" icon="user">{{ session.ssoEnabled ? '登录' : '手机号进入' }}</AppButton>
        </div>
        <div v-else class="card card--pad">
          <SubmissionForm @mode="mode = $event" />
        </div>
      </div>
      <aside class="submit__aside">
        <h2 class="submit__aside-title">{{ mode === 'upload' ? '准备安装包' : '准备仓库' }}</h2>
        <ul v-if="mode === 'upload'"><li>填写名称、简介和使用教程。</li><li>支持 .ipk 文件，最大 32 MiB。</li><li>版本与架构从包内读取，无需另填。</li></ul>
        <ul v-else><li>提供 GitHub 公开仓库。</li><li>填写仓库 description 和 README。</li><li>在正式 Release 中上传 .ipk；不支持草稿和预发布。</li></ul>
        <div class="submit__after"><h2>提交后</h2><p>在<RouterLink to="/me">我的提交</RouterLink>查看进度和退回原因。更新版本也需要审核，已上架的旧版本会继续保留。</p></div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.submit__hero-inner { padding: 32px 0 24px; }
.submit__title { margin: 0; }
.submit__lead { margin-top: 8px; font-size: var(--fs-sm); color: var(--text-2); }
.submit__body { display: grid; grid-template-columns: minmax(0, 680px) minmax(0, 1fr); gap: 40px; align-items: start; }
.submit__main { min-width: 0; }
.submit__main > .card { padding: 24px; }
.submit__gate { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.submit__gate-icon { display: flex; color: var(--text-2); }
.submit__gate-title { font-size: 16px; }
.submit__gate > div { flex: 1; }
.submit__aside { padding: 8px 0; color: var(--text-2); font-size: var(--fs-sm); }
.submit__aside h2 { font-size: var(--fs-sm); font-weight: 600; color: var(--text); margin-bottom: 12px; }
.submit__aside ul { padding-left: 18px; list-style: disc; line-height: 1.8; }
.submit__aside li + li { margin-top: 8px; }
.submit__after { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--line); }
.submit__after p { line-height: 1.8; }
.submit__after a { color: var(--signal-text); text-decoration: underline; text-underline-offset: 3px; }
@media (max-width: 900px) { .submit__body { grid-template-columns: 1fr; gap: 24px; max-width: 680px; } }
@media (max-width: 767px) { .submit__hero-inner { padding: 24px 0 20px; } .submit__main > .card { padding: 20px 16px; } .submit__gate .btn { width: 100%; } }
</style>
