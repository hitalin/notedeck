<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from 'vue'

import { useMenuKeyboard } from '@/composables/useMenuKeyboard'
import { useNavigation } from '@/composables/useNavigation'
import { useVaporTransition } from '@/composables/useVaporTransition'
import { type Account, isGuestAccount } from '@/stores/accounts'
import { useIsCompactLayout } from '@/stores/ui'
import { hapticSelection } from '@/utils/haptics'
import { showLoginPrompt } from '@/utils/loginPrompt'

const openUrl = async (url: string) => {
  const { openUrl: open } = await import('@tauri-apps/plugin-opener')
  return open(url)
}

const props = defineProps<{
  show: boolean
  account: Account
  navCollapsed: boolean
  modes: Record<string, boolean>
  togglingMode: boolean
  modeError: string | null
  isAdmin: boolean
}>()

const isCompact = useIsCompactLayout()

const { visible: menuVisible, leaving: menuLeaving } = useVaporTransition(
  toRef(props, 'show'),
  { enterDuration: 180, leaveDuration: 180 },
)

const emit = defineEmits<{
  'toggle-mode': [key: string]
  logout: []
  relogin: [host: string]
  'clear-cache': []
  close: []
}>()

const { navigateToUser } = useNavigation()
const menuRef = ref<HTMLElement | null>(null)
const fixedStyle = ref<Record<string, string>>({})
const { activate: activateKeyboard, deactivate: deactivateKeyboard } =
  useMenuKeyboard({
    containerRef: menuRef,
    itemSelector: 'button, [tabindex="0"]',
    onClose: () => emit('close'),
  })

watch(
  () => props.show,
  (v) => {
    if (v) {
      if (props.navCollapsed && !isCompact.value) {
        nextTick(() => {
          const parent = menuRef.value?.parentElement
          if (parent) {
            const rect = parent.getBoundingClientRect()
            fixedStyle.value = {
              position: 'fixed',
              left: `${rect.right + 4}px`,
              bottom: `${window.innerHeight - rect.bottom}px`,
              top: 'auto',
              right: 'auto',
              margin: '0',
            }
          }
        })
      } else {
        fixedStyle.value = {}
      }
      nextTick(activateKeyboard)
    } else {
      deactivateKeyboard()
    }
  },
)

const hasUpperSection = computed(
  () =>
    (props.account.hasToken && Object.keys(props.modes).length > 0) ||
    !isGuestAccount(props.account) ||
    props.isAdmin,
)

function modeLabel(key: string): string {
  const match = key.match(/^isIn(.+)Mode$/)
  if (!match) return key
  return `${match[1]}モード`
}

function modeIcon(key: string, active: boolean): string {
  // Known mode icons — fall back to generic toggle icon
  if (key === 'isInYamiMode') return active ? 'ti-moon' : 'ti-moon-off'
  return active ? 'ti-toggle-right' : 'ti-toggle-left'
}
</script>

<template>
    <div
      v-if="menuVisible"
      ref="menuRef"
      class="_popupMenu"
      :class="[
        $style.navAccountMenu,
        { [$style.menuRight]: navCollapsed && !fixedStyle.position, [$style.mobile]: isCompact },
        menuLeaving
          ? (navCollapsed ? $style.menuLeaveRight : $style.menuLeave)
          : (navCollapsed ? $style.menuEnterRight : $style.menuEnter),
      ]"
      :style="navCollapsed && !isCompact ? fixedStyle : undefined"
      @click.stop
    >
      <!-- Mode toggles (auth required) -->
      <template v-if="account.hasToken && Object.keys(modes).length > 0">
        <button
          v-for="(val, key) in modes"
          :key="key"
          class="_button"
          :class="[$style.navAccountMenuItem, { [$style.modeActive]: val }]"
          :disabled="togglingMode"
          @click="hapticSelection(); emit('toggle-mode', key as string)"
          @keydown.enter="emit('toggle-mode', key as string)"
        >
          <span :class="$style.navAccountMenuLabel">{{ modeLabel(key as string) }}</span>
          <i :class="['ti', modeIcon(key as string, val)]" />
        </button>
      </template>
      <div v-if="modeError" :class="$style.navAccountMenuError">{{ modeError }}</div>
      <!-- Profile & external links (hidden for guests) -->
      <template v-if="!isGuestAccount(account)">
        <div v-if="account.hasToken && Object.keys(modes).length > 0" :class="$style.navAccountMenuDivider" />
        <button class="_button" :class="$style.navAccountMenuItem" @click="navigateToUser(account.id, account.userId)">
          <span>プロフィール</span>
          <i class="ti ti-user" />
        </button>
        <div :class="$style.navAccountMenuDivider" />
        <button class="_button" :class="$style.navAccountMenuItem" @click="account.hasToken ? openUrl(`https://${account.host}/settings`) : showLoginPrompt()">
          <span>設定</span>
          <i class="ti ti-external-link" />
        </button>
      </template>
      <button v-if="isAdmin" class="_button" :class="$style.navAccountMenuItem" @click="openUrl(`https://${account.host}/admin`)">
        <span>コントロールパネル</span>
        <i class="ti ti-external-link" />
      </button>

      <!-- Account actions -->
      <div v-if="hasUpperSection" :class="$style.navAccountMenuDivider" />
      <button class="_button" :class="$style.navAccountMenuItem" @click="emit('clear-cache')">
        <span>キャッシュ削除</span>
        <i class="ti ti-eraser" />
      </button>
      <template v-if="account.hasToken">
        <button class="_button" :class="[$style.navAccountMenuItem, $style.navAccountLogout]" @click="emit('logout')">
          <span>ログアウト</span>
          <i class="ti ti-logout" />
        </button>
      </template>
      <template v-else-if="isGuestAccount(account)">
        <button class="_button" :class="[$style.navAccountMenuItem, $style.navAccountLogout]" @click="emit('logout')">
          <span>データを削除</span>
          <i class="ti ti-trash" />
        </button>
      </template>
      <template v-else>
        <button class="_button" :class="[$style.navAccountMenuItem, $style.navAccountRelogin]" @click="emit('relogin', account.host)">
          <span>再ログイン</span>
          <i class="ti ti-login" />
        </button>
        <button class="_button" :class="[$style.navAccountMenuItem, $style.navAccountLogout]" @click="emit('logout')">
          <span>データを削除</span>
          <i class="ti ti-trash" />
        </button>
      </template>
    </div>
</template>

<style lang="scss" module>
@use '@/styles/navMenu';

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
  padding: 4px 12px;
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

.modeActive {
  color: var(--nd-accent, #86b300);
}

.navAccountMenuLabel {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.navAccountMenuDivider {
  height: 1px;
  background: var(--nd-divider);
  margin: 4px 0;
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
  background: color-mix(in srgb, var(--nd-navBg) 80%, transparent);
  backdrop-filter: var(--nd-vibrancy);
  -webkit-backdrop-filter: var(--nd-vibrancy);
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

.menuEnterRight {
  animation: menuInRight 0.18s ease;
}
.menuLeaveRight {
  animation: menuOutRight 0.18s ease forwards;
}

@keyframes menuInRight {
  from { opacity: 0; transform: translateX(-4px) scale(0.97); }
}
@keyframes menuOutRight {
  to { opacity: 0; transform: translateX(-4px) scale(0.97); }
}
</style>
