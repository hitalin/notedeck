<script setup lang="ts">
import { computed } from 'vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import { parseMfm } from '@/utils/mfm'
import { useEmojiResolver } from '@/composables/useEmojiResolver'

const props = defineProps<{
  text: string
  emojis?: Record<string, string>
  reactionEmojis?: Record<string, string>
  serverHost?: string
}>()

const { resolveEmoji: resolveEmojiRaw } = useEmojiResolver()

const tokens = computed(() => parseMfm(props.text))

// Pre-compute emoji URLs for all custom emoji tokens to avoid double-call in template
const emojiUrls = computed(() => {
  const urls: Record<string, string | null> = {}
  const emojis = props.emojis ?? {}
  const reactionEmojis = props.reactionEmojis ?? {}
  const host = props.serverHost ?? ''
  for (const token of tokens.value) {
    if (token.type === 'customEmoji' && !(token.shortcode in urls)) {
      urls[token.shortcode] = resolveEmojiRaw(token.shortcode, emojis, reactionEmojis, host)
    }
  }
  return urls
})

function handleLinkClick(e: MouseEvent, url: string) {
  e.preventDefault()
  openUrl(url)
}
</script>

<template>
  <span class="mfm"><template v-for="(token, i) in tokens" :key="i"><a v-if="token.type === 'url'" :href="token.value" class="mfm-url" target="_blank" rel="noopener noreferrer" @click.stop="handleLinkClick($event, token.value)">{{ token.value }}</a><span v-else-if="token.type === 'mention'" class="mfm-mention" @click.stop>{{ token.acct }}</span><span v-else-if="token.type === 'hashtag'" class="mfm-hashtag" @click.stop>#{{ token.value }}</span><b v-else-if="token.type === 'bold'">{{ token.value }}</b><i v-else-if="token.type === 'italic'">{{ token.value }}</i><s v-else-if="token.type === 'strike'">{{ token.value }}</s><code v-else-if="token.type === 'inlineCode'" class="mfm-code">{{ token.value }}</code><img v-else-if="token.type === 'customEmoji' && emojiUrls[token.shortcode]" :src="emojiUrls[token.shortcode]!" :alt="`:${token.shortcode}:`" class="custom-emoji" width="32" height="32" decoding="async" loading="lazy" /><span v-else-if="token.type === 'customEmoji'">:{{ token.shortcode }}:</span><img v-else-if="token.type === 'unicodeEmoji'" :src="token.url" :alt="token.value" class="twemoji" width="20" height="20" decoding="async" loading="lazy" /><template v-else>{{ token.value }}</template></template></span>
</template>

<style scoped>
.mfm {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.mfm-url {
  color: var(--nd-link);
  text-decoration: none;
  word-break: break-all;
}

.mfm-url:hover {
  text-decoration: underline;
}

.mfm-mention {
  color: var(--nd-accent);
  cursor: pointer;
}

.mfm-mention:hover {
  text-decoration: underline;
}

.mfm-hashtag {
  color: var(--nd-hashtag, var(--nd-accent));
  cursor: pointer;
}

.mfm-hashtag:hover {
  text-decoration: underline;
}

.mfm-code {
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.9em;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--nd-inlineCodeBg, rgba(0, 0, 0, 0.15));
  color: var(--nd-inlineCodeFg, var(--nd-fg));
}

.custom-emoji {
  height: 2em;
  vertical-align: middle;
  object-fit: contain;
}

.twemoji {
  height: 1.25em;
  vertical-align: -0.25em;
  object-fit: contain;
}
</style>
