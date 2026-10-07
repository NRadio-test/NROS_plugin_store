<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import AppToaster from './components/AppToaster.vue'
import { loadSession, session } from './lib/api'

let accountRefresh: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void loadSession(true)
  document.addEventListener('visibilitychange', refreshOnFocus)
  accountRefresh = setInterval(() => {
    if (document.visibilityState === 'visible' && session.ssoEnabled && session.user) void loadSession()
  }, 60000)
})
function refreshOnFocus() {
  if (document.visibilityState !== 'visible') return
  sessionStorage.removeItem('plugin-sso-checked')
  void loadSession(true)
}
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', refreshOnFocus)
  clearInterval(accountRefresh)
})
</script>

<template>
  <a class="skip-link" href="#main">跳到主要内容</a>
  <AppHeader />
  <main id="main" tabindex="-1" class="app-main"><RouterView /></main>
  <AppFooter />
  <AppToaster />
</template>

<style scoped>
.app-main { display: block; flex: 1; min-width: 0; padding-bottom: var(--sp-12); }
.app-main:focus { outline: none; }
</style>
