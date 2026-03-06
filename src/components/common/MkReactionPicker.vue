<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ServerEmoji } from '@/adapters/types'
import { emojiCharByCategory, unicodeEmojiCategories } from '@/data/emojilist'
import { useEmojisStore } from '@/stores/emojis'
import { useRecentEmojisStore } from '@/stores/recentEmojis'
import { char2twemojiUrl } from '@/utils/twemoji'
import MkReactionPickerSection from './MkReactionPickerSection.vue'

const props = withDefaults(
  defineProps<{
    serverHost: string
    pinnedEmojis?: string[]
  }>(),
  {
    pinnedEmojis: () => [
      '👍',
      '❤️',
      '😆',
      '🤔',
      '😮',
      '🎉',
      '💢',
      '😥',
      '😇',
      '🍮',
    ],
  },
)

const emit = defineEmits<{
  pick: [reaction: string]
}>()

const emojisStore = useEmojisStore()
const recentEmojisStore = useRecentEmojisStore()
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

// Custom emojis organized by category
const customEmojis = computed(() => emojisStore.getEmojiList(props.serverHost))

const customEmojisByCategory = computed(() => {
  const groups = new Map<string, ServerEmoji[]>()
  for (const emoji of customEmojis.value) {
    const cat = emoji.category || 'その他'
    const list = groups.get(cat)
    if (list) list.push(emoji)
    else groups.set(cat, [emoji])
  }
  return groups
})

// Search results
const searchResults = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return null

  const customResults: ServerEmoji[] = []
  const unicodeResults: string[] = []

  // Custom emoji search (multi-stage: exact → startsWith → includes)
  const seen = new Set<string>()
  const allCustom = customEmojis.value

  // Exact match
  for (const e of allCustom) {
    if (e.name === q) {
      seen.add(e.name)
      customResults.push(e)
    }
  }
  // startsWith
  if (customResults.length < 100) {
    for (const e of allCustom) {
      if (seen.has(e.name)) continue
      if (e.name.startsWith(q) || e.aliases.some((a) => a.startsWith(q))) {
        seen.add(e.name)
        customResults.push(e)
        if (customResults.length >= 100) break
      }
    }
  }
  // includes
  if (customResults.length < 100) {
    for (const e of allCustom) {
      if (seen.has(e.name)) continue
      if (e.name.includes(q) || e.aliases.some((a) => a.includes(q))) {
        seen.add(e.name)
        customResults.push(e)
        if (customResults.length >= 100) break
      }
    }
  }

  // Unicode emoji search by name (we don't have name data, search by char matching)
  // For now, limit unicode search results
  for (const [, emojis] of emojiCharByCategory) {
    for (const char of emojis) {
      if (unicodeResults.length >= 100) break
    }
    if (unicodeResults.length >= 100) break
  }

  return { custom: customResults, unicode: unicodeResults }
})

// Recently used emojis with resolved URLs for custom ones
const recentEmojis = computed(() => recentEmojisStore.list)

function resolveEmojiUrl(reaction: string): string | null {
  if (reaction.startsWith(':') && reaction.endsWith(':')) {
    const shortcode = reaction.slice(1, -1)
    return emojisStore.resolve(props.serverHost, shortcode)
  }
  return null
}

function isCustomEmoji(reaction: string): boolean {
  return reaction.startsWith(':') && reaction.endsWith(':')
}

function pickEmoji(emoji: string) {
  recentEmojisStore.add(emoji, props.pinnedEmojis)
  emit('pick', emoji)
}

function pickCustom(name: string) {
  const key = `:${name}:`
  recentEmojisStore.add(key, props.pinnedEmojis)
  emit('pick', key)
}

function pickPinnedOrRecent(reaction: string) {
  recentEmojisStore.add(reaction, props.pinnedEmojis)
  emit('pick', reaction)
}

function onMounted() {
  nextTick(() => searchInput.value?.focus())
}

defineExpose({ onMounted })
</script>

