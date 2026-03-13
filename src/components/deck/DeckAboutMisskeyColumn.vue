<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import { AppError } from '@/utils/errors'
import { isSafeUrl } from '@/utils/url'
import DeckColumn from './DeckColumn.vue'

interface ServerMeta {
  version: string
  repositoryUrl: string | null
  providesTarball?: boolean
  name: string | null
}

const props = defineProps<{
  column: DeckColumnType
}>()

const accountsStore = useAccountsStore()
const serversStore = useServersStore()

const account = computed(() =>
  accountsStore.accounts.find((a) => a.id === props.column.accountId),
)

const { columnThemeVars } = useColumnTheme(() => props.column)

const serverIconUrl = ref<string | undefined>()
const isLoading = ref(false)
const error = ref<AppError | null>(null)
const meta = ref<ServerMeta | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)
const showPostForm = ref(false)

const isModifiedVersion = computed(() => {
  if (!meta.value?.repositoryUrl) return false
  return meta.value.repositoryUrl !== 'https://github.com/misskey-dev/misskey'
})

function scrollToTop() {
  scrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function iLoveMisskey() {
  showPostForm.value = true
}

function closePostForm() {
  showPostForm.value = false
}

// プロジェクトメンバー（本家準拠）
const members = [
  {
    username: 'syuilo',
    avatar: 'https://avatars.githubusercontent.com/u/4439005?v=4',
    github: 'https://github.com/syuilo',
  },
  {
    username: 'acid-chicken',
    avatar: 'https://avatars.githubusercontent.com/u/20679825?v=4',
    github: 'https://github.com/acid-chicken',
  },
  {
    username: 'kakkokari-gtyih',
    avatar: 'https://avatars.githubusercontent.com/u/67428053?v=4',
    github: 'https://github.com/kakkokari-gtyih',
  },
  {
    username: 'tai-cha',
    avatar: 'https://avatars.githubusercontent.com/u/40626578?v=4',
    github: 'https://github.com/tai-cha',
  },
  {
    username: 'samunohito',
    avatar: 'https://avatars.githubusercontent.com/u/46447427?v=4',
    github: 'https://github.com/samunohito',
  },
  {
    username: 'anatawa12',
    avatar: 'https://avatars.githubusercontent.com/u/22656849?v=4',
    github: 'https://github.com/anatawa12',
  },
]

// スポンサー（本家準拠）
const sponsors = [
  {
    name: 'Mask Network',
    url: 'https://mask.io/',
    logo: 'https://assets.misskey-hub.net/sponsors/masknetwork.png',
  },
  {
    name: 'XServer',
    url: 'https://www.xserver.ne.jp/',
    logo: 'https://assets.misskey-hub.net/sponsors/xserver.png',
  },
  {
    name: 'Skeb',
    url: 'https://skeb.jp/',
    logo: 'https://assets.misskey-hub.net/sponsors/skeb.svg',
  },
  {
    name: 'GMO Pepabo',
    url: 'https://pepabo.com/',
    logo: 'https://assets.misskey-hub.net/sponsors/gmo_pepabo.svg',
  },
  {
    name: 'Purple Dot Digital',
    url: 'https://purpledotdigital.com/',
    logo: 'https://assets.misskey-hub.net/sponsors/purple-dot-digital.jpg',
  },
  {
    name: '合同会社サッズ',
    url: 'https://sads-llc.co.jp/',
    logo: 'https://assets.misskey-hub.net/sponsors/sads-llc.png',
  },
]

function openLink(url: string) {
  if (isSafeUrl(url)) openUrl(url)
}

async function fetchMeta() {
  const acc = account.value
  if (!acc) return

  isLoading.value = true
  error.value = null

  try {
    const info = await serversStore.getServerInfo(acc.host)
    serverIconUrl.value = info.iconUrl

    meta.value = await invoke<ServerMeta>('api_request', {
      accountId: acc.id,
      endpoint: 'meta',
      params: { detail: true },
    })
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchMeta()
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name ?? 'Misskeyについて'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop"
  >
    <template #header-icon>
      <i class="ti ti-info-circle tl-header-icon" />
    </template>

    <template #header-meta>
      <button class="_button header-refresh" title="更新" :disabled="isLoading" @click.stop="fetchMeta">
        <i class="ti ti-refresh" :class="{ 'spin': isLoading }" />
      </button>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <img class="header-favicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="error" class="column-empty column-error">
      {{ error.message }}
    </div>

    <div v-else-if="isLoading && !meta" class="about-body">
      <MkSkeleton v-for="i in 5" :key="i" />
    </div>

    <div v-else-if="meta" ref="scrollContainer" class="about-body">
      <!-- Hero -->
      <div class="about-hero">
        <img
          src="/misskey-icon.png"
          alt="Misskey"
          class="about-icon"
        />
        <div class="about-title">Misskey</div>
        <div class="about-version">v{{ meta.version }}</div>
      </div>

      <!-- Description -->
      <div class="about-desc">
        Misskeyはオープンソースの分散型ソーシャルネットワーキングプラットフォームです。
        <button class="_button about-learn-more" @click="openLink('https://misskey-hub.net/docs/about-misskey/')">
          もっと詳しく
        </button>
      </div>

      <!-- I love Misskey -->
      <div class="about-love">
        <button class="_button love-button" @click="iLoveMisskey">
          I <span class="love-heart">❤️</span> #Misskey
        </button>
      </div>

      <!-- Links -->
      <div class="about-section">
        <div class="about-links">
          <button class="_button about-link" @click="openLink('https://github.com/misskey-dev/misskey')">
            <i class="ti ti-code about-link-icon" />
            <span>ソースコード (オリジナル)</span>
            <span class="about-link-suffix">GitHub</span>
          </button>
          <button class="_button about-link" @click="openLink('https://crowdin.com/project/misskey')">
            <i class="ti ti-language-hiragana about-link-icon" />
            <span>翻訳</span>
            <span class="about-link-suffix">Crowdin</span>
          </button>
          <button class="_button about-link" @click="openLink('https://www.patreon.com/syuilo')">
            <i class="ti ti-pig-money about-link-icon" />
            <span>寄付</span>
            <span class="about-link-suffix">Patreon</span>
          </button>
        </div>
      </div>

      <!-- Modified version notice -->
      <div v-if="isModifiedVersion" class="about-section">
        <div class="modified-notice">
          <i class="ti ti-info-circle" />
          <span>このサーバーはMisskeyの改変版 ({{ meta.name || account.host }}) を使用しています。</span>
        </div>
        <div class="about-links">
          <button v-if="meta.repositoryUrl" class="_button about-link" @click="openLink(meta.repositoryUrl!)">
            <i class="ti ti-code about-link-icon" />
            <span>ソースコード</span>
            <i class="ti ti-external-link about-link-suffix" />
          </button>
        </div>
      </div>

      <!-- Project members -->
      <div class="about-section">
        <div class="about-section-label">プロジェクトメンバー</div>
        <div class="members-grid">
          <button
            v-for="m in members"
            :key="m.username"
            class="_button member-card"
            @click="openLink(m.github)"
          >
            <img :src="m.avatar" :alt="m.username" class="member-avatar" loading="lazy" />
            <span class="member-name">@{{ m.username }}</span>
          </button>
        </div>
      </div>

      <!-- Sponsors -->
      <div class="about-section">
        <div class="about-section-label">Special thanks</div>
        <div class="sponsors-grid">
          <button
            v-for="s in sponsors"
            :key="s.name"
            class="_button sponsor-card"
            :title="s.name"
            @click="openLink(s.url)"
          >
            <img :src="s.logo" :alt="s.name" class="sponsor-logo" loading="lazy" />
          </button>
        </div>
      </div>
    </div>

    <div v-else class="column-empty">
      情報を取得できませんでした
    </div>
  </DeckColumn>

  <Teleport to="body">
    <MkPostForm
      v-if="showPostForm && column.accountId"
      :account-id="column.accountId"
      initial-text="I ❤ #Misskey"
      @close="closePostForm"
    />
  </Teleport>
</template>

<style scoped>
@import "./column-common.css";

.about-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

/* Hero */
.about-hero {
  text-align: center;
  padding: 24px 16px 16px;
}

.about-icon {
  display: block;
  width: 80px;
  height: 80px;
  margin: 0 auto;
  border-radius: 16px;
  object-fit: contain;
}

.about-title {
  margin-top: 12px;
  font-size: 1.2em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
}

.about-version {
  margin-top: 2px;
  font-size: 0.85em;
  opacity: 0.5;
}

/* Description */
.about-desc {
  text-align: center;
  padding: 0 16px 16px;
  font-size: 0.9em;
  line-height: 1.6;
  color: var(--nd-fg);
}

.about-learn-more {
  color: var(--nd-accent);
  font-size: inherit;
}

.about-learn-more:hover {
  text-decoration: underline;
}

/* I love Misskey */
.about-love {
  text-align: center;
  padding: 0 16px 16px;
}

.love-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 10px 24px;
  border-radius: var(--nd-radius-full);
  background: linear-gradient(90deg, var(--nd-buttonGradateA), var(--nd-buttonGradateB));
  color: var(--nd-fgOnAccent);
  font-weight: bold;
  font-size: 0.95em;
  transition: opacity var(--nd-duration-base);
}

.love-button:hover {
  opacity: 0.85;
}

.love-button > .love-heart {
  display: inline-block;
  font-size: 1.1em;
  animation: jelly 1s infinite;
}

@keyframes jelly {
  0%, 100% { transform: scale(1); }
  25% { transform: scale(1.2, 0.8); }
  50% { transform: scale(0.9, 1.1); }
  75% { transform: scale(1.05, 0.95); }
}

/* Sections */
.about-section {
  border-top: solid 0.5px var(--nd-divider);
}

.about-section-label {
  font-weight: bold;
  padding: 1.5em 16px 0;
  margin-bottom: 8px;
  font-size: 0.85em;
}

/* Links */
.about-links {
  padding: 8px 16px 12px;
}

.about-link {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 14px;
  margin-bottom: 6px;
  background: var(--nd-buttonBg);
  border-radius: var(--nd-radius-sm);
  font-size: 0.9em;
  color: var(--nd-fg);
  transition: background var(--nd-duration-base);
}

.about-link:hover {
  background: var(--nd-buttonHoverBg);
}

.about-link-icon {
  margin-right: 0.75em;
  flex-shrink: 0;
  opacity: 0.75;
}

.about-link-suffix {
  margin-left: auto;
  opacity: 0.5;
  flex-shrink: 0;
}

/* Modified version notice */
.modified-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 16px 8px;
  padding: 12px;
  border-radius: var(--nd-radius-md);
  background: var(--nd-infoWarnBg, var(--nd-accentedBg));
  font-size: 0.85em;
  color: var(--nd-infoWarnFg, #ffbd3e);
  line-height: 1.5;
}

.modified-notice > .ti {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--nd-warn, #e8a530);
}

/* Members */
.members-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  padding: 0 16px 12px;
}

.member-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: var(--nd-buttonBg);
  border-radius: var(--nd-radius-sm);
  transition: background var(--nd-duration-base);
}

.member-card:hover {
  background: var(--nd-buttonHoverBg);
}

.member-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
}

.member-name {
  font-size: 0.85em;
  color: var(--nd-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Sponsors */
.sponsors-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 16px;
  padding: 0 16px 16px;
  align-items: center;
}

.sponsor-card {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: var(--nd-radius-sm);
  transition: background var(--nd-duration-base);
}

.sponsor-card:hover {
  background: var(--nd-buttonHoverBg);
}

.sponsor-logo {
  width: 100%;
  max-height: 40px;
  object-fit: contain;
}
</style>
