<script setup lang="ts">
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { computed, defineAsyncComponent, ref } from 'vue'
import { useDeckInit } from '@/composables/useDeckInit'
import { requestMoveColumn } from '@/composables/useDeckWindow'
import { useFileDrop } from '@/composables/useFileDrop'
import { useNavigation } from '@/composables/useNavigation'
import { provideScrollDirection } from '@/composables/useScrollDirection'
import { useUpdater } from '@/composables/useUpdater'
import { useAccountsStore } from '@/stores/accounts'
import { useDeckStore } from '@/stores/deck'
import { useIsCompactLayout } from '@/stores/ui'
import DeckBottomBar from './DeckBottomBar.vue'
import DeckColumnsArea from './DeckColumnsArea.vue'
import DeckMobileNav from './DeckMobileNav.vue'
import DeckNavbar from './DeckNavbar.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)
const AddColumnDialog = defineAsyncComponent(
  () => import('./AddColumnDialog.vue'),
)

const {
  navigateToNote,
  navigateToUser,
  navigateToSearch,
  navigateToNotifications,
} = useNavigation()
const deckStore = useDeckStore()
const accountsStore = useAccountsStore()
const isCompact = useIsCompactLayout()
const navbarRef = ref<InstanceType<typeof DeckNavbar> | null>(null)
const columnsAreaRef = ref<InstanceType<typeof DeckColumnsArea> | null>(null)
const showAddMenu = ref(false)
const showCompose = ref(false)
const showProfileMenu = ref(false)
const showSettingsMenu = ref(false)
const mobileDrawerOpen = ref(false)
const pendingFilePaths = ref<string[]>([])
const activeColumnIndex = ref(0)
const { updateAvailable, checkForUpdate } = useUpdater()

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i

function openCompose() {
  if (accountsStore.accounts.length === 0) return
  showCompose.value = !showCompose.value
  if (!showCompose.value) {
    pendingFilePaths.value = []
  }
}

function closeCompose() {
  showCompose.value = false
  pendingFilePaths.value = []
}

function toggleAddMenu() {
  showAddMenu.value = !showAddMenu.value
}

// File drop handling
const fileDrop = useFileDrop((paths, position) => {
  if (showCompose.value) {
    pendingFilePaths.value = paths
    return
  }

  const el = document.elementFromPoint(position.x, position.y)
  const columnCell = el?.closest('[data-column-id]') as HTMLElement | null

  if (columnCell) {
    const colId = columnCell.dataset.columnId
    const col = colId ? columnsAreaRef.value?.columnMap.get(colId) : undefined
    if (col?.type === 'drive' && col.accountId) {
      const accountId = col.accountId
      for (const path of paths) {
        invoke('api_upload_file_from_path', {
          accountId,
          filePath: path,
          isSensitive: false,
        }).then(() => {
          window.dispatchEvent(
            new CustomEvent('drive-files-changed', { detail: { accountId } }),
          )
        })
      }
      return
    }
  }

  if (
    !columnCell &&
    paths.length === 1 &&
    IMAGE_EXTENSIONS.test(paths[0] ?? '')
  ) {
    deckStore.setWallpaper(convertFileSrc(paths[0] ?? ''))
  }
})

provideScrollDirection()

// Initialize deck data + app-level side effects
deckStore.load()
deckStore.loadWallpaper()

useDeckInit({
  openCompose,
  navigateToSearch,
  navigateToNotifications,
  navigateToNote,
  navigateToUser,
  toggleAddMenu,
  navbarRef,
  checkForUpdate,
})

function scrollToColumn(index: number) {
  activeColumnIndex.value = index
  // フラットインデックスからカラムIDを取得してアクティブカラムを更新
  const flatColumns = deckStore.windowLayout.flat()
  const colId = flatColumns[index]
  if (colId) deckStore.setActiveColumn(colId)
  columnsAreaRef.value?.scrollToColumn(index)
}

// columnMap for DeckMobileNav (computed from store directly)
const columns = computed(() => deckStore.columns)

// Cross-window drag & drop
function acceptCrossWindowDrop() {
  const columnId = deckStore.crossWindowDragColumnId
  if (!columnId) return
  deckStore.crossWindowDragColumnId = null
  // Move column to this window
  requestMoveColumn(columnId, deckStore.currentWindowId ?? null)
}
</script>

