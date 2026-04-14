<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import JSON5 from 'json5'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import EditorTabs from '@/components/common/EditorTabs.vue'
import type { ReorderableItem } from '@/components/common/ReorderableList.vue'
import ReorderableList from '@/components/common/ReorderableList.vue'
import { useClipboardFeedback } from '@/composables/useClipboardFeedback'
import { useEditorTabs } from '@/composables/useEditorTabs'
import {
  type Account,
  getAccountAvatarUrl,
  getAccountLabel,
  isGuestAccount,
  useAccountsStore,
} from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'
import { proxyThumbUrl } from '@/utils/imageProxy'

const CodeEditor = defineAsyncComponent(
  () => import('@/components/deck/widgets/CodeEditor.vue'),
)

const props = defineProps<{
  initialTab?: string
}>()

const emit = defineEmits<{ close: [] }>()

const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const jsonLang = json()

function getServerIconUrl(host: string): string | undefined {
  const url =
    serversStore.getServer(host)?.iconUrl || `https://${host}/favicon.ico`
  return proxyThumbUrl(url, 28)
}

// ── Tab management ──
const { tab, containerRef: contentRef } = useEditorTabs(
  ['visual', 'code'] as const,
  (props.initialTab as 'visual' | 'code') ?? 'visual',
)

// ── ReorderableList items ──
const reorderableItems = computed<ReorderableItem[]>(() =>
  accountsStore.accounts.map((acc) => ({
    icon: isGuestAccount(acc) ? 'user-question' : 'user',
    label: getAccountLabel(acc),
    avatarUrl: proxyThumbUrl(getAccountAvatarUrl(acc), 36),
    serverIconUrl: getServerIconUrl(acc.host),
  })),
)

function onReorder(fromIdx: number, toIdx: number) {
  accountsStore.reorderAccount(fromIdx, toIdx)
}

function onRemove(index: number) {
  const acc = accountsStore.accounts[index]
  if (!acc) return
  removingAccountId.value = acc.id
}

// ── Remove confirmation ──
const removingAccountId = ref<string | null>(null)

const removingAccount = computed(() =>
  removingAccountId.value
    ? (accountsStore.accountMap.get(removingAccountId.value) ?? null)
    : null,
)

function cancelRemove() {
  removingAccountId.value = null
}

async function confirmLogout() {
  if (!removingAccountId.value) return
  const id = removingAccountId.value
  await accountsStore.logoutAccount(id)
  removingAccountId.value = null
}

async function confirmDelete() {
  if (!removingAccountId.value) return
  const id = removingAccountId.value
  await accountsStore.removeAccount(id)
  removingAccountId.value = null
  if (accountsStore.accounts.length === 0) emit('close')
}

// ── Code tab ──
function accountsToJson5(): string {
  const data = accountsStore.accounts.map((acc) => ({
    id: acc.id,
    host: acc.host,
    username: acc.username,
    displayName: acc.displayName,
    hasToken: acc.hasToken,
  }))
  return JSON5.stringify(data, null, 2)
}

const jsonCode = ref(accountsToJson5())
const codeError = ref<string | null>(null)

watch(tab, (t) => {
  if (t === 'code') {
    jsonCode.value = accountsToJson5()
    codeError.value = null
  }
})

watch(
  () => accountsStore.accounts,
  () => {
    if (tab.value === 'code') {
      const storeJson = accountsToJson5()
      if (storeJson !== jsonCode.value) {
        jsonCode.value = storeJson
      }
    }
  },
  { deep: true },
)

function applyFromCode() {
  try {
    const parsed = JSON5.parse(jsonCode.value)
    if (!Array.isArray(parsed)) {
      codeError.value = '配列が必要です'
      return
    }
    const importedIds = parsed
      .map((item: { id?: string }) => item.id)
      .filter((id): id is string => typeof id === 'string')
    const byId = new Map(accountsStore.accounts.map((a) => [a.id, a]))
    const ordered: Account[] = []
    for (const id of importedIds) {
      const acc = byId.get(id)
      if (acc) {
        ordered.push(acc)
        byId.delete(id)
      }
    }
    for (const acc of byId.values()) ordered.push(acc)
    for (let i = 0; i < ordered.length; i++) {
      const currentIdx = accountsStore.accounts.findIndex(
        (a) => a.id === ordered[i]?.id,
      )
      if (currentIdx !== i && currentIdx >= 0) {
        accountsStore.reorderAccount(currentIdx, i)
      }
    }
    codeError.value = null
  } catch (e) {
    codeError.value = e instanceof Error ? e.message : '無効な JSON5'
  }
}

// ── Export / Import ──
const { copied: copiedMessage, showCopied } = useClipboardFeedback()

async function exportAccounts() {
  try {
    await navigator.clipboard.writeText(accountsToJson5())
    showCopied()
  } catch {
    /* clipboard access denied */
  }
}

async function importAccountOrder() {
  try {
    const text = await navigator.clipboard.readText()
    const parsed = JSON5.parse(text)
    if (!Array.isArray(parsed)) return
    const importedIds = parsed
      .map((item: { id?: string }) => item.id)
      .filter((id): id is string => typeof id === 'string')
    const byId = new Map(accountsStore.accounts.map((a) => [a.id, a]))
    const ordered: Account[] = []
    for (const id of importedIds) {
      const acc = byId.get(id)
      if (acc) {
        ordered.push(acc)
        byId.delete(id)
      }
    }
    for (const acc of byId.values()) ordered.push(acc)
    for (let i = 0; i < ordered.length; i++) {
      const currentIdx = accountsStore.accounts.findIndex(
        (a) => a.id === ordered[i]?.id,
      )
      if (currentIdx !== i && currentIdx >= 0) {
        accountsStore.reorderAccount(currentIdx, i)
      }
    }
  } catch {
    /* clipboard access denied or invalid */
  }
}
</script>

