import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getStorageJson, setStorageJson } from '@/utils/storage'

const STORAGE_KEY = 'nd-recent-emojis'
const MAX_RECENT = 32

export const useRecentEmojisStore = defineStore('recentEmojis', () => {
  const list = ref<string[]>(getStorageJson<string[]>(STORAGE_KEY, []))

  function save() {
    setStorageJson(STORAGE_KEY, list.value)
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
