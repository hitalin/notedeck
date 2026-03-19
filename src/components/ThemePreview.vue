<script setup lang="ts">
import { computed } from 'vue'
import { DARK_BASE, LIGHT_BASE } from '@/theme/builtinThemes'
import { compileMisskeyTheme } from '@/theme/compiler'
import type { MisskeyTheme } from '@/theme/types'

const props = defineProps<{
  theme: MisskeyTheme
}>()

const vars = computed(() => {
  const base = props.theme.base === 'light' ? LIGHT_BASE : DARK_BASE
  const compiled = compileMisskeyTheme(props.theme, base)
  return {
    bg: compiled.bg ?? '#232323',
    panel: compiled.panel ?? '#2d2d2d',
    fg: compiled.fg ?? '#c7d1d8',
    mention: compiled.mention ?? '#da6d35',
    hashtag: compiled.hashtag ?? '#4cb8d4',
    link: compiled.link ?? '#86b300',
    divider: compiled.divider ?? 'rgba(255,255,255,0.14)',
    accent: compiled.accent ?? '#86b300',
    accentedBg: compiled.accentedBg ?? 'rgba(134,179,0,0.15)',
    navBg: compiled.navBg ?? '#363636',
    success: compiled.success ?? '#86b300',
    warn: compiled.warn ?? '#ecb637',
    error: compiled.error ?? '#ec4137',
  }
})
</script>

<template>
  <svg viewBox="0 0 200 150" :class="$style.themePreviewSvg">
    <g fill-rule="evenodd">
      <rect width="200" height="150" :fill="vars.bg" />
      <rect width="64" height="150" :fill="vars.navBg" />
      <rect x="64" width="136" height="41" :fill="vars.bg" />
      <path
        transform="scale(.26458)"
        d="m439.77 247.19c-43.673 0-78.832 35.157-78.832 78.83v249.98h407.06v-328.81z"
        :fill="vars.panel"
      />
    </g>
    <circle cx="32" cy="83" r="21" :fill="vars.accentedBg" />
    <g>
      <rect x="120" y="88" width="40" height="6" ry="3" :fill="vars.fg" />
      <rect x="170" y="88" width="20" height="6" ry="3" :fill="vars.mention" />
      <rect x="120" y="108" width="20" height="6" ry="3" :fill="vars.hashtag" />
      <rect x="150" y="108" width="40" height="6" ry="3" :fill="vars.fg" />
      <rect x="120" y="128" width="40" height="6" ry="3" :fill="vars.fg" />
      <rect x="170" y="128" width="20" height="6" ry="3" :fill="vars.link" />
    </g>
    <path d="m65.498 40.892h137.7" :stroke="vars.divider" stroke-width="0.75" />
    <circle cx="32" cy="32" r="16" :fill="vars.accent" />
    <circle cx="140" cy="20" r="6" :fill="vars.success" />
    <circle cx="160" cy="20" r="6" :fill="vars.warn" />
    <circle cx="180" cy="20" r="6" :fill="vars.error" />
  </svg>
</template>

<style lang="scss" module>
.themePreviewSvg {
  display: block;
  width: 100%;
  height: auto;
}
</style>
