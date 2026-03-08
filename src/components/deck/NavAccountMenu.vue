<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { useNavigation } from '@/composables/useNavigation'

const props = defineProps<{
  show: boolean
  account: {
    id: string
    username: string
    host: string
    userId: string
  }
  navCollapsed: boolean
  modes: Record<string, boolean>
  togglingMode: boolean
  modeError: string | null
  isAdmin: boolean
}>()

const emit = defineEmits<{
  'toggle-mode': [key: string]
  logout: []
}>()

const { navigateToUser } = useNavigation()

function modeLabel(key: string): string {
  const match = key.match(/^isIn(.+)Mode$/)
  if (!match) return key
  return `${match[1]}モード`
}
</script>

<template>
  <Transition name="nav-account-menu">
    <div
      v-if="show"
      class="nav-account-menu"
      :class="{ 'menu-right': navCollapsed }"
      @click.stop
    >
      <template v-if="Object.keys(modes).length > 0">
        <div
          v-for="(val, key) in modes"
          :key="key"
          class="nav-account-menu-item"
          @click="emit('toggle-mode', key as string)"
        >
          <span class="nav-account-menu-label">{{ modeLabel(key as string) }}</span>
          <button
            class="nd-toggle-switch"
            :class="{ on: val }"
            :disabled="togglingMode"
            role="switch"
            :aria-checked="val"
          >
            <span class="nd-toggle-switch-knob" />
          </button>
        </div>
      </template>
      <div v-if="modeError" class="nav-account-menu-error">{{ modeError }}</div>
      <div class="nav-account-menu-divider" />
      <button class="_button nav-account-menu-item" @click="navigateToUser(account.id, account.userId)">
        <span>プロフィール</span>
        <i class="ti ti-user" />
      </button>
      <div class="nav-account-menu-divider" />
      <div class="nav-account-menu-divider" />
      <button class="_button nav-account-menu-item" @click="openUrl(`https://${account.host}/settings`)">
        <span>設定</span>
        <i class="ti ti-external-link" />
      </button>
      <button class="_button nav-account-menu-item" @click="openUrl(`https://${account.host}/games`)">
        <span>Misskey Games</span>
        <i class="ti ti-external-link" />
      </button>
      <button v-if="isAdmin" class="_button nav-account-menu-item" @click="openUrl(`https://${account.host}/admin`)">
        <span>コントロールパネル</span>
        <i class="ti ti-external-link" />
      </button>
      <div class="nav-account-menu-divider" />
      <button class="_button nav-account-menu-item nav-account-logout" @click="emit('logout')">
        <span>ログアウト</span>
        <i class="ti ti-logout" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.nav-account-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 4px;
  background: color-mix(in srgb, var(--nd-popup, var(--nd-panelBg)) 85%, transparent);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(16px);
  padding: 8px 0;
  z-index: 100;
  min-width: 180px;
}

.nav-account-menu.menu-right {
  top: auto;
  bottom: 0;
  left: 100%;
  right: auto;
  margin-bottom: 0;
  margin-left: 4px;
}

.nav-account-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.1s;
  font-size: 0.85em;
  color: var(--nd-fg);
  width: 100%;
  text-align: left;
}

.nav-account-menu-item:hover {
  background: var(--nd-buttonHoverBg);
}

.nav-account-menu-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-account-menu-divider {
  height: 1px;
  background: var(--nd-divider);
  margin: 4px 10px;
}

.nav-account-menu-error {
  padding: 6px 14px;
  font-size: 0.75em;
  color: var(--nd-love);
  word-break: break-word;
}

.nav-account-logout {
  color: var(--nd-love, #ff6b6b);
  gap: 8px;
}

.nav-account-logout .ti {
  flex-shrink: 0;
  opacity: 0.8;
}

.nav-account-menu-enter-active,
.nav-account-menu-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.nav-account-menu-enter-from,
.nav-account-menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.nav-account-menu.menu-right.nav-account-menu-enter-from,
.nav-account-menu.menu-right.nav-account-menu-leave-to {
  transform: translateX(-4px);
}
</style>
