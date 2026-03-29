<script setup lang="ts">
import { getTauriVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { onMounted, ref } from 'vue'
import { version as appVersion } from '../../../package.json'

const tauriVersion = ref('')
const copied = ref(false)

const buildDate = __BUILD_DATE__

function parseWebView(ua: string): string {
  const webkit = ua.match(/AppleWebKit\/([\d.]+)/)
  return webkit ? `WebKit ${webkit[1]}` : 'N/A'
}

function parseOS(ua: string): string {
  const linux = ua.match(/Linux ([^\s;)]+)/)
  if (linux) return `Linux ${linux[1]}`
  const win = ua.match(/Windows NT ([\d.]+)/)
  if (win) return `Windows NT ${win[1]}`
  const mac = ua.match(/Mac OS X ([\d_]+)/)
  if (mac?.[1]) return `macOS ${mac[1].replace(/_/g, '.')}`
  return navigator.platform || 'N/A'
}

const webView = parseWebView(navigator.userAgent)
const os = parseOS(navigator.userAgent)

onMounted(async () => {
  try {
    tauriVersion.value = await getTauriVersion()
  } catch {
    // Fallback for environments where Tauri API is unavailable
  }
})

const infoRows = [
  { label: 'Version', get: () => appVersion },
  { label: 'Date', get: () => buildDate },
  { label: 'Tauri', get: () => tauriVersion.value || '...' },
  { label: 'WebView', get: () => webView },
  { label: 'OS', get: () => os },
]

function getInfoText() {
  return infoRows.map((r) => `${r.label}: ${r.get()}`).join('\n')
}

async function copyInfo() {
  await navigator.clipboard.writeText(getInfoText())
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

function reportBug() {
  const env = infoRows.map((r) => `- **${r.label}**: ${r.get()}`).join('\n')
  const body = `## 現象\n\n<!-- 何が起きたか -->\n\n## 再現手順\n\n1.\n2.\n3.\n\n## 期待する動作\n\n<!-- 本来どうなるべきか -->\n\n## 環境\n\n${env}\n\n## スクリーンショット\n\n<!-- あれば添付 -->`
  const url = `https://github.com/hitalin/notedeck/issues/new?labels=bug&body=${encodeURIComponent(body)}`
  openUrl(url)
}
</script>

<template>
  <div :class="$style.aboutContent">
    <div :class="$style.aboutHeader">
      <img src="/favicon.svg" :class="$style.aboutLogo" alt="NoteDeck" />
      <div :class="$style.aboutTitle">NoteDeck</div>
    </div>

    <div :class="$style.aboutInfo">
      <div v-for="row in infoRows" :key="row.label" :class="$style.aboutRow">
        <span :class="$style.aboutLabel">{{ row.label }}:</span>
        <span :class="$style.aboutValue">{{ row.get() }}</span>
      </div>
    </div>

    <div :class="$style.actions">
      <div :class="$style.actionGroup">
        <button class="_button" :class="[$style.actionBtn, { [$style.feedback]: copied }]" @click="copyInfo">
          <i :class="copied ? 'ti ti-check' : 'ti ti-copy'" />
          {{ copied ? 'コピーしました' : '情報をコピー' }}
        </button>
        <button class="_button" :class="$style.actionBtn" @click="reportBug">
          <i class="ti ti-bug" />
          バグを報告
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" module>
@use '@/styles/buttons' as *;

.aboutContent {
  display: flex;
  flex-direction: column;
}

.aboutHeader {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 16px 8px;
}

.aboutLogo {
  width: 64px;
  height: 64px;
}

.aboutTitle {
  font-size: 1.2em;
  font-weight: bold;
  color: var(--nd-fg);
}

.aboutInfo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 16px;
  font-size: 0.85em;
  font-family: monospace;
}

.aboutRow {
  display: flex;
  gap: 8px;
}

.aboutLabel {
  color: var(--nd-fg);
  opacity: 0.5;
  min-width: 72px;
}

.aboutValue {
  color: var(--nd-fg);
  user-select: all;
}

.actions { @include action-bar; }
.actionGroup { @include action-group; }

.actionBtn {
  @include btn-action;

  &.feedback {
    color: var(--nd-accent);
  }
}
</style>
