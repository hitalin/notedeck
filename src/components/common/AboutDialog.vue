<script setup lang="ts">
import { getTauriVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { onMounted, ref } from 'vue'
import { invoke } from '@/utils/tauriInvoke'
import { version as appVersion } from '../../../package.json'

defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const tauriVersion = ref('')
const notecliVersion = ref('')
const copied = ref(false)

onMounted(async () => {
  try {
    tauriVersion.value = await getTauriVersion()
  } catch {
    // Fallback for environments where Tauri API is unavailable
  }
  try {
    notecliVersion.value = await invoke<string>('get_notecli_version')
  } catch {
    // Fallback for environments where Tauri API is unavailable
  }
})

async function copyInfo() {
  const lines = [
    `NoteDeck v${appVersion}`,
    `Tauri: ${tauriVersion.value || 'N/A'}`,
    `notecli: ${notecliVersion.value ? notecliVersion.value.slice(0, 7) : 'N/A'}`,
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
      <div v-if="show" class="_dialogBackdrop" @click="emit('close')">
        <div class="_dialog nd-popup-content" @click.stop>
          <div :class="$style.aboutHeader">
            <img src="/favicon.svg" :class="$style.aboutLogo" alt="NoteDeck" />
            <div :class="$style.aboutTitle">NoteDeck</div>
          </div>

          <div :class="$style.aboutInfo">
            <div :class="$style.aboutRow">
              <span :class="$style.aboutLabel">Version:</span>
              <span :class="$style.aboutValue">{{ appVersion }}</span>
            </div>
            <div :class="$style.aboutRow">
              <span :class="$style.aboutLabel">Tauri:</span>
              <span :class="$style.aboutValue">{{ tauriVersion || '...' }}</span>
            </div>
            <div :class="$style.aboutRow">
              <span :class="$style.aboutLabel">notecli:</span>
              <span :class="$style.aboutValue">{{ notecliVersion ? notecliVersion.slice(0, 7) : '...' }}</span>
            </div>
          </div>

          <div :class="$style.aboutLinks">
            <button :class="$style.aboutLink" @click="openUrl('https://github.com/hitalin/notedeck')">
              <i class="ti ti-brand-github" />
              GitHub
            </button>
            <button :class="$style.aboutLink" @click="openUrl('https://github.com/sponsors/hitalin')">
              <i class="ti ti-heart" />
              開発を支援する
            </button>
            <button :class="$style.aboutLink" @click="openUrl('https://github.com/hitalin/notedeck/blob/main/LICENSE')">
              <i class="ti ti-license" />
              ライセンス
            </button>
          </div>

          <div :class="$style.aboutActions">
            <button :class="$style.aboutCopy" @click="copyInfo">
              <i :class="copied ? 'ti ti-check' : 'ti ti-copy'" />
              {{ copied ? 'コピーしました' : '情報をコピー' }}
            </button>
            <button :class="$style.aboutClose" @click="emit('close')">OK</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" module>
.aboutHeader {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 24px 12px;
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
  padding: 8px 24px;
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
  min-width: 64px;
}

.aboutValue {
  color: var(--nd-fg);
  user-select: all;
}

.aboutLinks {
  display: flex;
  flex-direction: column;
  padding: 8px 16px;
  gap: 2px;
}

.aboutLink {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  border-radius: var(--nd-radius-md);
  background: none;
  color: var(--nd-accent);
  font-size: 0.85em;
  cursor: pointer;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  :global(.ti) {
    font-size: 1.1em;
  }

  :global(.ti-heart) {
    color: #e05a7a;
  }
}

.aboutActions {
  display: flex;
  gap: 8px;
  padding: 12px 16px 16px;
  justify-content: flex-end;
}

.aboutCopy {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-md);
  background: none;
  color: var(--nd-fg);
  font-size: 0.8em;
  cursor: pointer;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.aboutClose {
  padding: 6px 20px;
  border: none;
  border-radius: var(--nd-radius-md);
  background: var(--nd-accent);
  color: #fff;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.85;
  }
}
</style>
