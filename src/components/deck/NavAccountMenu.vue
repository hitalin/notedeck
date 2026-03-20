<script setup lang="ts">
import { useNavigation } from '@/composables/useNavigation'

import { useIsCompactLayout } from '@/stores/ui'

const openUrl = async (url: string) => {
  const { openUrl: open } = await import('@tauri-apps/plugin-opener')
  return open(url)
}

const props = defineProps<{
  show: boolean
  account: {
    id: string
    username: string
    host: string
    userId: string
    hasToken: boolean
  }
  navCollapsed: boolean
  modes: Record<string, boolean>
  togglingMode: boolean
  modeError: string | null
  isAdmin: boolean
}>()

const isCompact = useIsCompactLayout()

const emit = defineEmits<{
  'toggle-mode': [key: string]
  logout: []
  relogin: []
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
      class="nav-account-menu _popupMenu"
      :class="[$style.navAccountMenu, { [$style.menuRight]: navCollapsed, [$style.mobile]: isCompact }]"
      @click.stop
    >
      <template v-if="account.hasToken">
        <template v-if="Object.keys(modes).length > 0">
          <div
            v-for="(val, key) in modes"
            :key="key"
            :class="$style.navAccountMenuItem"
            @click="emit('toggle-mode', key as string)"
          >
            <span :class="$style.navAccountMenuLabel">{{ modeLabel(key as string) }}</span>
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
        <div v-if="modeError" :class="$style.navAccountMenuError">{{ modeError }}</div>
        <div :class="$style.navAccountMenuDivider" />
        <button class="_button" :class="$style.navAccountMenuItem" @click="navigateToUser(account.id, account.userId)">
          <span>プロフィール</span>
          <i class="ti ti-user" />
        </button>
        <div :class="$style.navAccountMenuDivider" />
        <div :class="$style.navAccountMenuDivider" />
        <button class="_button" :class="$style.navAccountMenuItem" @click="openUrl(`https://${account.host}/settings`)">
          <span>設定</span>
          <i class="ti ti-external-link" />
        </button>
        <button class="_button" :class="$style.navAccountMenuItem" @click="openUrl(`https://${account.host}/games`)">
          <span>Misskey Games</span>
          <i class="ti ti-external-link" />
        </button>
        <button v-if="isAdmin" class="_button" :class="$style.navAccountMenuItem" @click="openUrl(`https://${account.host}/admin`)">
          <span>コントロールパネル</span>
          <i class="ti ti-external-link" />
        </button>
        <div :class="$style.navAccountMenuDivider" />
        <button class="_button" :class="[$style.navAccountMenuItem, $style.navAccountLogout]" @click="emit('logout')">
          <span>ログアウト</span>
          <i class="ti ti-logout" />
        </button>
      </template>

      <template v-else>
        <div :class="$style.navAccountMenuOffline">
          <i class="ti ti-wifi-off" />
          <span>ログアウト中</span>
        </div>
        <div :class="$style.navAccountMenuDivider" />
        <button class="_button" :class="[$style.navAccountMenuItem, $style.navAccountRelogin]" @click="emit('relogin')">
          <span>再ログイン</span>
          <i class="ti ti-login" />
        </button>
        <button class="_button" :class="[$style.navAccountMenuItem, $style.navAccountLogout]" @click="emit('logout')">
          <span>データを削除</span>
          <i class="ti ti-trash" />
        </button>
      </template>
    </div>
  </Transition>
</template>

<style lang="scss" module>
.navAccountMenu {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 4px;
  padding: 8px 0;
  z-index: var(--nd-z-menu);
  min-width: 180px;
}

.menuRight {
  top: auto;
  bottom: 0;
  left: 100%;
  right: auto;
  margin-bottom: 0;
  margin-left: 4px;
}

.navAccountMenuItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background var(--nd-duration-fast);
  font-size: 0.85em;
  color: var(--nd-fg);
  width: 100%;
  text-align: left;

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.navAccountMenuLabel {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.navAccountMenuDivider {
  height: 1px;
  background: var(--nd-divider);
  margin: 4px 10px;
}

.navAccountMenuError {
  padding: 6px 14px;
  font-size: 0.75em;
  color: var(--nd-love);
  word-break: break-word;
}

.mobile {
  position: fixed;
  bottom: calc(50px + var(--nd-safe-area-bottom, env(safe-area-inset-bottom)));
  left: 8px;
  right: 8px;
  top: auto;
  margin: 0;
}

.navAccountLogout {
  color: var(--nd-love, #ff6b6b);
  gap: 8px;

  .ti {
    flex-shrink: 0;
    opacity: 0.8;
  }
}

.navAccountRelogin {
  color: var(--nd-accent);
  gap: 8px;

  .ti {
    flex-shrink: 0;
  }
}

.navAccountMenuOffline {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.5;
}
</style>

<style lang="scss">
/* Vue transition classes (must be global) */
.nav-account-menu-enter-active,
.nav-account-menu-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
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
