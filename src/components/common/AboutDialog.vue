<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { getTauriVersion } from '@tauri-apps/api/app'
import { onMounted, ref } from 'vue'
import { version as appVersion } from '../../../package.json'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const tauriVersion = ref('')
const copied = ref(false)

onMounted(async () => {
  try {
    tauriVersion.value = await getTauriVersion()
  } catch {
    // Fallback for environments where Tauri API is unavailable
  }
})

async function copyInfo() {
  const lines = [
    `NoteDeck v${appVersion}`,
    `Tauri: ${tauriVersion.value || 'N/A'}`,
    `UA: ${navigator.userAgent}`,
  ]
  await navigator.clipboard.writeText(lines.join('\n'))
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="nd-popup">
      <div v-if="show" class="about-backdrop" @click="emit('close')">
        <div class="about-dialog" @click.stop>
          <div class="about-header">
            <img src="/favicon.svg" class="about-logo" alt="NoteDeck" />
            <div class="about-title">NoteDeck</div>
          </div>

          <div class="about-info">
            <div class="about-row">
              <span class="about-label">Version:</span>
              <span class="about-value">{{ appVersion }}</span>
            </div>
            <div class="about-row">
              <span class="about-label">Tauri:</span>
              <span class="about-value">{{ tauriVersion || '...' }}</span>
            </div>
          </div>

          <div class="about-links">
            <button class="about-link" @click="openUrl('https://github.com/hitalin/notedeck')">
              <i class="ti ti-brand-github" />
              GitHub
            </button>
            <button class="about-link" @click="openUrl('https://github.com/sponsors/hitalin')">
              <i class="ti ti-heart" />
              開発を支援する
            </button>
            <button class="about-link" @click="openUrl('https://github.com/hitalin/notedeck/blob/main/LICENSE')">
              <i class="ti ti-license" />
              ライセンス
            </button>
          </div>

          <div class="about-actions">
            <button class="about-copy" @click="copyInfo">
              <i :class="copied ? 'ti ti-check' : 'ti ti-copy'" />
              {{ copied ? 'コピーしました' : '情報をコピー' }}
            </button>
            <button class="about-close" @click="emit('close')">OK</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.about-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

.about-dialog {
  width: 360px;
  max-width: 90vw;
  background: var(--nd-panel, var(--nd-bg));
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.about-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 24px 12px;
}

.about-logo {
  width: 64px;
  height: 64px;
}

.about-title {
  font-size: 1.2em;
  font-weight: bold;
  color: var(--nd-fg);
}

.about-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 24px;
  font-size: 0.85em;
  font-family: monospace;
}

.about-row {
  display: flex;
  gap: 8px;
}

.about-label {
  color: var(--nd-fg);
  opacity: 0.5;
  min-width: 60px;
}

.about-value {
  color: var(--nd-fg);
  user-select: all;
}

.about-links {
  display: flex;
  flex-direction: column;
  padding: 8px 16px;
  gap: 2px;
}

.about-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--nd-accent);
  font-size: 0.85em;
  cursor: pointer;
  transition: background 0.15s;
}

.about-link:hover {
  background: var(--nd-buttonHoverBg);
}

.about-link .ti {
  font-size: 1.1em;
}

.about-link .ti-heart {
  color: #e05a7a;
}

.about-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px 16px;
  justify-content: flex-end;
}

.about-copy {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--nd-divider);
  border-radius: 8px;
  background: none;
  color: var(--nd-fg);
  font-size: 0.8em;
  cursor: pointer;
  transition: background 0.15s;
}

.about-copy:hover {
  background: var(--nd-buttonHoverBg);
}

.about-close {
  padding: 6px 20px;
  border: none;
  border-radius: 8px;
  background: var(--nd-accent);
  color: #fff;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: opacity 0.15s;
}

.about-close:hover {
  opacity: 0.85;
}

.nd-popup-enter-active,
.nd-popup-leave-active {
  transition: opacity 0.15s ease;
}

.nd-popup-enter-active .about-dialog,
.nd-popup-leave-active .about-dialog {
  transition:
    opacity 0.2s cubic-bezier(0, 0, 0.2, 1),
    transform 0.2s cubic-bezier(0, 0, 0.2, 1);
}

.nd-popup-enter-from,
.nd-popup-leave-to {
  opacity: 0;
}

.nd-popup-enter-from .about-dialog,
.nd-popup-leave-to .about-dialog {
  transform: scale(0.95);
}
</style>