<template>
  <div class="reaction-picker-panel" @click.stop>
    <!-- Search (top when has query, bottom otherwise via CSS order) -->
    <div class="picker-search" :class="{ 'has-query': searchQuery.length > 0 }">
      <input
        ref="searchInput"
        v-model="searchQuery"
        class="picker-search-input"
        type="text"
        placeholder="絵文字を検索..."
        @click.stop
      />
    </div>

    <!-- Scrollable area -->
    <div class="picker-scroll">
      <!-- Search results -->
      <template v-if="searchResults">
        <div v-if="searchResults.custom.length === 0 && searchResults.unicode.length === 0" class="picker-empty">
          絵文字が見つかりません
        </div>
        <template v-else>
          <div v-if="searchResults.custom.length > 0" class="picker-grid">
            <button
              v-for="emoji in searchResults.custom"
              :key="emoji.name"
              class="picker-emoji-btn"
              :title="`:${emoji.name}:`"
              @click="pickCustom(emoji.name)"
            >
              <img :src="emoji.url" :alt="emoji.name" class="picker-custom-img" loading="lazy" />
            </button>
          </div>
        </template>
      </template>

      <!-- Normal view (no search) -->
      <template v-else>
        <!-- Pinned reactions -->
        <div v-if="pinnedEmojis.length > 0" class="picker-pinned">
          <div class="picker-grid">
            <button
              v-for="reaction in pinnedEmojis"
              :key="reaction"
              class="picker-emoji-btn"
              :title="reaction"
              @click="pickPinnedOrRecent(reaction)"
            >
              <img
                v-if="isCustomEmoji(reaction)"
                :src="resolveEmojiUrl(reaction) ?? ''"
                :alt="reaction"
                class="picker-custom-img"
                loading="lazy"
              />
              <img
                v-else
                :src="char2twemojiUrl(reaction)"
                :alt="reaction"
                class="picker-twemoji"
                decoding="async"
                loading="lazy"
              />
            </button>
          </div>
        </div>

        <!-- Recently used -->
        <MkReactionPickerSection
          v-if="recentEmojis.length > 0"
          label="最近使った絵文字"
          :count="recentEmojis.length"
        >
          <div class="picker-grid">
            <button
              v-for="reaction in recentEmojis"
              :key="reaction"
              class="picker-emoji-btn"
              :title="reaction"
              @click="pickPinnedOrRecent(reaction)"
            >
              <img
                v-if="isCustomEmoji(reaction)"
                :src="resolveEmojiUrl(reaction) ?? ''"
                :alt="reaction"
                class="picker-custom-img"
                loading="lazy"
              />
              <img
                v-else
                :src="char2twemojiUrl(reaction)"
                :alt="reaction"
                class="picker-twemoji"
                decoding="async"
                loading="lazy"
              />
            </button>
          </div>
        </MkReactionPickerSection>

        <!-- Custom emojis by category -->
        <template v-if="customEmojisByCategory.size > 0">
          <MkReactionPickerSection
            v-for="[category, emojis] in customEmojisByCategory"
            :key="category"
            :label="category"
            :count="emojis.length"
            :initial-open="false"
          >
            <div class="picker-grid">
              <button
                v-for="emoji in emojis"
                :key="emoji.name"
                class="picker-emoji-btn"
                :title="`:${emoji.name}:`"
                @click="pickCustom(emoji.name)"
              >
                <img :src="emoji.url" :alt="emoji.name" class="picker-custom-img" loading="lazy" />
              </button>
            </div>
          </MkReactionPickerSection>
        </template>

        <!-- Unicode emojis by category -->
        <MkReactionPickerSection
          v-for="category in unicodeEmojiCategories"
          :key="category"
          :label="category"
          :count="emojiCharByCategory.get(category)?.length"
          :initial-open="false"
        >
          <div class="picker-grid">
            <button
              v-for="emoji in emojiCharByCategory.get(category)"
              :key="emoji"
              class="picker-emoji-btn"
              @click="pickEmoji(emoji)"
            >
              <img :src="char2twemojiUrl(emoji)" :alt="emoji" class="picker-twemoji" decoding="async" loading="lazy" />
            </button>
          </div>
        </MkReactionPickerSection>
      </template>
    </div>
  </div>
</template>

<style scoped>
.reaction-picker-panel {
  display: flex;
  flex-direction: column;
  width: 320px;
  max-height: 360px;
  overflow: hidden;
}

.picker-search {
  padding: 8px;
  flex-shrink: 0;
  order: 1;
  border-top: 1px solid var(--nd-divider);
}

.picker-search.has-query {
  order: -1;
  border-top: none;
  border-bottom: 1px solid var(--nd-divider);
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
  scrollbar-width: none;
}

.picker-pinned {
  padding-bottom: 4px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--nd-divider);
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

.picker-emoji-btn:active {
  background: var(--nd-accent);
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
