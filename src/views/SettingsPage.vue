<script setup lang="ts">
import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'
import { compileMisskeyTheme } from '@/theme/compiler'
import type { ThemeSource } from '@/theme/types'

const themeStore = useThemeStore()

interface ThemeOption {
  label: string
  source: ThemeSource
  previewColors: { bg: string; accent: string; fg: string }
}

const themeOptions = computed<ThemeOption[]>(() => {
  const darkCompiled = compileMisskeyTheme(DARK_THEME, DARK_THEME)
  const lightCompiled = compileMisskeyTheme(LIGHT_THEME, LIGHT_THEME)
  return [
    {
      label: 'Dark (Default)',
      source: { kind: 'builtin-dark', theme: DARK_THEME },
      previewColors: { bg: darkCompiled.bg ?? '', accent: darkCompiled.accent ?? '', fg: darkCompiled.fg ?? '' },
    },
    {
      label: 'Light',
      source: { kind: 'builtin-light', theme: LIGHT_THEME },
      previewColors: { bg: lightCompiled.bg ?? '', accent: lightCompiled.accent ?? '', fg: lightCompiled.fg ?? '' },
    },
  ]
})

function isActive(option: ThemeOption): boolean {
  return themeStore.currentSource?.kind === option.source.kind
}

function selectTheme(option: ThemeOption): void {
  themeStore.applySource(option.source)
}
</script>

<template>
  <div class="settings-page">
    <header class="settings-header">
      <router-link to="/" class="back-btn _button">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </router-link>
      <h1 class="settings-title">Settings</h1>
    </header>

    <div class="settings-body">
      <section class="settings-section">
        <h2 class="section-title">Base Theme</h2>
        <div class="theme-grid">
          <button
            v-for="option in themeOptions"
            :key="option.source.kind + (option.source.host || '')"
            class="_button theme-card"
            :class="{ active: isActive(option) }"
            @click="selectTheme(option)"
          >
            <div class="theme-preview" :style="{ background: option.previewColors.bg }">
              <div class="preview-accent" :style="{ background: option.previewColors.accent }" />
              <div class="preview-text" :style="{ color: option.previewColors.fg }">Aa</div>
            </div>
            <span class="theme-label">{{ option.label }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--nd-bg);
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 50px;
  padding: 0 16px;
  border-bottom: 1px solid var(--nd-divider);
  position: sticky;
  top: 0;
  background: var(--nd-windowHeader);
  backdrop-filter: blur(15px);
  z-index: 10;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--nd-fg);
  text-decoration: none;
  transition: background 0.15s;
}

.back-btn:hover {
  background: var(--nd-buttonHoverBg);
  text-decoration: none;
}

.settings-title {
  font-size: 0.9em;
  font-weight: bold;
  margin: 0;
  color: var(--nd-fgHighlighted);
}

.settings-body {
  flex: 1;
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.settings-section {
  margin-bottom: 2rem;
}

.section-title {
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-accent);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  border: 2px solid transparent;
  background: var(--nd-panel);
  transition: border-color 0.15s, background 0.15s;
  text-align: center;
}

.theme-card:hover {
  background: var(--nd-panelHighlight);
}

.theme-card.active {
  border-color: var(--nd-accent);
}

.theme-preview {
  position: relative;
  height: 60px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.preview-accent {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
}

.preview-text {
  font-size: 1.2em;
  font-weight: bold;
}

.theme-label {
  font-size: 0.75em;
  color: var(--nd-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
