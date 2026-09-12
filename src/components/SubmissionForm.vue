<script setup lang="ts">
import { ref } from 'vue'
import RepositoryForm from './RepositoryForm.vue'
import UploadForm from './UploadForm.vue'
import { navigateTabs } from '../composables/tabs'
defineProps<{ studio?: boolean }>()
const emit = defineEmits<{ submitted: []; mode: [value: string] }>()
const mode = ref('github')
function choose(value: string) { mode.value = value; emit('mode', value) }
</script>
<template>
  <div class="submission-form">
    <nav class="tabs" role="tablist" aria-label="投稿方式" @keydown="navigateTabs">
      <button v-for="item in [{ key: 'github', label: 'GitHub 仓库' }, { key: 'upload', label: '直接上传 IPK' }]" :id="`submit-tab-${item.key}`" :key="item.key" type="button" role="tab" class="tabs__item" :aria-selected="mode === item.key" :tabindex="mode === item.key ? 0 : -1" :aria-controls="`submit-panel-${item.key}`" @click="choose(item.key)">{{ item.label }}</button>
    </nav>
    <section v-show="mode === 'github'" id="submit-panel-github" role="tabpanel" aria-labelledby="submit-tab-github"><RepositoryForm :studio="studio" @submitted="emit('submitted')" /></section>
    <section v-show="mode === 'upload'" id="submit-panel-upload" role="tabpanel" aria-labelledby="submit-tab-upload"><UploadForm :studio="studio" @submitted="emit('submitted')" /></section>
  </div>
</template>
<style scoped>
.submission-form { display: flex; flex-direction: column; gap: 24px; min-width: 0; }
</style>
