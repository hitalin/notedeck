import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'nd-recent-emojis'
const MAX_RECENT = 32

export const useRecentEmojisStore = defineStore('recentEmojis', () => {
  const list = ref<string[]>(load())

  function load(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    } catch {
      /* ignore */
    }
    return []
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.value))
  }

  function add(emoji: string, pinnedList: string[]) {
    if (pinnedList.includes(emoji)) return
    const next = list.value.filter((e) => e !== emoji)
    next.unshift(emoji)
    list.value = next.slice(0, MAX_RECENT)
    save()
  }

  return { list, add }
})
