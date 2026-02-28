<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed } from 'vue'
import { useEmojiResolver } from '@/composables/useEmojiResolver'
import { type MfmToken, parseMfm } from '@/utils/mfm'
import { isSafeUrl } from '@/utils/url'

const props = defineProps<{
  text?: string
  tokens?: MfmToken[]
  emojis?: Record<string, string>
  reactionEmojis?: Record<string, string>
  serverHost?: string
}>()

const emit = defineEmits<{
  mentionClick: [username: string, host: string | null]
}>()

const { resolveEmoji: resolveEmojiRaw } = useEmojiResolver()

const resolvedTokens = computed(() => {
  if (props.tokens) return props.tokens
  return parseMfm(props.text ?? '')
})

const emojiUrls = computed(() => {
  const urls: Record<string, string | null> = {}
  const emojis = props.emojis ?? {}
  const reactionEmojis = props.reactionEmojis ?? {}
  const host = props.serverHost ?? ''
  for (const token of resolvedTokens.value) {
    if (token.type === 'customEmoji' && !(token.shortcode in urls)) {
      urls[token.shortcode] = resolveEmojiRaw(
        token.shortcode,
        emojis,
        reactionEmojis,
        host,
      )
    }
  }
  return urls
})

function handleLinkClick(e: MouseEvent, url: string) {
  e.preventDefault()
  if (isSafeUrl(url)) openUrl(url)
}

const hexColorRe = /^[0-9a-fA-F]{3,8}$/
const cssTimeRe = /^\d+(\.\d+)?(s|ms)$/
const cssNumRe = /^-?\d+(\.\d+)?$/
const borderStyles = new Set(['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset', 'none', 'hidden'])

function fnClass(token: MfmToken & { type: 'fn' }): string | undefined {
  switch (token.name) {
    case 'spin': {
      const axis = token.args.x ? 'X' : token.args.y ? 'Y' : ''
      const dir = token.args.left
        ? '-left'
        : token.args.alternate
          ? '-alternate'
          : ''
      return `mfm-spin${axis}${dir}`
    }
    case 'shake':
      return 'mfm-shake'
    case 'bounce':
      return 'mfm-bounce'
    case 'jelly':
      return 'mfm-jelly'
    case 'tada':
      return 'mfm-tada'
    case 'jump':
      return 'mfm-jump'
    case 'twitch':
      return 'mfm-twitch'
    case 'rainbow':
      return 'mfm-rainbow'
    case 'sparkle':
      return 'mfm-sparkle'
    case 'blur':
      return 'mfm-blur'
    default:
      return undefined
  }
}

