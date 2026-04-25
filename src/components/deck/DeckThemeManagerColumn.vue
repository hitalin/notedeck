<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDoubleConfirm } from '@/composables/useDoubleConfirm'
import { useServerImages } from '@/composables/useServerImages'
import { useTabSlide } from '@/composables/useTabSlide'
import { getAccountAvatarUrl, useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { type StoreThemeEntry, useMisStoreStore } from '@/stores/misstore'
import { useThemeStore } from '@/stores/theme'
import { useWindowsStore } from '@/stores/windows'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'
import type { MisskeyTheme } from '@/theme/types'
import type { ColumnTabDef } from './ColumnTabs.vue'
import ColumnTabs from './ColumnTabs.vue'
import DeckColumn from './DeckColumn.vue'
import ThemeCard from './ThemeCard.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const themeStore = useThemeStore()
const misStore = useMisStoreStore()
const windowsStore = useWindowsStore()
const accountsStore = useAccountsStore()
const { serverIconUrl } = useServerImages(() => props.column)

misStore.fetchThemes()

// --- Mode resolution ---
const isCrossAccount = computed(() => props.column.accountId == null)
const account = computed(() =>
  isCrossAccount.value
    ? null
    : (accountsStore.accounts.find((a) => a.id === props.column.accountId) ??
      null),
)
const accountId = computed(() => props.column.accountId)

// --- View mode ---
type ViewTab = 'installed' | 'store'
const viewTabs: ViewTab[] = ['installed', 'store']
const viewTab = ref<ViewTab>('installed')
const columnContentRef = ref<HTMLElement | null>(null)

// --- Source-tagged theme list ---
type Source = 'builtin' | 'local' | 'misstore' | 'server'
interface ThemeEntry {
  theme: MisskeyTheme
  source: Source
  removable: boolean
}

const installedThemesList = computed<ThemeEntry[]>(() => {
  const list: ThemeEntry[] = [
    { theme: DARK_THEME, source: 'builtin', removable: false },
    { theme: LIGHT_THEME, source: 'builtin', removable: false },
  ]
  for (const t of themeStore.installedThemes) {
    const source: Source = t.$notedeck?.storeId ? 'misstore' : 'local'
    list.push({ theme: t, source, removable: true })
  }
  // per-account モード時のみ「サーバー由来」を末尾に追加
  if (!isCrossAccount.value && accountId.value) {
    const cached = themeStore.accountThemeCache.get(accountId.value)
    if (cached?.dark) {
      list.push({ theme: cached.dark, source: 'server', removable: false })
    }
    if (cached?.light) {
      list.push({ theme: cached.light, source: 'server', removable: false })
    }
  }
  return list
})

const tabDefs = computed<ColumnTabDef[]>(() => [
  {
    value: 'installed',
    label: `インストール済み ${installedThemesList.value.length}`,
  },
  { value: 'store', label: 'ストア' },
])

function switchTab(tab: string) {
  viewTab.value = tab as ViewTab
  if (tab === 'store') misStore.fetchThemes()
}

const tabIndex = computed(() => viewTabs.indexOf(viewTab.value))
useTabSlide(tabIndex, columnContentRef)

// --- Search ---
const searchQuery = ref('')
const storeQuery = ref('')

const filteredInstalled = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return installedThemesList.value
  return installedThemesList.value.filter(
    (e) =>
      e.theme.name.toLowerCase().includes(q) ||
      e.theme.id.toLowerCase().includes(q),
  )
})

const filteredStoreThemes = computed(() => {
  const q = storeQuery.value.trim().toLowerCase()
  if (!q) return misStore.themes
  return misStore.themes.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.author.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q)),
  )
})

// --- Adoption status ---
function isAppliedToAccount(theme: MisskeyTheme): boolean {
  if (!accountId.value) return false
  const cached = themeStore.accountThemeCache.get(accountId.value)
  // accountThemeCache の theme は base ごとに 'account-{mode}-{accountId}' に
  // 書き換えられているため、内容 (props 参照) で照合する。
  return (
    cached?.dark?.props === theme.props || cached?.light?.props === theme.props
  )
}

