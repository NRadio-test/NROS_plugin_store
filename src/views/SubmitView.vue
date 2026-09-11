<script setup lang="ts">
import { session } from '../lib/api'
import RepositoryForm from '../components/RepositoryForm.vue'
import AppIcon from '../components/AppIcon.vue'
import AppButton from '../components/AppButton.vue'

const steps = [
  { title: '准备公开仓库', text: '仓库需要真实的 GitHub description、README、源码与许可说明。', icon: 'git-branch' as const },
  { title: '发布正式 Release', text: '由你在 GitHub 构建 .ipk 并上传到正式 Release；多架构请分别命名。', icon: 'package' as const },
  { title: '等待自动审核', text: '后台读取仓库与 Release 快照，静态解析安装包；通过后自动上架。', icon: 'shield-check' as const },
  { title: '持续同步更新', text: '每天两次检查仓库变化，新版本需要重新通过审核才会替换下载。', icon: 'refresh' as const },
]
</script>

<template>
  <div class="submit">
    <section class="submit__hero">
      <div class="container submit__hero-inner">
        <h1 class="submit__title">提交一个插件</h1>
        <p class="submit__lead">
          提供公开 GitHub 仓库链接，安装包继续由作者发布在 Release。提交后，审核与上架将在后台完成。
        </p>
      </div>
    </section>

    <div class="container submit__body">
      <div class="submit__main">
        <p v-if="!session.loaded" class="loading-row"><span class="spinner" />正在检查会话…</p>
        <div v-else-if="!session.user" class="card card--pad submit__gate">
          <span class="submit__gate-icon"><AppIcon name="lock" :size="20" /></span>
          <div>
            <h2 class="submit__gate-title">先进入你的插件档案</h2>
            <p class="muted small">提交插件需要手机号识别档案，用于在个人中心跟进审核状态。</p>
          </div>
          <AppButton to="/login?next=/submit" variant="primary" icon="user">手机号进入</AppButton>
        </div>
        <div v-else class="card card--pad">
          <RepositoryForm />
        </div>

        <section class="submit__steps">
          <h2 class="submit__section-title">提交之后会发生什么</h2>
          <ol class="submit__timeline">
            <li v-for="(step, index) in steps" :key="step.title">
              <span class="submit__step-marker">{{ index + 1 }}</span>
              <div>
                <p class="submit__step-title"><AppIcon :name="step.icon" :size="15" />{{ step.title }}</p>
                <p class="submit__step-text">{{ step.text }}</p>
              </div>
            </li>
          </ol>
        </section>
      </div>

      <aside class="submit__aside">
        <div class="card submit__aside-card">
          <p class="submit__aside-title"><AppIcon name="check-circle" :size="15" />收录要求</p>
          <ul>
            <li>GitHub 公开仓库；同一仓库无需重复提交</li>
            <li>正式 Release 中直接上传的 .ipk 附件</li>
            <li>可读的源码与构建配置，便于建立二进制关联</li>
            <li>仓库 description 与真实 README</li>
          </ul>
        </div>
        <div class="card submit__aside-card">
          <p class="submit__aside-title"><AppIcon name="x-circle" :size="15" />不会被收录</p>
          <ul>
            <li>私有仓库、源码压缩包或网盘地址</li>
            <li>只有 draft / prerelease 的版本</li>
            <li>缺少 README、源码或安装包的仓库</li>
            <li>包含欺骗、垃圾或恶意行为的插件</li>
          </ul>
        </div>
        <div class="card submit__aside-card submit__aside-card--note">
          <p class="submit__aside-title"><AppIcon name="info" :size="15" />作者须知</p>
          <p class="small">
            构建、发布、Issue 与 PR 都在 GitHub 由作者和用户处理。商店不代替作者构建，也不接管仓库的任何权限。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.submit__hero { background: transparent; }
.submit__hero-inner { padding: var(--sp-10) 0 var(--sp-6); }
.submit__title { margin: 0; }
.submit__lead { margin-top: 14px; font-size: var(--fs-body); max-width: 68ch; color: var(--text-secondary); line-height: 1.75; }
.submit__body { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 24px; padding-top: 0; align-items: start; }
.submit__main { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
.submit__gate { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.submit__gate-icon { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: var(--r-md); background: var(--primary-surface); color: var(--primary-text); flex: none; }
.submit__gate-title { font-size: var(--text-h3); margin-bottom: 3px; }
.submit__gate > div { flex: 1; min-width: 200px; }
.submit__steps { padding: var(--sp-2) 0; }
.submit__section-title { font-size: var(--text-h3); margin-bottom: 18px; }
.submit__timeline { display: flex; flex-direction: column; gap: 0; list-style: none; }
.submit__timeline li { position: relative; display: flex; gap: 14px; padding-bottom: 22px; }
.submit__timeline li::before { content: ''; position: absolute; left: 13px; top: 30px; bottom: 0; width: 1px; background: var(--border-base); }
.submit__timeline li:last-child { padding-bottom: 0; }
.submit__timeline li:last-child::before { display: none; }
.submit__step-marker {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: 27px; height: 27px;
  border-radius: var(--r-full);
  border: 1px solid var(--primary-border);
  background: var(--primary-surface);
  color: var(--primary-text);
  font-size: var(--text-small);
  font-weight: 680;
}
.submit__step-title { display: flex; align-items: center; gap: 7px; font-weight: 640; }
.submit__step-text { margin-top: 3px; font-size: var(--fs-body); color: var(--text-tertiary); line-height: 1.65; }
.submit__aside { display: flex; flex-direction: column; gap: 16px; position: sticky; top: calc(var(--header-h) + 18px); }
.submit__aside-card { padding: var(--sp-5); box-shadow: none; }
.submit__aside-title { display: flex; align-items: center; gap: 8px; font-weight: 640; margin-bottom: 12px; }
.submit__aside-card ul { display: flex; flex-direction: column; gap: 9px; padding-left: 18px; list-style: disc; font-size: var(--fs-body); color: var(--text-tertiary); line-height: 1.6; }
.submit__aside-card li::marker { color: var(--primary); }
.submit__aside-card--note { background: var(--bg-subtle); }

@media (max-width: 1000px) {
  .submit__body { grid-template-columns: 1fr; }
  .submit__aside { position: static; }
}
@media (max-width: 767px) {
  .submit__hero-inner { padding: var(--sp-6) 0; }
  .submit__gate .btn { width: 100%; }
  .submit__lead { font-size: var(--text-body); }
}
</style>
