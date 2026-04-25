<script setup lang="ts">
import { computed } from 'vue'
import ThemePreview from '@/components/ThemePreview.vue'
import type { MisskeyTheme } from '@/theme/types'

type Mode = 'installed' | 'store'
type Source = 'builtin' | 'local' | 'misstore' | 'server'

const props = defineProps<{
  mode: Mode
  theme: MisskeyTheme
  source: Source
  // ストア用 (theme オブジェクトに無い情報)
  description?: string
  author?: string
  version?: string
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
      return 'サーバー'
    default:
      return ''
  }
})

const isApplied = computed(
  () => props.isAppliedAccount || props.isAppliedGlobal,
)
</script>

<template>
  <div
    :class="[
      $style.item,
      isAppliedAccount && $style.appliedAccount,
      isAppliedGlobal && !isAppliedAccount && $style.appliedGlobal,
    ]"
  >
    <div :class="$style.previewWrap">
      <ThemePreview :theme="theme" :class="$style.preview" />

      <!-- Hover actions (installed only) -->
      <div v-if="mode === 'installed'" :class="$style.previewActions">
        <button
          v-if="source === 'local'"
          class="_button"
          :class="$style.editBtn"
          title="編集"
          @click.stop="emit('edit')"
        >
          <i class="ti ti-pencil" />
        </button>
        <button
          v-if="removable"
          class="_button"
          :class="$style.removeBtn"
          title="削除"
          @click.stop="emit('remove')"
        >
          <i class="ti ti-x" />
        </button>
      </div>

      <!-- Applied badge -->
      <span
        v-if="isAppliedAccount"
        :class="[$style.appliedBadgeOverlay, $style.appliedBadgeAccount]"
        title="このアカウントで適用中"
      >
        <i class="ti ti-user-check" />
      </span>
      <span
        v-else-if="isAppliedGlobal"
        :class="[$style.appliedBadgeOverlay, $style.appliedBadgeGlobal]"
        title="全アカウントで適用中"
      >
        <i class="ti ti-world" />
      </span>
    </div>

    <div :class="$style.meta">
      <div :class="$style.name" :title="theme.name">{{ theme.name }}</div>
      <div :class="$style.subline">
        <span :class="$style.sourceLabel">{{ sourceLabel }}</span>
        <span v-if="author" :class="$style.author">/ {{ author }}</span>
      </div>
    </div>

    <!-- Action row -->
    <div :class="$style.actionRow">
      <template v-if="mode === 'installed'">
        <button
          v-if="perAccount && isAppliedAccount"
          class="_button"
          :class="$style.secondaryBtn"
          @click.stop="emit('clear-account')"
        >
          解除
        </button>
        <button
          v-if="perAccount"
          class="_button"
          :class="[$style.primaryBtn, isApplied && $style.primaryBtnDim]"
          :disabled="isAppliedAccount"
          @click.stop="emit('apply-account')"
        >
          {{ isAppliedAccount ? '適用中' : 'このアカウント' }}
        </button>
        <button
          v-else
          class="_button"
          :class="[$style.primaryBtn, isAppliedGlobal && $style.primaryBtnDim]"
          :disabled="isAppliedGlobal"
          @click.stop="emit('apply-global')"
        >
          {{ isAppliedGlobal ? '適用中' : '適用' }}
        </button>
      </template>

      <template v-else>
        <button
          class="_button"
          :class="$style.iconBtn"
          title="MisStore で詳細"
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
          済
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
</template>

<style module lang="scss">
.item {
  display: flex;
  flex-direction: column;
  cursor: default;
  border: 2px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  overflow: hidden;
  min-width: 0;
  transition: border-color var(--nd-duration-base);

  &:hover {
    border-color: color-mix(in srgb, var(--nd-accent) 50%, var(--nd-divider));
  }
}

.appliedAccount {
  border-color: var(--nd-accent);
}

.appliedGlobal {
  border-color: var(--nd-success);
}

.previewWrap {
  position: relative;
  display: block;
  border-bottom: 1px solid var(--nd-divider);
}

.preview {
  display: block;
  width: 100%;
  height: auto;
}

.previewActions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 2px;
  z-index: 1;
  opacity: 0;
  transition: opacity var(--nd-duration-fast);

  .item:hover & {
    opacity: 1;
  }

  @media (hover: none) {
    opacity: 1;
  }
}

.editBtn,
.removeBtn {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: filter var(--nd-duration-base);

  &:hover {
    filter: brightness(0.85);
  }
}

.editBtn {
  background: var(--nd-accent, #86b300);
}

.removeBtn {
  background: var(--nd-error, #ec4137);
}

.appliedBadgeOverlay {
  position: absolute;
  top: 4px;
  left: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  z-index: 1;
}

.appliedBadgeAccount {
  background: var(--nd-accent);
}

.appliedBadgeGlobal {
  background: var(--nd-success);
}

.meta {
  padding: 6px 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.name {
  font-size: 12px;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subline {
  display: flex;
  gap: 4px;
  font-size: 10px;
  color: var(--nd-fg);
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sourceLabel {
  flex-shrink: 0;
}

.author {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actionRow {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 8px;
  min-height: 28px;
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
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 2px 6px;
  height: 22px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 2px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  transition:
    filter 0.1s,
    opacity 0.1s;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

.primaryBtnDim {
  background: color-mix(in srgb, var(--nd-accent) 50%, transparent);
}

.secondaryBtn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
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
