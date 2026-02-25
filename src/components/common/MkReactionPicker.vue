<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { useEmojisStore } from '@/stores/emojis'
import { char2twemojiUrl } from '@/utils/twemoji'

const props = defineProps<{
  serverHost: string
}>()

const emit = defineEmits<{
  pick: [reaction: string]
}>()

const emojisStore = useEmojisStore()
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const activeTab = ref<'emoji' | 'custom'>('emoji')

const EMOJI_CATEGORIES = [
  { label: 'Smileys', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥴', '😵', '🤯', '🥳', '🥺', '😢', '😭', '😤', '😡', '🤬', '👿', '💀'] },
  { label: 'Gestures', emojis: ['👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🙏'] },
  { label: 'Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'] },
  { label: 'Objects', emojis: ['🎉', '🎊', '🎈', '🎁', '🏆', '🎵', '🎶', '🔥', '✨', '🌟', '⭐', '💫', '🌈', '☀️', '🌙', '⚡', '💡', '🍮', '🍰', '🍩', '🍪', '🍫', '☕', '🍵', '🍺', '🍻'] },
  { label: 'Symbols', emojis: ['✅', '❌', '⭕', '❗', '❓', '💯', '💢', '💤', '💨', '🔔', '🏳️', '🏴'] },
]

const customEmojis = computed(() => {
  const map = emojisStore.cache.get(props.serverHost)
  if (!map) return []
  return Object.entries(map).map(([name, url]) => ({ name, url }))
})

const filteredCustomEmojis = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return customEmojis.value.slice(0, 100)
  return customEmojis.value.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 100)
})

function pickEmoji(emoji: string) {
  emit('pick', emoji)
}

function pickCustom(name: string) {
  emit('pick', `:${name}:`)
}

function onMounted() {
  nextTick(() => searchInput.value?.focus())
}

defineExpose({ onMounted })
</script>

<template>
  <div class="reaction-picker-panel" @click.stop>
    <!-- Tabs -->
    <div class="picker-tabs">
      <button
        class="picker-tab"
        :class="{ active: activeTab === 'emoji' }"
        @click="activeTab = 'emoji'"
      >
        Unicode
      </button>
      <button
        v-if="customEmojis.length > 0"
        class="picker-tab"
        :class="{ active: activeTab === 'custom' }"
        @click="activeTab = 'custom'"
      >
        Custom ({{ customEmojis.length }})
      </button>
    </div>

    <!-- Search (custom tab) -->
    <div v-if="activeTab === 'custom'" class="picker-search">
      <input
        ref="searchInput"
        v-model="searchQuery"
        class="picker-search-input"
        type="text"
        placeholder="Search emoji..."
        @click.stop
      />
    </div>

    <!-- Unicode emoji grid -->
    <div v-if="activeTab === 'emoji'" class="picker-scroll">
      <div v-for="cat in EMOJI_CATEGORIES" :key="cat.label" class="picker-category">
        <div class="picker-category-label">{{ cat.label }}</div>
        <div class="picker-grid">
          <button
            v-for="emoji in cat.emojis"
            :key="emoji"
            class="picker-emoji-btn"
            @click="pickEmoji(emoji)"
          >
            <img :src="char2twemojiUrl(emoji)" :alt="emoji" class="picker-twemoji" decoding="async" loading="lazy" />
          </button>
        </div>
      </div>
    </div>

    <!-- Custom emoji grid -->
    <div v-if="activeTab === 'custom'" class="picker-scroll">
      <div v-if="filteredCustomEmojis.length === 0" class="picker-empty">
        No emoji found
      </div>
      <div v-else class="picker-grid">
        <button
          v-for="emoji in filteredCustomEmojis"
          :key="emoji.name"
          class="picker-emoji-btn"
          :title="`:${emoji.name}:`"
          @click="pickCustom(emoji.name)"
        >
          <img :src="emoji.url" :alt="emoji.name" class="picker-custom-img" loading="lazy" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reaction-picker-panel {
  display: flex;
  flex-direction: column;
  width: 320px;
  max-height: 360px;
  background: var(--nd-popup);
  border-radius: 12px;
  box-shadow: 0 4px 24px var(--nd-shadow);
  overflow: hidden;
}

.picker-tabs {
  display: flex;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.picker-tab {
  flex: 1;
  padding: 10px;
  border: none;
  background: none;
  font-size: 0.8em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.6;
  cursor: pointer;
  transition: opacity 0.15s, color 0.15s;
}

.picker-tab.active {
  opacity: 1;
  color: var(--nd-accent);
  box-shadow: 0 -2px 0 0 var(--nd-accent) inset;
}

.picker-tab:hover {
  opacity: 1;
}

.picker-search {
  padding: 8px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.picker-search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: 6px;
  background: var(--nd-panel);
  color: var(--nd-fg);
  font-size: 0.85em;
  outline: none;
  box-sizing: border-box;
}

.picker-search-input:focus {
  border-color: var(--nd-accent);
}

.picker-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
}

.picker-category-label {
  font-size: 0.7em;
  font-weight: bold;
  text-transform: uppercase;
  opacity: 0.5;
  padding: 4px 2px 2px;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 40px);
  gap: 2px;
}

.picker-emoji-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  transition: background 0.15s;
}

.picker-emoji-btn:hover {
  background: var(--nd-buttonHoverBg);
}

.picker-twemoji {
  width: 26px;
  height: 26px;
  object-fit: contain;
}

.picker-custom-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.picker-empty {
  padding: 2rem;
  text-align: center;
  color: var(--nd-fg);
  opacity: 0.4;
  font-size: 0.85em;
}
</style>
