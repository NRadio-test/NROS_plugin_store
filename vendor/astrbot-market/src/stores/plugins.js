import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'

export const usePluginStore = defineStore('plugins', () => {
  const savedTheme = localStorage.getItem('theme-preference')
  const plugins = ref(null)
  const searchQuery = ref('')
  const selectedTag = ref(null)
  const currentPage = ref(1)
  const pageSize = ref(12)
  const isDarkMode = ref(savedTheme === 'dark')
  const isLoading = ref(true)
  const sortBy = ref('default') 
  const randomSeed = ref(0)
  
  watch(isDarkMode, (newValue) => {
    localStorage.setItem('theme-preference', newValue ? 'dark' : 'light')
  })

  watch(sortBy, (value) => {
    if (value === 'random') {
      randomSeed.value = Math.random()
    }
  })

  const toggleTheme = () => {
    isDarkMode.value = !isDarkMode.value
  }

  function stableHash(input, seedNumber) {
    let h = (Math.floor(seedNumber * 1e9) ^ 5381) >>> 0
    for (let i = 0; i < input.length; i += 1) {
      h = (((h << 5) + h) + input.charCodeAt(i)) >>> 0 
    }
    return h >>> 0
  }

  const allTags = computed(() => {
    const tags = new Set()
    if (plugins.value) {
      plugins.value.forEach(plugin => {
        if (plugin.tags) {
          plugin.tags.forEach(tag => tags.add(tag))
        }
      })
    }
    return Array.from(tags).sort()
  })

  const tagOptions = computed(() => 
    allTags.value.map(tag => ({ label: tag, value: tag }))
  )

  const filteredPlugins = computed(() => {
    if (!plugins.value) return []
    
    let filtered = plugins.value.filter(plugin => {
      const searchValue = searchQuery.value ? searchQuery.value.toLowerCase() : ''
      if (!searchValue && !selectedTag.value) return true
      
      const matchesSearch = !searchValue || 
        (plugin.name && plugin.name.toLowerCase().includes(searchValue)) ||
        (plugin.display_name && plugin.display_name.toLowerCase().includes(searchValue)) ||
        (plugin.id && plugin.id.toLowerCase().includes(searchValue)) ||
        (plugin.desc && plugin.desc.toLowerCase().includes(searchValue)) ||
        (plugin.author && plugin.author.toLowerCase().includes(searchValue))
      
      const matchesTag = !selectedTag.value || 
        (Array.isArray(plugin.tags) && plugin.tags.includes(selectedTag.value))
      
      return matchesSearch && matchesTag
    })

    if (sortBy.value === 'stars') {
      filtered.sort((a, b) => (b.stars || 0) - (a.stars || 0))
    } else if (sortBy.value === 'updated') {
      filtered.sort((a, b) => {
        const dateA = a.updated_at ? new Date(a.updated_at) : new Date(0)
        const dateB = b.updated_at ? new Date(b.updated_at) : new Date(0)
        return dateB - dateA
      })
    } else if (sortBy.value === 'random') {
      filtered.sort((a, b) => {
        const ha = stableHash(a.id || a.name || '', randomSeed.value)
        const hb = stableHash(b.id || b.name || '', randomSeed.value)
        return ha - hb
      })
    } else {
      filtered.sort((a, b) => {
        const indexA = plugins.value.findIndex(p => (p.id || p.name) === (a.id || a.name))
        const indexB = plugins.value.findIndex(p => (p.id || p.name) === (b.id || b.name))
        return indexA - indexB
      })
    }

    return filtered
  })

  const totalPages = computed(() => {
    if (sortBy.value === 'random') {
      return filteredPlugins.value.length > 0 ? 1 : 0
    }
    return Math.ceil(filteredPlugins.value.length / pageSize.value)
  })

  const paginatedPlugins = computed(() => {
    if (sortBy.value === 'random') {
      return filteredPlugins.value.slice(0, pageSize.value)
    }
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return filteredPlugins.value.slice(start, end)
  })

  async function loadPlugins() {
    isLoading.value = true
    try {
      const response = await fetch('https://api.soulter.top/astrbot/plugins', { cache: 'no-store' })
      const data = await response.json()
      plugins.value = Object.entries(data).map(([keyName, details]) => {
        const tags = details.tags ? 
          (Array.isArray(details.tags) ? details.tags : [details.tags]) 
          : []
        const machineName = keyName
        const displayName = details.display_name || details.name || machineName

        return {
          ...details,
          id: machineName,
          name: displayName,          
          display_name: displayName,  
          tags
        }
      })
    } catch (error) {
      console.error('Error loading plugins:', error)
      plugins.value = []
    } finally {
      isLoading.value = false
    }
  }

  function setDarkMode(value) {
    isDarkMode.value = value
  }

  function setSearchQuery(query) {
    searchQuery.value = query
  }

  function setSelectedTag(tag) {
    selectedTag.value = tag
  }

  function setCurrentPage(page) {
    currentPage.value = page
  }

  function setSortBy(value) {
    sortBy.value = value
    if (value === 'random') {
      randomSeed.value = Math.random()
    }
    currentPage.value = 1
  }

  function refreshRandomOrder() {
    if (sortBy.value === 'random') {
      randomSeed.value = Math.random()
    }
  }

  return {
    // 状态
    plugins,
    searchQuery,
    selectedTag,
    currentPage,
    isDarkMode,
    sortBy,
    isLoading,
    randomSeed,
    // 计算属性
    allTags,
    tagOptions,
    filteredPlugins,
    totalPages,
    paginatedPlugins,
    // 动作
    loadPlugins,
    setDarkMode,
    setSearchQuery,
    setSelectedTag,
    setCurrentPage,
    setSortBy,
    toggleTheme,
    refreshRandomOrder
  }
})