function fnStyle(
  token: MfmToken & { type: 'fn' },
): Record<string, string> | undefined {
  const s: Record<string, string> = {}
  const { name, args } = token

  if (typeof args.speed === 'string' && cssTimeRe.test(args.speed)) {
    s.animationDuration = args.speed
  }

  switch (name) {
    case 'flip':
      if (args.h && args.v) s.transform = 'scale(-1,-1)'
      else if (args.v) s.transform = 'scaleY(-1)'
      else s.transform = 'scaleX(-1)'
      s.display = 'inline-block'
      break
    case 'rotate': {
      const deg = typeof args.deg === 'string' && cssNumRe.test(args.deg) ? args.deg : '90'
      s.transform = `rotate(${deg}deg)`
      s.display = 'inline-block'
      break
    }
    case 'scale': {
      const sx = typeof args.x === 'string' && cssNumRe.test(args.x) ? args.x : '1'
      const sy = typeof args.y === 'string' && cssNumRe.test(args.y) ? args.y : '1'
      s.transform = `scale(${sx},${sy})`
      s.display = 'inline-block'
      break
    }
    case 'position': {
      const px = typeof args.x === 'string' && cssNumRe.test(args.x) ? args.x : '0'
      const py = typeof args.y === 'string' && cssNumRe.test(args.y) ? args.y : '0'
      s.transform = `translate(${px}em,${py}em)`
      s.display = 'inline-block'
      break
    }
    case 'fg':
      if (typeof args.color === 'string' && hexColorRe.test(args.color)) {
        s.color = `#${args.color}`
      }
      break
    case 'bg':
      if (typeof args.color === 'string' && hexColorRe.test(args.color)) {
        s.backgroundColor = `#${args.color}`
      }
      break
    case 'x2':
      s.fontSize = '200%'
      break
    case 'x3':
      s.fontSize = '300%'
      break
    case 'x4':
      s.fontSize = '400%'
      break
    case 'font':
      if (args.serif) s.fontFamily = 'serif'
      else if (args.monospace) s.fontFamily = 'monospace'
      else if (args.cursive) s.fontFamily = 'cursive'
      else if (args.fantasy) s.fontFamily = 'fantasy'
      break
    case 'border': {
      const w = typeof args.width === 'string' && cssNumRe.test(args.width) ? args.width : '1'
      const st = typeof args.style === 'string' && borderStyles.has(args.style) ? args.style : 'solid'
      const c =
        typeof args.color === 'string' && hexColorRe.test(args.color)
          ? `#${args.color}`
          : 'var(--nd-fg)'
      const r = typeof args.radius === 'string' && cssNumRe.test(args.radius) ? args.radius : '0'
      s.border = `${w}px ${st} ${c}`
      s.borderRadius = `${r}px`
      if (!args.noclip) s.overflow = 'clip'
      s.display = 'inline-block'
      break
    }
  }

  return Object.keys(s).length > 0 ? s : undefined
}
</script>

<template>
  <span class="mfm"><template v-for="(token, i) in resolvedTokens" :key="i"><!--
    --><!-- URL --><a v-if="token.type === 'url'" :href="isSafeUrl(token.value) ? token.value : '#'" class="mfm-url" target="_blank" rel="noopener noreferrer" @click.stop="handleLinkClick($event, token.value)">{{ token.value }}</a><!--
    --><!-- Link --><a v-else-if="token.type === 'link'" :href="isSafeUrl(token.url) ? token.url : '#'" class="mfm-url" target="_blank" rel="noopener noreferrer" @click.stop="handleLinkClick($event, token.url)">{{ token.label }}</a><!--
    --><!-- Mention --><span v-else-if="token.type === 'mention'" class="mfm-mention" @click.stop="emit('mentionClick', token.username, token.host)">{{ token.acct }}</span><!--
    --><!-- Hashtag --><span v-else-if="token.type === 'hashtag'" class="mfm-hashtag" @click.stop>#{{ token.value }}</span><!--
    --><!-- Bold --><b v-else-if="token.type === 'bold'">{{ token.value }}</b><!--
    --><!-- Italic --><i v-else-if="token.type === 'italic'">{{ token.value }}</i><!--
    --><!-- Strike --><s v-else-if="token.type === 'strike'">{{ token.value }}</s><!--
    --><!-- Inline Code --><code v-else-if="token.type === 'inlineCode'" class="mfm-code">{{ token.value }}</code><!--
    --><!-- Custom Emoji (resolved) --><img v-else-if="token.type === 'customEmoji' && emojiUrls[token.shortcode]" :src="emojiUrls[token.shortcode]!" :alt="`:${token.shortcode}:`" class="custom-emoji" width="32" height="32" decoding="async" loading="lazy" /><!--
    --><!-- Custom Emoji (unresolved) --><span v-else-if="token.type === 'customEmoji'">:{{ token.shortcode }}:</span><!--
    --><!-- Unicode Emoji --><img v-else-if="token.type === 'unicodeEmoji'" :src="token.url" :alt="token.value" class="twemoji" width="20" height="20" decoding="async" loading="lazy" /><!--
    --><!-- MFM Function --><span v-else-if="token.type === 'fn'" :class="fnClass(token)" :style="fnStyle(token)"><MkMfm :tokens="token.children" :emojis="emojis" :reaction-emojis="reactionEmojis" :server-host="serverHost" @mention-click="(u, h) => emit('mentionClick', u, h)" /></span><!--
    --><!-- Small --><small v-else-if="token.type === 'small'" class="mfm-small"><MkMfm :tokens="token.children" :emojis="emojis" :reaction-emojis="reactionEmojis" :server-host="serverHost" @mention-click="(u, h) => emit('mentionClick', u, h)" /></small><!--
    --><!-- Center --><span v-else-if="token.type === 'center'" class="mfm-center"><MkMfm :tokens="token.children" :emojis="emojis" :reaction-emojis="reactionEmojis" :server-host="serverHost" @mention-click="(u, h) => emit('mentionClick', u, h)" /></span><!--
    --><!-- Plain --><span v-else-if="token.type === 'plain'">{{ token.value }}</span><!--
    --><!-- Text --><template v-else>{{ token.value }}</template><!--
  --></template></span>
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

