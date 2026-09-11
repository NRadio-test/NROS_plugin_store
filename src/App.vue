<script setup lang="ts">
import { onMounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import AppFooter from './components/AppFooter.vue'
import AppToaster from './components/AppToaster.vue'
import { loadSession } from './lib/api'

onMounted(loadSession)
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
