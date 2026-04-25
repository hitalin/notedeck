<script setup lang="ts">
import { computed } from 'vue'

type Mode = 'installed' | 'store'
type Source = 'builtin' | 'local' | 'misstore' | 'server'

const props = defineProps<{
  mode: Mode
  name: string
  description?: string
  author?: string
  version?: string
  base?: 'dark' | 'light'
  source: Source
  // プレビュー用カラー (props.bg / fg / accent)
  previewBg: string
  previewFg: string
  previewAccent: string
  // 状態
  installing?: boolean
  alreadyInstalled?: boolean
  isAppliedAccount?: boolean
  isAppliedGlobal?: boolean
  // per-account / cross-account モード
  perAccount?: boolean
  // 削除可能か (builtin は不可)
  removable?: boolean
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'apply-account'): void
  (e: 'apply-global'): void
  (e: 'clear-account'): void
  (e: 'edit'): void
  (e: 'remove'): void
  (e: 'install'): void
  (e: 'open-detail'): void
}>()

const sourceLabel = computed<string>(() => {
  switch (props.source) {
    case 'builtin':
      return 'ビルトイン'
    case 'local':
      return 'ローカル'
    case 'misstore':
      return 'MisStore'
    case 'server':
      return 'Misskey サーバー'
    default:
      return ''
  }
})

const sourceIcon = computed<string>(() => {
  switch (props.source) {
    case 'builtin':
      return 'ti-package'
    case 'local':
      return 'ti-device-floppy'
    case 'misstore':
      return 'ti-cloud'
    case 'server':
      return 'ti-server'
    default:
      return 'ti-palette'
  }
})

const previewStyle = computed(() => ({
  background: props.previewBg,
  color: props.previewFg,
  '--accent': props.previewAccent,
}))
</script>

<template>
  <div :class="$style.card" @click="emit('click')">
    <div :class="$style.accentBar" :style="{ background: previewAccent }" />
    <div :class="$style.preview" :style="previewStyle">
      <span :class="$style.previewName">{{ name.charAt(0).toUpperCase() }}</span>
      <span :class="$style.previewAccent" />
    </div>
    <div :class="$style.body">
      <div :class="$style.row1">
        <span :class="$style.name">{{ name }}</span>
        <span v-if="base" :class="[$style.baseBadge, base === 'dark' ? $style.baseBadgeDark : $style.baseBadgeLight]">
          {{ base === 'dark' ? 'Dark' : 'Light' }}
        </span>
        <span :class="$style.spacer" />
        <span v-if="version" :class="$style.version">v{{ version }}</span>
      </div>
      <div v-if="description" :class="$style.row2">{{ description }}</div>
      <div :class="$style.row3">
        <span v-if="author" :class="$style.author">{{ author }}</span>
        <span :class="$style.sourceBadge">
          <i class="ti" :class="sourceIcon" />
          {{ sourceLabel }}
        </span>
        <span v-if="isAppliedAccount" :class="[$style.appliedBadge, $style.appliedAccount]" title="このアカウントで適用中">
          <i class="ti ti-user-check" /> アカウント
        </span>
        <span v-else-if="isAppliedGlobal" :class="[$style.appliedBadge, $style.appliedGlobal]" title="全アカウントで適用中">
          <i class="ti ti-world" /> Global
        </span>
        <span :class="$style.spacer" />
        <div :class="$style.actions">
          <!-- Installed mode -->
          <template v-if="mode === 'installed'">
            <button
              v-if="removable"
              class="_button"
              :class="$style.iconBtn"
              title="削除"
              @click.stop="emit('remove')"
            >
              <i class="ti ti-trash" />
            </button>
            <button
              v-if="source === 'local'"
              class="_button"
              :class="$style.iconBtn"
              title="編集"
              @click.stop="emit('edit')"
            >
              <i class="ti ti-pencil" />
            </button>
            <button
              v-if="perAccount && isAppliedAccount"
              class="_button"
              :class="$style.secondaryBtn"
              title="このアカウントの設定を解除"
              @click.stop="emit('clear-account')"
            >
              解除
            </button>
            <button
              v-if="perAccount"
              class="_button"
              :class="[$style.primaryBtn, isAppliedAccount && $style.primaryBtnDim]"
              :title="isAppliedAccount ? '適用中' : 'このアカウントに適用'"
              :disabled="isAppliedAccount"
              @click.stop="emit('apply-account')"
            >
              <i class="ti ti-user-check" />
              {{ isAppliedAccount ? '適用中' : 'このアカウント' }}
            </button>
            <button
              v-else
              class="_button"
              :class="[$style.primaryBtn, isAppliedGlobal && $style.primaryBtnDim]"
              :title="isAppliedGlobal ? '適用中' : '全アカウントに適用'"
              :disabled="isAppliedGlobal"
              @click.stop="emit('apply-global')"
            >
              <i class="ti ti-world" />
              {{ isAppliedGlobal ? '適用中' : '全アカウント' }}
            </button>
          </template>

          <!-- Store mode -->
          <template v-else>
            <button
              class="_button"
              :class="$style.iconBtn"
              title="MisStore で詳細を開く"
              @click.stop="emit('open-detail')"
            >
              <i class="ti ti-external-link" />
            </button>
            <button
              v-if="alreadyInstalled"
              class="_button"
              :class="$style.installedBadge"
              disabled
            >
              インストール済み
            </button>
            <button
              v-else
              class="_button"
              :class="$style.primaryBtn"
              :disabled="installing"
              @click.stop="emit('install')"
            >
              <i v-if="installing" class="ti ti-loader-2 nd-spin" />
              <i v-else class="ti ti-download" />
              {{ installing ? '...' : 'インストール' }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style module lang="scss">
.card {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 12px 14px 12px 16px;
  cursor: pointer;
  transition: background 0.1s;

  &:hover {
    background: var(--nd-buttonHoverBg);

    .accentBar {
      opacity: 1;
    }
  }

  & + & {
    border-top: 1px solid color-mix(in srgb, var(--nd-divider) 50%, transparent);
  }
}

.accentBar {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 2px;
  border-radius: 0 2px 2px 0;
  opacity: 0;
  transition: opacity 0.1s;
}

.preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 6px;
  font-size: 22px;
  font-weight: 700;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--nd-divider) 50%, transparent);
}