function isAppliedToGlobal(theme: MisskeyTheme): boolean {
  return (
    themeStore.selectedDarkThemeId === theme.id ||
    themeStore.selectedLightThemeId === theme.id ||
    (theme.id === 'dark' && !themeStore.selectedDarkThemeId) ||
    (theme.id === 'light' && !themeStore.selectedLightThemeId)
  )
}

// --- Actions ---
async function applyToAccount(entry: ThemeEntry) {
  if (!accountId.value) return
  const mode = entry.theme.base ?? 'dark'
  await themeStore.applyAccountTheme(entry.theme, mode, accountId.value)
}

async function clearForAccount(entry: ThemeEntry) {
  if (!accountId.value) return
  const mode = entry.theme.base ?? 'dark'
  await themeStore.clearAccountTheme(mode, accountId.value)
}

function applyToGlobal(entry: ThemeEntry) {
  const mode = entry.theme.base ?? 'dark'
  themeStore.selectTheme(entry.theme.id, mode)
}

function editTheme(entry: ThemeEntry) {
  windowsStore.open('themeEditor', { initialThemeId: entry.theme.id })
}

const removingId = ref<string | null>(null)
const { confirming: confirmingRemove, trigger: triggerRemove } =
  useDoubleConfirm()

function removeTheme(entry: ThemeEntry) {
  removingId.value = entry.theme.id
  triggerRemove(() => {
    themeStore.removeTheme(entry.theme.id)
    removingId.value = null
  })
}

const installError = ref<string | null>(null)

async function handleStoreInstall(entry: StoreThemeEntry) {
  installError.value = null
  try {
    await misStore.installTheme(entry)
  } catch (e) {
    installError.value = e instanceof Error ? e.message : 'インストール失敗'
  }
}

function openNewTheme() {
  windowsStore.open('themeEditor', {})
}