/* Small */
.mfm-small {
  font-size: 0.8em;
  opacity: 0.7;
}

/* Center */
.mfm-center {
  display: block;
  text-align: center;
}

/* Blur */
.mfm-blur {
  filter: blur(6px);
  transition: filter 0.3s;
}
.mfm-blur:hover {
  filter: none;
}

/* Spin */
@keyframes mfm-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes mfm-spinX {
  from { transform: perspective(128px) rotateX(0deg); }
  to { transform: perspective(128px) rotateX(360deg); }
}
@keyframes mfm-spinY {
  from { transform: perspective(128px) rotateY(0deg); }
  to { transform: perspective(128px) rotateY(360deg); }
}
.mfm-spin { display: inline-block; animation: mfm-spin 1.5s linear infinite; }
.mfm-spin-left { display: inline-block; animation: mfm-spin 1.5s linear infinite reverse; }
.mfm-spin-alternate { display: inline-block; animation: mfm-spin 1.5s linear infinite alternate; }
.mfm-spinX { display: inline-block; animation: mfm-spinX 1.5s linear infinite; }
.mfm-spinX-left { display: inline-block; animation: mfm-spinX 1.5s linear infinite reverse; }
.mfm-spinX-alternate { display: inline-block; animation: mfm-spinX 1.5s linear infinite alternate; }
.mfm-spinY { display: inline-block; animation: mfm-spinY 1.5s linear infinite; }
.mfm-spinY-left { display: inline-block; animation: mfm-spinY 1.5s linear infinite reverse; }
.mfm-spinY-alternate { display: inline-block; animation: mfm-spinY 1.5s linear infinite alternate; }

/* Shake */
@keyframes mfm-shake {
  0% { transform: translate(-3px, -1px) rotate(-8deg); }
  5% { transform: translate(0, -1px) rotate(-10deg); }
  10% { transform: translate(1px, -3px) rotate(0deg); }
  15% { transform: translate(1px, 1px) rotate(11deg); }
  20% { transform: translate(-2px, 1px) rotate(1deg); }
  25% { transform: translate(-1px, -2px) rotate(-2deg); }
  30% { transform: translate(-1px, 2px) rotate(-3deg); }
  35% { transform: translate(2px, 1px) rotate(6deg); }
  40% { transform: translate(-2px, -3px) rotate(-9deg); }
  45% { transform: translate(0, -1px) rotate(-12deg); }
  50% { transform: translate(1px, 2px) rotate(10deg); }
  55% { transform: translate(0, -3px) rotate(8deg); }
  60% { transform: translate(1px, -1px) rotate(8deg); }
  65% { transform: translate(0, -1px) rotate(-7deg); }
  70% { transform: translate(-1px, -3px) rotate(6deg); }
  75% { transform: translate(0, -2px) rotate(4deg); }
  80% { transform: translate(-2px, -1px) rotate(3deg); }
  85% { transform: translate(1px, -3px) rotate(-10deg); }
  90% { transform: translate(1px, 0) rotate(3deg); }
  95% { transform: translate(-2px, 0) rotate(-3deg); }
  100% { transform: translate(2px, 1px) rotate(2deg); }
}
.mfm-shake { display: inline-block; animation: mfm-shake 0.5s ease infinite; }

