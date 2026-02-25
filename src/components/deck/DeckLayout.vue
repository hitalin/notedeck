<script setup lang="ts">
import { onMounted, ref } from 'vue'
import DeckTimelineColumn from './DeckTimelineColumn.vue'
import DeckNotificationColumn from './DeckNotificationColumn.vue'
import DeckSearchColumn from './DeckSearchColumn.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
import { useDeckStore } from '@/stores/deck'
import { useAccountsStore } from '@/stores/accounts'
import { useGlobalShortcuts } from '@/composables/useGlobalShortcuts'
import { initDesktopNotifications } from '@/utils/desktopNotification'

const deckStore = useDeckStore()
const accountsStore = useAccountsStore()

const showAddMenu = ref(false)
const showCompose = ref(false)

function openCompose() {
  if (accountsStore.accounts.length === 0) return
  showCompose.value = true
}

function closeCompose() {
  showCompose.value = false
}

const addColumnType = ref<'timeline' | 'notifications' | 'search' | null>(null)

function selectColumnType(type: 'timeline' | 'notifications' | 'search') {
  addColumnType.value = type
}

function addColumnForAccount(accountId: string) {
  const type = addColumnType.value || 'timeline'
  deckStore.addColumn({
    type,
    name: null,
    width: 330,
    accountId,
    tl: type === 'timeline' ? 'home' : undefined,
    active: true,
  })
  showAddMenu.value = false
  addColumnType.value = null
}

function toggleAddMenu() {
  showAddMenu.value = !showAddMenu.value
}

const { init: initShortcuts } = useGlobalShortcuts({
  onCompose: () => openCompose(),
})

onMounted(() => {
  deckStore.load()
  initDesktopNotifications()
  initShortcuts()
})
</script>

<template>
  <div class="deck-root">
    <!-- Column area -->
    <div class="columns">
      <template v-for="group in deckStore.layout" :key="group.join('-')">
        <section v-for="colId in group" :key="colId" class="column-section">
          <DeckTimelineColumn
            v-if="deckStore.getColumn(colId)?.type === 'timeline'"
            :column="deckStore.getColumn(colId)!"
          />
          <DeckNotificationColumn
            v-else-if="deckStore.getColumn(colId)?.type === 'notifications'"
            :column="deckStore.getColumn(colId)!"
          />
          <DeckSearchColumn
            v-else-if="deckStore.getColumn(colId)?.type === 'search'"
            :column="deckStore.getColumn(colId)!"
          />
        </section>
      </template>
    </div>

    <!-- Side menu (Misskey deck style - narrow) -->
    <div class="side-menu">
      <div class="side-menu-top">
        <button
          class="_button menu-item"
          title="New Note"
          @click="openCompose"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        </button>
        <button
          class="_button menu-item"
          title="Add column"
          @click="toggleAddMenu"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              d="M12 4v16M4 12h16"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              fill="none"
            />
          </svg>
        </button>
      </div>

      <!-- Account avatars -->
      <div v-if="accountsStore.accounts.length > 0" class="side-menu-accounts">
        <button
          v-for="acc in accountsStore.accounts"
          :key="acc.id"
          class="_button menu-account-btn"
          :title="`@${acc.username}@${acc.host}`"
        >
          <img
            v-if="acc.avatarUrl"
            :src="acc.avatarUrl"
            class="menu-account-avatar"
          />
          <div v-else class="menu-account-avatar menu-avatar-placeholder" />
        </button>
      </div>

      <div class="side-menu-middle" />

      <div class="side-menu-bottom">
        <router-link
          to="/login"
          class="_button menu-item"
          title="Add account"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        </router-link>

        <router-link
          to="/settings"
          class="_button menu-item"
          title="Settings"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path
              d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
              stroke="currentColor"
              stroke-width="1.5"
              fill="none"
            />
            <circle
              cx="12"
              cy="12"
              r="3"
              stroke="currentColor"
              stroke-width="1.5"
              fill="none"
            />
          </svg>
        </router-link>
      </div>
    </div>

    <!-- Add column popup -->
    <Teleport to="body">
      <div v-if="showAddMenu" class="add-overlay" @click="showAddMenu = false; addColumnType = null">
        <div class="add-popup" @click.stop>
          <div class="add-popup-header">
            <button v-if="addColumnType" class="_button add-back-btn" @click="addColumnType = null">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
            </button>
            {{ addColumnType ? 'Select account' : 'Add column' }}
          </div>

          <!-- Step 1: Column type selection -->
          <template v-if="!addColumnType">
            <button class="_button add-type-btn" @click="selectColumnType('timeline')">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-2 0h2"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
              <span>Timeline</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('notifications')">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
              <span>Notifications</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('search')">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
              <span>Search</span>
            </button>
          </template>

          <!-- Step 2: Account selection -->
          <template v-else>
            <div
              v-if="accountsStore.accounts.length === 0"
              class="add-popup-empty"
            >
              No accounts registered.
              <router-link to="/login" @click="showAddMenu = false; addColumnType = null">
                Add account
              </router-link>
            </div>

            <button
              v-for="account in accountsStore.accounts"
              :key="account.id"
              class="_button add-account-btn"
              @click="addColumnForAccount(account.id)"
            >
              <img
                v-if="account.avatarUrl"
                :src="account.avatarUrl"
                class="add-account-avatar"
              />
              <span>@{{ account.username }}@{{ account.host }}</span>
            </button>
          </template>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <MkPostForm
        v-if="showCompose && accountsStore.accounts.length > 0"
        :account-id="accountsStore.accounts[0]!.id"
        @close="closeCompose"
        @posted="closeCompose"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.deck-root {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--nd-deckBg);
}