<template>
  <div :class="[$style.root, { [$style.mobile]: isCompact }]">
    <DeckNavbar
      ref="navbarRef"
      :mobile-drawer-open="mobileDrawerOpen"
      :show-profile-menu="showProfileMenu"
      :show-settings-menu="showSettingsMenu"
      :update-available="updateAvailable"
      @open-compose="openCompose"
      @update:mobile-drawer-open="mobileDrawerOpen = $event"
      @update:show-profile-menu="showProfileMenu = $event"
      @update:show-settings-menu="showSettingsMenu = $event"
    />

    <!-- Main content area -->
    <div
      :class="[$style.mainArea, { [$style.withWallpaper]: deckStore.wallpaper != null }]"
      :style="{
        backgroundImage:
          deckStore.wallpaper != null ? `url(${deckStore.wallpaper})` : '',
      }"
    >
      <DeckColumnsArea
        ref="columnsAreaRef"
        @active-column-index="activeColumnIndex = $event"
      />

      <DeckBottomBar
        v-if="!isCompact"
        :columns="columns"
        :layout="deckStore.windowLayout"
        :active-column-index="activeColumnIndex"
        :show-profile-menu="showProfileMenu"
        :show-settings-menu="showSettingsMenu"
        :update-available="updateAvailable"
        @scroll-to-column="scrollToColumn"
        @toggle-add-menu="toggleAddMenu"
        @update:show-profile-menu="showProfileMenu = $event"
        @update:show-settings-menu="showSettingsMenu = $event"
      />
    </div>

    <!-- Mobile FAB -->
    <button
      v-if="isCompact"
      class="_button"
      :class="$style.fab"
      title="New Note"
      @click="openCompose"
    >
      <i class="ti ti-pencil" />
    </button>

    <!-- Mobile drawer overlay -->
    <Transition name="fade">
      <div
        v-if="mobileDrawerOpen"
        :class="$style.drawerOverlay"
        @click="mobileDrawerOpen = false"
      />
    </Transition>

    <!-- Mobile bottom nav -->
    <DeckMobileNav
      v-if="isCompact"
      :columns="columns"
      :layout="deckStore.windowLayout"
      :active-column-index="activeColumnIndex"
      @scroll-to-column="scrollToColumn"
      @toggle-add-menu="toggleAddMenu"
      @toggle-drawer="mobileDrawerOpen = !mobileDrawerOpen"
    />

    <!-- Add column popup -->
    <Teleport to="body">
      <Transition name="modal">
        <AddColumnDialog v-if="showAddMenu" @close="showAddMenu = false" />
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="modal">
        <MkPostForm
          v-if="showCompose && accountsStore.accounts.length > 0"
          :account-id="accountsStore.accounts[0]!.id"
          :initial-file-paths="pendingFilePaths"
          @close="closeCompose"
          @posted="closeCompose"
        />
      </Transition>
    </Teleport>

    <!-- File drop overlay -->
    <Transition name="fade">
      <div v-if="fileDrop.isDragging.value" :class="$style.fileDropOverlay">
        <div :class="$style.dropContent">
          <i class="ti ti-upload" />
          <span>ファイルをドロップしてアップロード</span>
        </div>
      </div>
    </Transition>

    <!-- Cross-window column drop overlay -->
    <Transition name="fade">
      <div
        v-if="deckStore.crossWindowDragColumnId"
        :class="$style.crossWindowDropOverlay"
        @click="acceptCrossWindowDrop"
      >
        <div :class="$style.dropContent">
          <i class="ti ti-arrows-move" />
          <span>ここにカラムを移動</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" module>
.root {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
}

.mobile {
  flex-direction: column;
  padding-top: var(--nd-safe-area-top, env(safe-area-inset-top));
  background: var(--nd-navBg);
}

.mainArea {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--nd-deckBg);
}

.withWallpaper {
  background: none;
  background-size: cover;
  background-position: center;
}

.fab {
  display: flex;
  align-items: center;
  justify-content: center;
  position: fixed;
  right: calc(16px + env(safe-area-inset-right));
  bottom: calc(var(--nd-mobileNavHeight, 0px) + 12px);
  z-index: var(--nd-z-overlay);
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(
    90deg,
    var(--nd-buttonGradateA, var(--nd-accent)),
    var(--nd-buttonGradateB, var(--nd-accentDarken))
  );
  color: var(--nd-fgOnAccent, #fff);
  font-size: 20px;
  box-shadow: 0 4px 12px var(--nd-shadow);
  transition: transform var(--nd-duration-slower) ease, box-shadow var(--nd-duration-slow) ease;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--nd-accent) 40%, rgba(0, 0, 0, 0.3));
  }

  &:active {
    transform: scale(0.92);
  }
}

.drawerOverlay {
  position: fixed;
  inset: 0;
  left: 250px;
  z-index: var(--nd-z-navbar);
  background: rgb(0 0 0 / 0.5);
}

.fileDropOverlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--nd-z-popup) - 1);
  background: var(--nd-overlayDark);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.crossWindowDropOverlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--nd-z-popup) - 2);
  background: color-mix(in srgb, var(--nd-accent, #86b300) 20%, rgba(0, 0, 0, 0.5));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 3px dashed var(--nd-accent, #86b300);

  &:hover {
    background: color-mix(in srgb, var(--nd-accent, #86b300) 30%, rgba(0, 0, 0, 0.5));
  }
}

.dropContent {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #fff;
  font-size: 18px;
  font-weight: 600;

  .ti {
    font-size: 48px;
    opacity: 0.9;
  }
}
</style>

<style>
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--nd-duration-slow) ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--nd-duration-slow) ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
