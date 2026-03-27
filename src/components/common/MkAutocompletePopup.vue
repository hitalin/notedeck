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

function candidateKey(candidate: AutocompleteCandidate): string {
  if (typeof candidate === 'string') return candidate
  if ('username' in candidate) return candidate.id
  return candidate.name
}
</script>

<template>
  <div :class="$style.autocompletePopup" class="_popup" @click.stop>
    <div v-if="candidates.length > 0" :class="$style.autocompleteList">
      <button
        v-for="(candidate, i) in candidates"
        :key="candidateKey(candidate)"
        :class="[$style.autocompleteItem, i === selectedIndex && $style.selected]"
        class="_button"
        @click="emit('select', i)"
        @mousedown.prevent
      >
        <!-- Emoji -->
        <template v-if="type === ':' && isEmoji(candidate)">
          <img :src="candidate.url" :alt="candidate.name" :class="$style.acEmojiImg" loading="lazy" />
          <span :class="$style.acEmojiName">:{{ candidate.name }}:</span>
        </template>

        <!-- Mention -->
        <template v-else-if="type === '@' && isUser(candidate)">
          <img
            :src="candidate.avatarUrl || '/avatar-default.svg'"
            :class="$style.acUserAvatar"
            @error="(e: Event) => (e.target as HTMLImageElement).src = '/avatar-error.svg'"
          />
          <div :class="$style.acUserInfo">
            <span :class="$style.acUserName">{{ candidate.name || candidate.username }}</span>
            <span :class="$style.acUserAcct">@{{ candidate.username }}<template v-if="candidate.host">@{{ candidate.host }}</template></span>
          </div>
        </template>

        <!-- Hashtag -->
        <template v-else-if="type === '#'">
          <i class="ti ti-hash" :class="$style.acHashtagIcon" />
          <span :class="$style.acHashtagName">{{ candidate }}</span>
        </template>

        <!-- MFM function -->
        <template v-else-if="type === '$['">
          <i class="ti ti-sparkles" :class="$style.acMfmIcon" />
          <span :class="$style.acMfmName">${{ '[' }}{{ candidate }} ]</span>
        </template>
      </button>
    </div>
    <div v-else-if="isSearching" :class="$style.autocompleteStatus">検索中...</div>
  </div>
</template>

<style lang="scss" module>
.autocompletePopup {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 20;
  margin-top: 4px;
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
  animation: acPopupIn 0.1s ease-out;
}

@keyframes acPopupIn {
  from { opacity: 0; }
}

.autocompleteItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--nd-radius-md);
  font-size: 0.85em;
  text-align: left;

  &:hover,
  &.selected {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.1));
  }
}

.acEmojiImg {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.acEmojiName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acUserAvatar {
  width: 28px;
  height: 28px;
  border-radius: 100%;
  object-fit: cover;
}

.acUserInfo {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.acUserName {
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acUserAcct {
  font-size: 0.85em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acHashtagIcon {
  opacity: 0.5;
}

.acHashtagName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acMfmIcon {
  opacity: 0.5;
}

.acMfmName {
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.autocompleteStatus {
  padding: 12px;
  text-align: center;
  font-size: 0.8em;
  opacity: 0.6;
}
</style>