.columns {
  flex: 1;
  display: flex;
  gap: var(--nd-columnGap);
  padding: var(--nd-columnGap);
  overflow-x: auto;
  overflow-y: clip;
  overscroll-behavior: contain;
  min-width: 0;
}

.column-section {
  flex: 0 0 330px;
  min-width: 280px;
  max-width: 500px;
  height: 100%;
}

/* Side menu (Misskey deck style) */
.side-menu {
  flex: 0 0 48px;
  display: flex;
  flex-direction: column;
  background: var(--nd-navBg);
  border-left: 1px solid var(--nd-divider);
}

.side-menu-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
}

.side-menu-middle {
  flex: 1;
}

.side-menu-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  color: var(--nd-fg);
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
  text-decoration: none;
}

.menu-item:hover {
  opacity: 1;
  background: var(--nd-buttonHoverBg);
}

/* Account avatars in side menu */
.side-menu-accounts {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
  border-top: 1px solid var(--nd-divider);
}

.menu-account-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 6px 0;
  transition: background 0.15s;
}

.menu-account-btn:hover {
  background: var(--nd-buttonHoverBg);
}

.menu-account-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
}

.menu-avatar-placeholder {
  background: var(--nd-buttonBg);
}

/* Add column popup */
.add-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-modalBg);
}

.add-popup {
  background: var(--nd-popup);
  border-radius: 16px;
  box-shadow: 0 8px 32px var(--nd-shadow);
  min-width: 320px;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
}

.add-popup-header {
  padding: 20px 24px 16px;
  font-size: 1em;
  font-weight: bold;
  border-bottom: 1px solid var(--nd-divider);
}

.add-popup-empty {
  padding: 2rem;
  text-align: center;
  color: var(--nd-fg);
  opacity: 0.6;
  font-size: 0.9em;
}

.add-popup-empty a {
  color: var(--nd-accent);
}

.add-account-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 24px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  transition: background 0.15s;
}

.add-account-btn:hover {
  background: var(--nd-buttonHoverBg);
}

.add-account-btn + .add-account-btn {
  border-top: 1px solid var(--nd-divider);
}

.add-account-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.add-popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  opacity: 0.7;
  transition: background 0.15s, opacity 0.15s;
}

.add-back-btn:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 1;
}

.add-type-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 24px;
  font-size: 0.9em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  transition: background 0.15s;
}

.add-type-btn:hover {
  background: var(--nd-buttonHoverBg);
}

.add-type-btn + .add-type-btn {
  border-top: 1px solid var(--nd-divider);
}

.add-type-btn svg {
  opacity: 0.7;
}
</style>