<template>
  <div ref="contentRef" :class="$style.editor">
    <EditorTabs
      v-model="tab"
      :tabs="[
        { value: 'visual', icon: 'adjustments', label: 'ビジュアル' },
        { value: 'code', icon: 'code', label: 'コード' },
      ]"
    />

    <!-- Visual tab -->
    <div v-show="tab === 'visual'" :class="$style.visualPanel">
      <div :class="$style.sectionHeader">
        <i class="ti ti-users" />
        アカウント一覧
        <span :class="$style.badge">{{ accountsStore.accounts.length }}</span>
      </div>

      <ReorderableList
        :items="reorderableItems"
        data-attr="acc-idx"
        empty-text="アカウントなし"
        @reorder="onReorder"
        @remove="onRemove"
      />

      <!-- Remove confirmation overlay -->
      <div v-if="removingAccount" :class="$style.confirmOverlay">
        <div :class="$style.confirmCard">
          <div :class="$style.confirmTitle">
            <i class="ti ti-alert-triangle" />
            アカウント操作
          </div>
          <div :class="$style.confirmAccount">
            {{ getAccountLabel(removingAccount) }}
          </div>
          <div :class="$style.confirmActions">
            <button class="_button" :class="$style.btnCancel" @click="cancelRemove">
              キャンセル
            </button>
            <button
              v-if="removingAccount.hasToken"
              class="_button"
              :class="$style.btnLogout"
              @click="confirmLogout"
            >
              <i class="ti ti-logout" />
              ログアウト
            </button>
            <button class="_button" :class="$style.btnDelete" @click="confirmDelete">
              <i class="ti ti-trash" />
              データ削除
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Code tab -->
    <div v-show="tab === 'code'" :class="$style.codePanel">
      <div :class="$style.codeHint">
        アカウント一覧の JSON5（コピーしてバックアップ可能）
      </div>
      <CodeEditor
        v-model="jsonCode"
        :language="jsonLang"
        :class="[$style.codeEditorWrap, { [$style.hasError]: codeError }]"
        auto-height
      />
      <div v-if="codeError" :class="$style.errorMessage">
        <i class="ti ti-alert-triangle" />
        {{ codeError }}
      </div>
      <div v-if="!codeError && jsonCode.trim() && jsonCode.trim() !== '[]'" :class="$style.codeSuccess">
        <i class="ti ti-check" />
        適用中
      </div>
      <button class="_button" :class="$style.codeApplyBtn" @click="applyFromCode">
        <i class="ti ti-refresh" />
        ビジュアルに同期
      </button>
    </div>

    <!-- Actions (footer) -->
    <div :class="$style.actions">
      <div :class="$style.actionGroup">
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary]"
          @click="importAccountOrder"
        >
          <i class="ti ti-clipboard-text" />
          インポート
        </button>
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary, { [$style.feedback]: copiedMessage }]"
          @click="exportAccounts"
        >
          <i class="ti ti-clipboard-copy" />
          {{ copiedMessage ? 'コピー済み' : 'エクスポート' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" module>
@use '@/styles/buttons' as *;

.editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

// ── Visual tab ──

.visualPanel {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.sectionHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px 6px;
  font-size: 0.75em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.5;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.badge {
  margin-left: auto;
  font-weight: normal;
  opacity: 0.8;
}

// ── Confirm overlay ──

.confirmOverlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--nd-panel) 85%, transparent);
  backdrop-filter: var(--nd-vibrancy);
  -webkit-backdrop-filter: var(--nd-vibrancy);
  z-index: 10;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
}

.confirmCard {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  background: var(--nd-panel);
  border-radius: var(--nd-radius);
  box-shadow: 0 4px 16px var(--nd-shadow);
  max-width: 300px;
  width: 100%;
}

.confirmTitle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: bold;
  font-size: 0.9em;
  color: var(--nd-love, #ec4137);
}

.confirmAccount {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.8;
  word-break: break-all;
}

.confirmActions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btnCancel {
  @include btn-secondary;
  width: 100%;
}

.btnLogout {
  @include btn-base;
  width: 100%;
  background: var(--nd-buttonBg);
  color: var(--nd-accent);

  &:hover {
    background: color-mix(in srgb, var(--nd-accent) 15%, var(--nd-buttonBg));
  }
}

.btnDelete {
  @include btn-danger;
  width: 100%;
}

// ── Code tab ──

.codePanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.codeHint {
  font-size: 0.75em;
  opacity: 0.5;
}

.codeEditorWrap {
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);

  &.hasError {
    border-color: var(--nd-love, #ec4137);
  }
}

.errorMessage {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75em;
  color: var(--nd-love, #ec4137);
}

.codeSuccess {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75em;
  color: var(--nd-accent);
  opacity: 0.7;
}

.codeApplyBtn {
  @include btn-secondary;
}

// ── Footer ──

.actions {
  @include action-bar;
}

.actionGroup {
  @include action-group;
}

.actionBtn {
  &.secondary {
    @include btn-action;
  }
}

.secondary {
  /* modifier */
}

.feedback {
  /* modifier */
}
</style>
