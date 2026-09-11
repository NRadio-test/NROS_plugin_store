import { createRouter, createWebHistory } from 'vue-router'

const DEFAULT_DESCRIPTION = '浏览并下载通过自动静态审核的 GitHub Release IPK 插件；源码与安装包始终由作者发布在 GitHub。'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/MarketView.vue'), meta: { title: '插件市场' } },
    { path: '/plugins/:id', component: () => import('./views/DetailView.vue'), meta: { title: '插件详情' } },
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { title: '手机号识别', private: true } },
    { path: '/submit', component: () => import('./views/SubmitView.vue'), meta: { title: '提交插件', private: true } },
    { path: '/me', component: () => import('./views/MeView.vue'), meta: { title: '个人中心', private: true } },
    { path: '/studio', component: () => import('./views/StudioView.vue'), meta: { title: 'Studio', private: true } },
    { path: '/:pathMatch(.*)*', component: () => import('./views/NotFoundView.vue'), meta: { title: '页面不存在', private: true } },
  ],
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash, top: 88, behavior: 'smooth' }
    return to.path === from.path ? {} : { top: 0 }
  },
})

export function setMetadata(title: string, description = DEFAULT_DESCRIPTION) {
  document.title = `${title} · 张导插件商店`
  document.querySelector('meta[name="description"]')?.setAttribute('content', description)
}

router.afterEach(to => {
  setMetadata(String(to.meta.title || '张导插件商店'))
  document.querySelector('meta[name="robots"]')?.setAttribute('content', to.meta.private ? 'noindex,nofollow' : 'index,follow')
  requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }))
})
