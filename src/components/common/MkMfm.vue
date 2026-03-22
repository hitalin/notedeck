<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import DOMPurify from 'dompurify'
import { computed, defineAsyncComponent, useCssModule } from 'vue'
import { useEmojiResolver } from '@/composables/useEmojiResolver'
import { highlightCode, highlighterLoaded } from '@/utils/highlight'
import { proxyUrl } from '@/utils/imageProxy'
import { type MfmToken, parseMfm } from '@/utils/mfm'
import { isSafeUrl } from '@/utils/url'
import MkEmoji from './MkEmoji.vue'

const MkUrlPreview = defineAsyncComponent(() => import('./MkUrlPreview.vue'))

const props = defineProps<{
  text?: string
  tokens?: MfmToken[]
  emojis?: Record<string, string>
  reactionEmojis?: Record<string, string>
  serverHost?: string
  accountId?: string
  compact?: boolean
}>()

const emit = defineEmits<{
  mentionClick: [username: string, host: string | null]
  mentionHover: [e: MouseEvent, username: string, host: string | null]
  mentionLeave: []
}>()

const { resolveEmoji: resolveEmojiRaw } = useEmojiResolver()
const style = useCssModule()

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

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// KaTeX is loaded on demand — most notes don't contain math
let katexModule: typeof import('katex') | null = null
const katexReady = import('katex').then((m) => {
  katexModule = m
})

const KATEX_ALLOWED_TAGS = [
  'span',
  'div',
  'math',
  'semantics',
  'mrow',
  'mi',
  'mo',
  'mn',
  'msup',
  'msub',
  'mfrac',
  'munder',
  'mover',
  'munderover',
  'msqrt',
  'mroot',
  'mtable',
  'mtr',
  'mtd',
  'mtext',
  'mspace',
  'annotation',
  'svg',
  'line',
  'path',
  'rect',
  'g',
]
const KATEX_ALLOWED_ATTR = [
  'class',
  'style',
  'mathvariant',
  'encoding',
  'xmlns',
  'width',
  'height',
  'viewBox',
  'preserveAspectRatio',
  'd',
  'x1',
  'x2',
  'y1',
  'y2',
  'fill',
  'stroke',
  'stroke-width',
]

function renderKatex(formula: string, displayMode: boolean): string {
  if (!katexModule) {
    // Trigger load (will re-render on next update)
    katexReady.then()
    return escapeHtml(formula)
  }
  try {
    const html = katexModule.default.renderToString(formula, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: 'error',
    })
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: KATEX_ALLOWED_TAGS,
      ALLOWED_ATTR: KATEX_ALLOWED_ATTR,
    })
  } catch {
    return escapeHtml(formula)
  }
}

const hexColorRe = /^[0-9a-fA-F]{3,8}$/
const cssTimeRe = /^\d+(\.\d+)?(s|ms)$/
const cssNumRe = /^-?\d+(\.\d+)?$/
const borderStyles = new Set([
  'solid',
  'dashed',
  'dotted',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
  'none',
  'hidden',
])

const fnClassMap: Record<string, string> = {
  'mfm-spin': style.mfmSpin,
  'mfm-spin-left': style.mfmSpinLeft,
  'mfm-spin-alternate': style.mfmSpinAlternate,
  'mfm-spinX': style.mfmSpinX,
  'mfm-spinX-left': style.mfmSpinXLeft,
  'mfm-spinX-alternate': style.mfmSpinXAlternate,
  'mfm-spinY': style.mfmSpinY,
  'mfm-spinY-left': style.mfmSpinYLeft,
  'mfm-spinY-alternate': style.mfmSpinYAlternate,
  'mfm-shake': style.mfmShake,
  'mfm-bounce': style.mfmBounce,
  'mfm-jelly': style.mfmJelly,
  'mfm-tada': style.mfmTada,
  'mfm-jump': style.mfmJump,
  'mfm-twitch': style.mfmTwitch,
  'mfm-rainbow': style.mfmRainbow,
  'mfm-sparkle': style.mfmSparkle,
  'mfm-blur': style.mfmBlur,
}

