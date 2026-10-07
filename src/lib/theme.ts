/** 目录明暗主题；尊重已有偏好及系统设置。 */
import { ref, watch } from 'vue'

const STORAGE_KEY = 'theme-preference'

function readSaved(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

const saved = readSaved()
export const isDarkMode = ref(saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches)

function applyTheme(dark: boolean) {
  const root = document.documentElement
  root.setAttribute('data-theme', dark ? 'dark' : 'light')
  root.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#141915' : '#f4f3ec')
}

watch(isDarkMode, dark => {
  applyTheme(dark)
  try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light') } catch { /* 隐私模式下仍可切换本次主题。 */ }
}, { immediate: true })

export const toggleTheme = () => { isDarkMode.value = !isDarkMode.value }