/* Bounce */
@keyframes mfm-bounce {
  0% { transform: translateY(0) scale(1, 1); }
  25% { transform: translateY(-16px) scale(1, 1); }
  50% { transform: translateY(0) scale(1, 1); }
  75% { transform: translateY(0) scale(1.5, 0.75); }
  100% { transform: translateY(0) scale(1, 1); }
}
.mfm-bounce { display: inline-block; animation: mfm-bounce 0.75s linear infinite; transform-origin: center bottom; }

/* Jelly */
@keyframes mfm-jelly {
  0% { transform: scaleX(1) scaleY(1); }
  33% { transform: scaleX(1.2) scaleY(0.8); }
  66% { transform: scaleX(0.8) scaleY(1.2); }
  100% { transform: scaleX(1) scaleY(1); }
}
.mfm-jelly { display: inline-block; animation: mfm-jelly 1s ease infinite; }

/* Tada */
@keyframes mfm-tada {
  from { transform: rotate(0deg) scale(1); }
  10% { transform: rotate(-5deg) scale(0.9); }
  20% { transform: rotate(-5deg) scale(0.9); }
  30% { transform: rotate(5deg) scale(1.3); }
  40% { transform: rotate(-3deg) scale(1.3); }
  50% { transform: rotate(3deg) scale(1.3); }
  60% { transform: rotate(-3deg) scale(1.3); }
  70% { transform: rotate(3deg) scale(1.3); }
  80% { transform: rotate(-3deg) scale(1.3); }
  90% { transform: rotate(3deg) scale(1.3); }
  to { transform: rotate(0deg) scale(1); }
}
.mfm-tada { display: inline-block; animation: mfm-tada 1s linear infinite; }

/* Jump */
@keyframes mfm-jump {
  0% { transform: translateY(0); }
  25% { transform: translateY(-16px); }
  50% { transform: translateY(0); }
  75% { transform: translateY(-8px); }
  100% { transform: translateY(0); }
}
.mfm-jump { display: inline-block; animation: mfm-jump 0.75s linear infinite; }

/* Twitch */
@keyframes mfm-twitch {
  0% { transform: translate(7px, -2px); }
  5% { transform: translate(-3px, 1px); }
  10% { transform: translate(-7px, -1px); }
  15% { transform: translate(0, -1px); }
  20% { transform: translate(-8px, 6px); }
  25% { transform: translate(-1px, -3px); }
  30% { transform: translate(-2px, -6px); }
  35% { transform: translate(2px, -1px); }
  40% { transform: translate(-8px, -3px); }
  45% { transform: translate(7px, 7px); }
  50% { transform: translate(-1px, -2px); }
  55% { transform: translate(-1px, 3px); }
  60% { transform: translate(3px, -8px); }
  65% { transform: translate(-4px, -2px); }
  70% { transform: translate(8px, 3px); }
  75% { transform: translate(-4px, -4px); }
  80% { transform: translate(-3px, 7px); }
  85% { transform: translate(1px, -2px); }
  90% { transform: translate(-4px, -1px); }
  95% { transform: translate(4px, 6px); }
  100% { transform: translate(7px, -2px); }
}
.mfm-twitch { display: inline-block; animation: mfm-twitch 0.5s ease infinite; }

/* Rainbow */
@keyframes mfm-rainbow {
  0% { color: #ff0000; }
  16.6% { color: #ff8000; }
  33.3% { color: #ffff00; }
  50% { color: #00ff00; }
  66.6% { color: #0000ff; }
  83.3% { color: #ff00ff; }
  100% { color: #ff0000; }
}
.mfm-rainbow { animation: mfm-rainbow 1s linear infinite; }

/* Sparkle */
@keyframes mfm-sparkle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.mfm-sparkle { animation: mfm-sparkle 1.5s ease-in-out infinite; }
</style>