.previewName {
  position: relative;
  z-index: 1;
}

.previewAccent {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 6px;
  background: var(--accent);
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row1 {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.name {
  font-size: 13px;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex-shrink: 1;
}

.baseBadge {
  flex-shrink: 0;
  padding: 0 5px;
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  height: 14px;
  border-radius: 2px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.baseBadgeDark {
  background: color-mix(in srgb, var(--nd-fg) 25%, transparent);
  color: var(--nd-fg);
}

.baseBadgeLight {
  background: color-mix(in srgb, var(--nd-warn) 25%, transparent);
  color: var(--nd-warn);
}

.version {
  font-size: 11px;
  color: var(--nd-fg);
  opacity: 0.45;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.row2 {
  font-size: 12px;
  color: var(--nd-fg);
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
  margin-top: 1px;
}

.row3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  min-width: 0;
  min-height: 20px;
}

.author {
  font-size: 11px;
  color: var(--nd-fg);
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  min-width: 0;
}

.sourceBadge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nd-fg) 8%, transparent);
  color: var(--nd-fg);
  opacity: 0.6;
  flex-shrink: 0;
  line-height: 1.3;
}

.appliedBadge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  flex-shrink: 0;
  line-height: 1.3;
  font-weight: 600;
}

.appliedAccount {
  background: color-mix(in srgb, var(--nd-accent) 18%, transparent);
  color: var(--nd-accent);
}

.appliedGlobal {
  background: color-mix(in srgb, var(--nd-success) 18%, transparent);
  color: var(--nd-success);
}

.spacer {
  flex: 1;
  min-width: 4px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.iconBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 3px;
  color: var(--nd-fg);
  font-size: 13px;
  opacity: 0.7;
  transition:
    background 0.1s,
    color 0.1s,
    opacity 0.1s;

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }
}

.primaryBtn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  height: 22px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 2px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  transition:
    filter 0.1s,
    opacity 0.1s;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  &:disabled {
    opacity: 0.5;
  }
}

.primaryBtnDim {
  background: color-mix(in srgb, var(--nd-accent) 50%, transparent);
}

.secondaryBtn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  height: 22px;
  font-size: 11px;
  border-radius: 2px;
  background: transparent;
  border: 1px solid var(--nd-divider);
  color: var(--nd-fg);

  &:hover:not(:disabled) {
    background: var(--nd-buttonHoverBg);
  }
}

.installedBadge {
  flex-shrink: 0;
  padding: 2px 8px;
  height: 22px;
  display: flex;
  align-items: center;
  font-size: 10px;
  border-radius: 2px;
  border: 1px solid var(--nd-divider);
  color: var(--nd-fg);
  opacity: 0.5;
  cursor: default;
}
</style>
