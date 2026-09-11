/** 主题：跟随系统偏好，用户手动选择后以本地存储为准。 */
import { ref, watch } from 'vue'

const STORAGE_KEY = 'theme-preference'

function readSaved(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

const saved = readSaved()
export const isDarkMode = ref(saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches)

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#080b12' : '#ffffff')
}

watch(isDarkMode, dark => {
  applyTheme(dark)
  try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light') } catch { /* 隐私模式下仍可切换本次主题。 */ }
}, { immediate: true })

export const toggleTheme = () => { isDarkMode.value = !isDarkMode.value }
