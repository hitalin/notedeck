<script setup lang="ts">
import type { NormalizedUser, ServerEmoji } from '@/adapters/types'
import type {
  AutocompleteCandidate,
  TriggerType,
} from '@/composables/useAutocomplete'

defineProps<{
  type: TriggerType
  candidates: AutocompleteCandidate[]
  selectedIndex: number
  isSearching: boolean
}>()

const emit = defineEmits<{
  select: [index: number]
}>()

function isEmoji(candidate: AutocompleteCandidate): candidate is ServerEmoji {
  return typeof candidate === 'object' && 'url' in candidate
}

function isUser(candidate: AutocompleteCandidate): candidate is NormalizedUser {
  return typeof candidate === 'object' && 'username' in candidate
}
</script>

<template>
  <div class="autocomplete-popup" @click.stop>
    <div v-if="candidates.length > 0" class="autocomplete-list">
      <button
        v-for="(candidate, i) in candidates"
        :key="i"
        class="_button autocomplete-item"
        :class="{ selected: i === selectedIndex }"
        @click="emit('select', i)"
        @mousedown.prevent
      >
        <!-- Emoji -->
        <template v-if="type === ':' && isEmoji(candidate)">
          <img :src="candidate.url" :alt="candidate.name" class="ac-emoji-img" loading="lazy" />
          <span class="ac-emoji-name">:{{ candidate.name }}:</span>
        </template>

        <!-- Mention -->
        <template v-else-if="type === '@' && isUser(candidate)">
          <img
            v-if="candidate.avatarUrl"
            :src="candidate.avatarUrl"
            class="ac-user-avatar"
          />
          <div class="ac-user-info">
            <span class="ac-user-name">{{ candidate.name || candidate.username }}</span>
            <span class="ac-user-acct">@{{ candidate.username }}<template v-if="candidate.host">@{{ candidate.host }}</template></span>
          </div>
        </template>

        <!-- Hashtag -->
        <template v-else-if="type === '#'">
          <i class="ti ti-hash ac-hashtag-icon" />
          <span class="ac-hashtag-name">{{ candidate }}</span>
        </template>

        <!-- MFM function -->
        <template v-else-if="type === '$['">
          <i class="ti ti-sparkles ac-mfm-icon" />
          <span class="ac-mfm-name">${{ '[' }}{{ candidate }} ]</span>
        </template>
      </button>
    </div>
    <div v-else-if="isSearching" class="autocomplete-status">検索中...</div>
  </div>
</template>

<style scoped>
.autocomplete-popup {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 20;
  margin-top: 4px;
  background: color-mix(in srgb, var(--nd-popup) 85%, transparent);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(16px);
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
}

.autocomplete-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 0.85em;
  text-align: left;
}

.autocomplete-item:hover,
.autocomplete-item.selected {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.1));
}

.ac-emoji-img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.ac-emoji-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ac-user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 100%;
  object-fit: cover;
}

.ac-user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ac-user-name {
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ac-user-acct {
  font-size: 0.85em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ac-hashtag-icon {
  opacity: 0.5;
}

.ac-hashtag-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ac-mfm-icon {
  opacity: 0.5;
}

.ac-mfm-name {
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.autocomplete-status {
  padding: 12px;
  text-align: center;
  font-size: 0.8em;
  opacity: 0.6;
}
</style>