function fnClass(token: MfmToken & { type: 'fn' }): string | undefined {
  let key: string | undefined
  switch (token.name) {
    case 'spin': {
      const axis = token.args.x ? 'X' : token.args.y ? 'Y' : ''
      const dir = token.args.left
        ? '-left'
        : token.args.alternate
          ? '-alternate'
          : ''
      key = `mfm-spin${axis}${dir}`
      break
    }
    case 'shake':
      key = 'mfm-shake'
      break
    case 'bounce':
      key = 'mfm-bounce'
      break
    case 'jelly':
      key = 'mfm-jelly'
      break
    case 'tada':
      key = 'mfm-tada'
      break
    case 'jump':
      key = 'mfm-jump'
      break
    case 'twitch':
      key = 'mfm-twitch'
      break
    case 'rainbow':
      key = 'mfm-rainbow'
      break
    case 'sparkle':
      key = 'mfm-sparkle'
      break
    case 'blur':
      key = 'mfm-blur'
      break
    default:
      return undefined
  }
  return fnClassMap[key] ?? undefined
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
      const deg =
        typeof args.deg === 'string' && cssNumRe.test(args.deg)
          ? args.deg
          : '90'
      s.transform = `rotate(${deg}deg)`
      s.display = 'inline-block'
      break
    }
    case 'scale': {
      const sx =
        typeof args.x === 'string' && cssNumRe.test(args.x) ? args.x : '1'
      const sy =
        typeof args.y === 'string' && cssNumRe.test(args.y) ? args.y : '1'
      s.transform = `scale(${sx},${sy})`
      s.display = 'inline-block'
      break
    }
    case 'position': {
      const px =
        typeof args.x === 'string' && cssNumRe.test(args.x) ? args.x : '0'
      const py =
        typeof args.y === 'string' && cssNumRe.test(args.y) ? args.y : '0'
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
      const w =
        typeof args.width === 'string' && cssNumRe.test(args.width)
          ? args.width
          : '1'
      const st =
        typeof args.style === 'string' && borderStyles.has(args.style)
          ? args.style
          : 'solid'
      const c =
        typeof args.color === 'string' && hexColorRe.test(args.color)
          ? `#${args.color}`
          : 'var(--nd-fg)'
      const r =
        typeof args.radius === 'string' && cssNumRe.test(args.radius)
          ? args.radius
          : '0'
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
  <span class="mfm" :class="$style.mfm"><template v-for="(token, i) in resolvedTokens" :key="i"><!--
    --><!-- URL --><span v-if="token.type === 'url'" :class="$style.mfmUrlBlock"><a :href="isSafeUrl(token.value) ? token.value : '#'" :class="$style.mfmUrl" target="_blank" rel="noopener noreferrer" @click.stop="handleLinkClick($event, token.value)">{{ token.value }}</a><MkUrlPreview v-if="!compact" :url="token.value" :account-id="accountId" /></span><!--
    --><!-- Link --><a v-else-if="token.type === 'link'" :href="isSafeUrl(token.url) ? token.url : '#'" :class="$style.mfmUrl" target="_blank" rel="noopener noreferrer" @click.stop="handleLinkClick($event, token.url)"><MkMfm :tokens="token.label" :emojis="emojis" :reaction-emojis="reactionEmojis" :server-host="serverHost" :account-id="accountId" @mention-click="(u, h) => emit('mentionClick', u, h)" @mention-hover="(e, u, h) => emit('mentionHover', e, u, h)" @mention-leave="emit('mentionLeave')" /></a><!--
    --><!-- Mention --><span v-else-if="token.type === 'mention'" :class="$style.mfmMention" @click.stop="emit('mentionClick', token.username, token.host)" @mouseenter="emit('mentionHover', $event, token.username, token.host)" @mouseleave="emit('mentionLeave')">{{ token.acct }}</span><!--
    --><!-- Hashtag --><span v-else-if="token.type === 'hashtag'" :class="$style.mfmHashtag" @click.stop>#{{ token.value }}</span><!--
    --><!-- Bold --><b v-else-if="token.type === 'bold'">{{ token.value }}</b><!--
    --><!-- Italic --><i v-else-if="token.type === 'italic'">{{ token.value }}</i><!--
    --><!-- Strike --><s v-else-if="token.type === 'strike'">{{ token.value }}</s><!--
    --><!-- Code Block --><div v-else-if="token.type === 'codeBlock'" :key="`cb-${i}-${highlighterLoaded}`" :class="$style.mfmCodeBlock" v-html="highlightCode(token.value, token.lang)"></div><!--
    --><!-- Inline Code --><code v-else-if="token.type === 'inlineCode'" :class="$style.mfmCode">{{ token.value }}</code><!--
    --><!-- Custom Emoji (resolved) --><img v-else-if="token.type === 'customEmoji' && emojiUrls[token.shortcode]" :src="proxyUrl(emojiUrls[token.shortcode]!)" :alt="`:${token.shortcode}:`" class="custom-emoji" :class="$style.customEmoji" decoding="async" loading="lazy" @error="(e: Event) => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/emoji-unknown.svg')) img.src = '/emoji-unknown.svg' }" /><!--
    --><!-- Custom Emoji (unresolved — show fallback icon) --><img v-else-if="token.type === 'customEmoji'" src="/emoji-unknown.svg" :alt="`:${token.shortcode}:`" :title="`:${token.shortcode}:`" class="custom-emoji" :class="$style.customEmoji" /><!--
    --><!-- Unicode Emoji --><MkEmoji v-else-if="token.type === 'unicodeEmoji'" :emoji="token.value" class="twemoji" :class="$style.twemoji" /><!--
    --><!-- MFM Function --><span v-else-if="token.type === 'fn'" :class="fnClass(token)" :style="fnStyle(token)"><MkMfm :tokens="token.children" :emojis="emojis" :reaction-emojis="reactionEmojis" :server-host="serverHost" :account-id="accountId" @mention-click="(u, h) => emit('mentionClick', u, h)" @mention-hover="(e, u, h) => emit('mentionHover', e, u, h)" @mention-leave="emit('mentionLeave')" /></span><!--
    --><!-- Small --><small v-else-if="token.type === 'small'" :class="$style.mfmSmall"><MkMfm :tokens="token.children" :emojis="emojis" :reaction-emojis="reactionEmojis" :server-host="serverHost" :account-id="accountId" @mention-click="(u, h) => emit('mentionClick', u, h)" @mention-hover="(e, u, h) => emit('mentionHover', e, u, h)" @mention-leave="emit('mentionLeave')" /></small><!--
    --><!-- Center --><span v-else-if="token.type === 'center'" :class="$style.mfmCenter"><MkMfm :tokens="token.children" :emojis="emojis" :reaction-emojis="reactionEmojis" :server-host="serverHost" :account-id="accountId" @mention-click="(u, h) => emit('mentionClick', u, h)" @mention-hover="(e, u, h) => emit('mentionHover', e, u, h)" @mention-leave="emit('mentionLeave')" /></span><!--
    --><!-- Plain --><span v-else-if="token.type === 'plain'">{{ token.value }}</span><!--
    --><!-- Quote --><blockquote v-else-if="token.type === 'quote'" :class="$style.mfmQuote"><MkMfm :tokens="token.children" :emojis="emojis" :reaction-emojis="reactionEmojis" :server-host="serverHost" :account-id="accountId" @mention-click="(u, h) => emit('mentionClick', u, h)" @mention-hover="(e, u, h) => emit('mentionHover', e, u, h)" @mention-leave="emit('mentionLeave')" /></blockquote><!--
    --><!-- Search --><div v-else-if="token.type === 'search'" :class="$style.mfmSearch"><input :class="$style.mfmSearchInput" type="text" :value="token.query" readonly /><button :class="$style.mfmSearchButton" @click.stop="openUrl(`https://www.google.com/search?q=${encodeURIComponent(token.query)}`)">検索</button></div><!--
    --><!-- Math Inline --><span v-else-if="token.type === 'mathInline'" :class="$style.mfmMath" v-html="renderKatex(token.value, false)"></span><!--
    --><!-- Math Block --><div v-else-if="token.type === 'mathBlock'" :class="$style.mfmMathBlock" v-html="renderKatex(token.value, true)"></div><!--
    --><!-- Text --><template v-else>{{ token.value }}</template><!--
  --></template></span>
</template>

<style lang="scss" module>
.mfm {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.mfmUrlBlock {
  display: inline;
}

.mfmUrl {
  color: var(--nd-link);
  text-decoration: none;
  word-break: break-all;

  &:hover {
    text-decoration: underline;
  }
}

.mfmMention {
  color: var(--nd-mention);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.mfmHashtag {
  color: var(--nd-hashtag, var(--nd-accent));
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

.mfmCode {
  font-family: 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.9em;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--nd-inlineCodeBg, rgba(0, 0, 0, 0.15));
  color: var(--nd-inlineCodeFg, var(--nd-fg));
}

.mfmCodeBlock {
  margin: 8px 0;
  max-width: 100%;
  overflow: hidden;

  :deep(pre) {
    font-family: 'Fira Code', 'Cascadia Code', monospace;
    font-size: 0.85em;
    padding: 12px 16px;
    border-radius: var(--nd-radius-md);
    overflow-x: auto;
    white-space: pre;
    word-break: normal;
    margin: 0;
  }

  :deep(pre code) {
    font-family: inherit;
  }
}

.customEmoji {
  height: 2em;
  min-width: 2em;
  width: auto;
  vertical-align: middle;
  object-fit: contain;
}

.twemoji {
  height: 1.25em;
  vertical-align: -0.25em;
  object-fit: contain;
}

/* Small */
.mfmSmall {
  font-size: 0.8em;
  opacity: 0.7;
}

/* Center */
.mfmCenter {
  display: block;
  text-align: center;
}

/* Quote */
.mfmQuote {
  display: block;
  margin: 8px 0;
  padding: 4px 0 4px 16px;
  border-left: 3px solid var(--nd-divider, rgba(128, 128, 128, 0.3));
  color: var(--nd-fg-muted, var(--nd-fg));
  opacity: 0.85;
}

/* Search */
.mfmSearch {
  display: flex;
  margin: 8px 0;
  gap: 4px;
}

.mfmSearchInput {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--nd-divider, rgba(128, 128, 128, 0.3));
  border-radius: var(--nd-radius-sm, 4px);
  background: var(--nd-bg-secondary, rgba(0, 0, 0, 0.05));
  color: var(--nd-fg);
  font-size: 0.9em;
}

.mfmSearchButton {
  padding: 6px 16px;
  border: none;
  border-radius: var(--nd-radius-sm, 4px);
  background: var(--nd-accent);
  color: #fff;
  cursor: pointer;
  font-size: 0.9em;
  white-space: nowrap;

  &:hover {
    opacity: 0.85;
  }
}

/* Math */
.mfmMath {
  display: inline;
}

.mfmMathBlock {
  display: block;
  overflow-wrap: anywhere;
  background: var(--nd-bg-secondary, rgba(0, 0, 0, 0.05));
  padding: 0 1em;
  margin: 0.5em 0;
  overflow: auto;
  border-radius: 8px;

  :deep(.katex-display) {
    margin: auto;
    width: fit-content;
    overflow: clip;
  }
}

/* Blur */
.mfmBlur {
  filter: blur(6px);
  transition: filter var(--nd-duration-slower);

  &:hover {
    filter: none;
  }
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
.mfmSpin { display: inline-block; animation: mfm-spin 1.5s linear infinite; }
.mfmSpinLeft { display: inline-block; animation: mfm-spin 1.5s linear infinite reverse; }
.mfmSpinAlternate { display: inline-block; animation: mfm-spin 1.5s linear infinite alternate; }
.mfmSpinX { display: inline-block; animation: mfm-spinX 1.5s linear infinite; }
.mfmSpinXLeft { display: inline-block; animation: mfm-spinX 1.5s linear infinite reverse; }
.mfmSpinXAlternate { display: inline-block; animation: mfm-spinX 1.5s linear infinite alternate; }
.mfmSpinY { display: inline-block; animation: mfm-spinY 1.5s linear infinite; }
.mfmSpinYLeft { display: inline-block; animation: mfm-spinY 1.5s linear infinite reverse; }
.mfmSpinYAlternate { display: inline-block; animation: mfm-spinY 1.5s linear infinite alternate; }

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
.mfmShake { display: inline-block; animation: mfm-shake 0.5s ease infinite; }

/* Bounce */
@keyframes mfm-bounce {
  0% { transform: translateY(0) scale(1, 1); }
  25% { transform: translateY(-16px) scale(1, 1); }
  50% { transform: translateY(0) scale(1, 1); }
  75% { transform: translateY(0) scale(1.5, 0.75); }
  100% { transform: translateY(0) scale(1, 1); }
}
.mfmBounce { display: inline-block; animation: mfm-bounce 0.75s linear infinite; transform-origin: center bottom; }

/* Jelly */
@keyframes mfm-jelly {
  0% { transform: scaleX(1) scaleY(1); }
  33% { transform: scaleX(1.2) scaleY(0.8); }
  66% { transform: scaleX(0.8) scaleY(1.2); }
  100% { transform: scaleX(1) scaleY(1); }
}
.mfmJelly { display: inline-block; animation: mfm-jelly 1s ease infinite; }

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
.mfmTada { display: inline-block; animation: mfm-tada 1s linear infinite; }

/* Jump */
@keyframes mfm-jump {
  0% { transform: translateY(0); }
  25% { transform: translateY(-16px); }
  50% { transform: translateY(0); }
  75% { transform: translateY(-8px); }
  100% { transform: translateY(0); }
}
.mfmJump { display: inline-block; animation: mfm-jump 0.75s linear infinite; }

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
.mfmTwitch { display: inline-block; animation: mfm-twitch 0.5s ease infinite; }

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
.mfmRainbow { animation: mfm-rainbow 1s linear infinite; }

/* Sparkle */
@keyframes mfm-sparkle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.mfmSparkle { animation: mfm-sparkle 1.5s ease-in-out infinite; }
</style>