// Store entry → MisskeyTheme (preview 用)
// MisStore のエントリは previewColors を持たない場合があるため null-safe にする
function storeEntryToTheme(entry: StoreThemeEntry): MisskeyTheme {
  const colors =
    entry.previewColors ?? ({} as Partial<typeof entry.previewColors>)
  const fallback =
    entry.base === 'light'
      ? { bg: '#ffffff', fg: '#000000', panel: '#f0f0f0', accent: '#86b300' }
      : { bg: '#1a1a1a', fg: '#ffffff', panel: '#2d2d2d', accent: '#86b300' }
  return {
    id: entry.id,
    name: entry.name,
    base: entry.base,
    props: {
      bg: colors.bg ?? fallback.bg,
      fg: colors.fg ?? fallback.fg,
      panel: colors.panel ?? fallback.panel,
      accent: colors.accent ?? fallback.accent,
    },
  }
}
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name ?? 'テーマ'"
    @header-click="() => {}"
  >
    <template #header-icon>
      <i class="ti ti-palette" :class="$style.tlHeaderIcon" />
    </template>

    <template #header-meta>
      <div v-if="!isCrossAccount && account" :class="$style.headerAccount">
        <img :src="getAccountAvatarUrl(account)" :class="$style.headerAvatar" />
        <img
          :class="$style.headerFavicon"
          :src="serverIconUrl || `https://${account.host}/favicon.ico`"
          :title="account.host"
          @error="($event.target as HTMLImageElement).src = '/server-icon-error.svg'"
        />
      </div>
      <button
        v-if="viewTab === 'installed'"
        class="_button"
        :class="$style.headerBtn"
        title="新規テーマを作成"
        @click.stop="openNewTheme"
      >
        <i class="ti ti-plus" />
      </button>
      <button
        v-if="viewTab === 'store'"
        class="_button"
        :class="$style.headerBtn"
        title="リロード"
        @click.stop="misStore.refreshThemes()"
      >
        <i class="ti ti-refresh" />
      </button>
    </template>

    <div ref="columnContentRef" :class="$style.wrapper">
      <ColumnTabs
        :tabs="tabDefs"
        :model-value="viewTab"
        :swipe-target="columnContentRef"
        @update:model-value="switchTab"
      />

      <div :class="$style.searchWrap">
        <input
          v-if="viewTab === 'installed'"
          v-model="searchQuery"
          :class="$style.searchInput"
          type="text"
          placeholder="テーマを検索..."
        />
        <input
          v-else
          v-model="storeQuery"
          :class="$style.searchInput"
          type="text"
          placeholder="ストアを検索..."
        />
      </div>

      <!-- ===== Installed tab ===== -->
      <template v-if="viewTab === 'installed'">
        <div :class="$style.scroll">
          <div :class="$style.grid">
            <ThemeCard
              v-for="entry in filteredInstalled"
              :key="`${entry.source}:${entry.theme.id}`"
              mode="installed"
              :theme="entry.theme"
              :source="entry.source"
              :is-applied-account="isAppliedToAccount(entry.theme)"
              :is-applied-global="isAppliedToGlobal(entry.theme)"
              :per-account="!isCrossAccount"
              :removable="entry.removable && !(removingId === entry.theme.id && confirmingRemove)"
              @apply-account="applyToAccount(entry)"
              @apply-global="applyToGlobal(entry)"
              @clear-account="clearForAccount(entry)"
              @edit="editTheme(entry)"
              @remove="removeTheme(entry)"
            />
          </div>

          <div v-if="filteredInstalled.length === 0" :class="$style.empty">
            <template v-if="searchQuery">
              一致するテーマがありません
            </template>
            <template v-else>
              <i class="ti ti-palette" :class="$style.emptyIcon" />
              <span>テーマがありません</span>
              <button class="_button" :class="$style.emptyLink" @click="viewTab = 'store'">
                ストアからインストール...
              </button>
            </template>
          </div>
        </div>
      </template>

      <!-- ===== Store tab ===== -->
      <template v-else>
        <div v-if="installError" :class="$style.storeError">
          <i class="ti ti-alert-circle" />
          {{ installError }}
          <button class="_button" :class="$style.storeErrorClose" @click="installError = null">
            <i class="ti ti-x" />
          </button>
        </div>

        <div v-if="misStore.themesLoading" :class="$style.storeLoading">
          <i class="ti ti-loader-2 nd-spin" />
          読み込み中...
        </div>

        <div v-else-if="misStore.themesError" :class="$style.empty">
          <i class="ti ti-cloud-off" :class="$style.emptyIcon" />
          <span>ストアに接続できません</span>
          <button class="_button" :class="$style.emptyLink" @click="misStore.refreshThemes()">
            再試行
          </button>
        </div>

        <div v-else :class="$style.scroll">
          <div :class="$style.grid">
            <ThemeCard
              v-for="entry in filteredStoreThemes"
              :key="entry.id"
              mode="store"
              :theme="storeEntryToTheme(entry)"
              source="misstore"
              :description="entry.description"
              :author="entry.author"
              :version="entry.version"
              :installing="misStore.installingTheme === entry.id"
              :already-installed="misStore.isThemeInstalled(entry)"
              @install="handleStoreInstall(entry)"
              @open-detail="() => {}"
            />
          </div>

          <div v-if="filteredStoreThemes.length === 0 && !misStore.themesLoading" :class="$style.empty">
            一致するテーマがありません
          </div>
        </div>
      </template>
    </div>
  </DeckColumn>
</template>

<style module lang="scss">
@use './column-common.module.scss';

.headerBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.6;
  transition:
    background 0.1s,
    opacity 0.1s;

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }
}

.searchWrap {
  display: flex;
  align-items: center;
  padding: 6px 10px 4px;
  width: 100%;
}

.searchInput {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--nd-divider);
  border-radius: 2px;
  background: var(--nd-inputBg, var(--nd-bg));
  color: var(--nd-fg);
  font-size: 12px;

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.4;
  }

  &:focus {
    outline: none;
    border-color: var(--nd-accent);
  }
}

.wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 8px 10px;
}

.storeLoading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 13px;
}

.storeError {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  margin: 6px 10px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--nd-love) 10%, transparent);
  color: var(--nd-love);
  font-size: 12px;
  flex-shrink: 0;
}

.storeErrorClose {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  opacity: 0.6;
  font-size: 12px;

  &:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--nd-love) 15%, transparent);
  }
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 13px;
  text-align: center;
}

.emptyIcon {
  font-size: 36px;
  opacity: 0.3;
}

.emptyLink {
  color: var(--nd-accent);
  font-size: 12px;
  margin-top: 4px;
  opacity: 0.8;
  transition: opacity 0.1s;

  &:hover {
    opacity: 1;
    text-decoration: underline;
  }
}
</style>
