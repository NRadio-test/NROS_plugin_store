<script setup lang="ts">
import logo from '../assets/nradio-logo.png'
defineProps<{ compact?: boolean }>()
</script>

<template>
  <img :src="logo" alt="NRadio" width="200" height="64" class="brand-logo" :class="compact && 'brand-logo--compact'" decoding="async" />
</template>

<style scoped>
.brand-logo { display: block; flex: none; width: 100px; height: 32px; object-fit: contain; }
.brand-logo--compact { width: 84px; height: 27px; }
:global([data-theme=light] .brand-logo) { filter: brightness(0); }
</style>
