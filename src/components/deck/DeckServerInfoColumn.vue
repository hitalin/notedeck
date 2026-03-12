<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import DOMPurify from 'dompurify'
import { computed, onMounted, ref } from 'vue'
import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import { AppError } from '@/utils/errors'
import DeckColumn from './DeckColumn.vue'

interface ServerMeta {
  uri: string
  name: string | null
  description: string | null
  version: string
  maintainerName: string | null
  maintainerEmail: string | null
  inquiryUrl: string | null
  iconUrl: string | null
  bannerUrl: string | null
  tosUrl: string | null
  repositoryUrl: string | null
  impressumUrl: string | null
  privacyPolicyUrl: string | null
  feedbackUrl: string | null
  langs: string[]
  serverRules: string[]
}

interface ServerStats {
  notesCount: number
  originalNotesCount: number
  usersCount: number
  originalUsersCount: number
  instances: number
  reactionsCount?: number
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
const stats = ref<ServerStats | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)

function scrollToTop() {
  scrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function formatNumber(n: number | undefined): string {
  if (n == null) return '-'
  return n.toLocaleString()
}

const sanitizedDescription = computed(() => {
  if (!meta.value?.description) return null
  return DOMPurify.sanitize(meta.value.description, {
    ALLOWED_TAGS: [
      'b',
      'i',
      'em',
      'strong',
      'a',
      'br',
      'p',
      'ul',
      'ol',
      'li',
      'blockquote',
      'code',
      'pre',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'hr',
      'img',
      'span',
      'div',
      'small',
      'center',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'style'],
  })
})

async function fetchServerInfo() {
  const acc = account.value
  if (!acc) return

  isLoading.value = true
  error.value = null

  try {
    const info = await serversStore.getServerInfo(acc.host)
    serverIconUrl.value = info.iconUrl

    const [metaResult, statsResult] = await Promise.all([
      invoke<ServerMeta>('api_request', {
        accountId: acc.id,
        endpoint: 'meta',
        params: { detail: true },
      }),
      invoke<ServerStats>('api_request', {
        accountId: acc.id,
        endpoint: 'stats',
        params: {},
      }),
    ])

    meta.value = metaResult
    stats.value = statsResult
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchServerInfo()
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name ?? 'サーバー情報'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop"
  >
    <template #header-icon>
      <i class="ti ti-server tl-header-icon" />
    </template>

    <template #header-meta>
      <button class="_button header-refresh" title="更新" :disabled="isLoading" @click.stop="fetchServerInfo">
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

    <div v-else-if="isLoading && !meta" class="server-info-body">
      <MkSkeleton v-for="i in 5" :key="i" />
    </div>

    <div v-else-if="meta" ref="scrollContainer" class="server-info-body">
      <!-- Banner (Misskey style: bg image + icon overlay + gradient name) -->
      <div
        class="banner"
        :style="meta.bannerUrl ? { backgroundImage: `url(${meta.bannerUrl})` } : undefined"
      >
        <div class="banner-inner">
          <img
            :src="meta.iconUrl || serverIconUrl || `https://${account.host}/favicon.ico`"
            alt=""
            class="banner-icon"
          />
          <div class="banner-name">
            <b>{{ meta.name || account.host }}</b>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div class="form-section">
        <div class="form-kv-row">
          <div class="form-kv-key">概要</div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-if="sanitizedDescription" class="description" v-html="sanitizedDescription" />
          <div v-else class="muted">（説明なし）</div>
        </div>
      </div>

      <!-- Server info -->
      <div class="form-section">
        <div class="section-content">
          <div class="form-kv-row">
            <div class="form-kv-key">Misskey</div>
            <div class="form-kv-value">{{ meta.version }}</div>
          </div>
          <a
            v-if="meta.repositoryUrl"
            :href="meta.repositoryUrl"
            target="_blank"
            rel="noopener"
            class="form-link"
          >
            <i class="ti ti-code form-link-icon" />
            <span>ソースコード</span>
            <span class="form-link-suffix">
              <i class="ti ti-external-link" />
            </span>
          </a>
        </div>
      </div>

      <!-- Administrator -->
      <div class="form-section">
        <div class="section-content">
          <div class="form-split">
            <div class="form-kv-row">
              <div class="form-kv-key">管理者</div>
              <div class="form-kv-value">
                <template v-if="meta.maintainerName">{{ meta.maintainerName }}</template>
                <span v-else class="muted">（なし）</span>
              </div>
            </div>
            <div class="form-kv-row">
              <div class="form-kv-key">連絡先</div>
              <div class="form-kv-value">
                <template v-if="meta.maintainerEmail">{{ meta.maintainerEmail }}</template>
                <span v-else class="muted">（なし）</span>
              </div>
            </div>
            <div class="form-kv-row">
              <div class="form-kv-key">問い合わせ</div>
              <div class="form-kv-value">
                <a v-if="meta.inquiryUrl" :href="meta.inquiryUrl" target="_blank" rel="noopener" class="kv-link">{{ meta.inquiryUrl }}</a>
                <span v-else class="muted">（なし）</span>
              </div>
            </div>
          </div>
          <a
            v-if="meta.impressumUrl"
            :href="meta.impressumUrl"
            target="_blank"
            rel="noopener"
            class="form-link"
          >
            <i class="ti ti-user-shield form-link-icon" />
            <span>運営情報</span>
            <span class="form-link-suffix"><i class="ti ti-external-link" /></span>
          </a>

          <!-- Server Rules -->
          <div v-if="meta.serverRules && meta.serverRules.length > 0" class="rules-container">
            <div class="form-link rules-toggle" @click="($event.currentTarget as HTMLElement).parentElement?.classList.toggle('open')">
              <i class="ti ti-checkup-list form-link-icon" />
              <span>サーバールール</span>
              <span class="form-link-suffix"><i class="ti ti-chevron-down rules-chevron" /></span>
            </div>
            <ol class="rules-list">
              <li v-for="(rule, i) in meta.serverRules" :key="i" class="rule-item">
                <span class="rule-number">{{ i + 1 }}</span>
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div class="rule-text" v-html="DOMPurify.sanitize(rule)" />
              </li>
            </ol>
          </div>

          <a
            v-if="meta.tosUrl"
            :href="meta.tosUrl"
            target="_blank"
            rel="noopener"
            class="form-link"
          >
            <i class="ti ti-license form-link-icon" />
            <span>利用規約</span>
            <span class="form-link-suffix"><i class="ti ti-external-link" /></span>
          </a>
          <a
            v-if="meta.privacyPolicyUrl"
            :href="meta.privacyPolicyUrl"
            target="_blank"
            rel="noopener"
            class="form-link"
          >
            <i class="ti ti-shield-lock form-link-icon" />
            <span>プライバシーポリシー</span>
            <span class="form-link-suffix"><i class="ti ti-external-link" /></span>
          </a>
          <a
            v-if="meta.feedbackUrl"
            :href="meta.feedbackUrl"
            target="_blank"
            rel="noopener"
            class="form-link"
          >
            <i class="ti ti-message form-link-icon" />
            <span>フィードバック</span>
            <span class="form-link-suffix"><i class="ti ti-external-link" /></span>
          </a>
        </div>
      </div>

      <!-- Statistics -->
      <div v-if="stats" class="form-section">
        <div class="form-section-label">統計</div>
        <div class="section-content">
          <div class="stats-split">
            <div class="form-kv-row">
              <div class="form-kv-key">ユーザー</div>
              <div class="form-kv-value">{{ formatNumber(stats.originalUsersCount) }}</div>
            </div>
            <div class="form-kv-row">
              <div class="form-kv-key">ノート</div>
              <div class="form-kv-value">{{ formatNumber(stats.originalNotesCount) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Well-known resources -->
      <div class="form-section">
        <div class="form-section-label">Well-known resources</div>
        <div class="section-content">
          <a :href="`https://${account.host}/.well-known/host-meta`" target="_blank" rel="noopener" class="form-link">
            <span>host-meta</span>
            <span class="form-link-suffix"><i class="ti ti-external-link" /></span>
          </a>
          <a :href="`https://${account.host}/.well-known/host-meta.json`" target="_blank" rel="noopener" class="form-link">
            <span>host-meta.json</span>
            <span class="form-link-suffix"><i class="ti ti-external-link" /></span>
          </a>
          <a :href="`https://${account.host}/.well-known/nodeinfo`" target="_blank" rel="noopener" class="form-link">
            <span>nodeinfo</span>
            <span class="form-link-suffix"><i class="ti ti-external-link" /></span>
          </a>
          <a :href="`https://${account.host}/robots.txt`" target="_blank" rel="noopener" class="form-link">
            <span>robots.txt</span>
            <span class="form-link-suffix"><i class="ti ti-external-link" /></span>
          </a>
          <a :href="`https://${account.host}/manifest.json`" target="_blank" rel="noopener" class="form-link">
            <span>manifest.json</span>
            <span class="form-link-suffix"><i class="ti ti-external-link" /></span>
          </a>
        </div>
      </div>
    </div>

    <div v-else class="column-empty">
      サーバー情報を取得できませんでした
    </div>
  </DeckColumn>
</template>

<style scoped>
@import "./column-common.css";

.server-info-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

/* ---- Banner (Misskey style) ---- */
.banner {
  text-align: center;
  border-radius: 10px;
  overflow: clip;
  background-color: var(--nd-panelBg, var(--nd-bg));
  background-size: cover;
  background-position: center center;
  margin: 12px;
}

.banner-inner {
  overflow: clip;
}

.banner-icon {
  display: block;
  margin: 16px auto 0 auto;
  height: 48px;
  border-radius: 8px;
}

.banner-name {
  display: block;
  padding: 12px 16px;
  color: #fff;
  text-shadow: 0 0 8px #000;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  font-size: 1.05em;
}

/* ---- Form sections (Misskey FormSection style) ---- */
.form-section {
  border-top: solid 0.5px var(--nd-divider);
}

.form-section:first-child {
  border-top: none;
}

.form-section-label {
  font-weight: bold;
  padding: 1.5em 16px 0;
  margin-bottom: 8px;
  font-size: 0.85em;
}

.section-content {
  margin-top: 1em;
  padding-bottom: 4px;
}

/* ---- Key-Value rows (Misskey MkKeyValue style) ---- */
.form-kv-row {
  padding: 12px 16px;
}

.form-kv-row + .form-kv-row {
  border-top: 1px solid var(--nd-divider);
}

.form-kv-key {
  font-size: 0.85em;
  opacity: 0.75;
  padding-bottom: 0.25em;
}

.form-kv-value {
  color: var(--nd-fgHighlighted);
  word-break: break-word;
}

.muted {
  opacity: 0.7;
}

.kv-link {
  color: var(--nd-accent);
  text-decoration: none;
  word-break: break-all;
}

.kv-link:hover {
  text-decoration: underline;
}

/* ---- FormSplit (Misskey style side by side grid) ---- */
.form-split {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding: 0 16px 12px;
}

.stats-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 0 16px 12px;
}

.stats-split > .form-kv-row {
  padding: 0;
}

.stats-split > .form-kv-row + .form-kv-row {
  border-top: none;
}

.form-split > .form-kv-row {
  padding: 0;
}

.form-split > .form-kv-row + .form-kv-row {
  border-top: none;
}

/* ---- FormLink (Misskey style) ---- */
.form-link {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  margin: 0 16px 8px;
  width: calc(100% - 32px);
  background: var(--nd-buttonBg);
  border-radius: 6px;
  font-size: 0.9em;
  color: var(--nd-fg);
  text-decoration: none;
  transition: background 0.15s;
  cursor: pointer;
}

.form-link:hover {
  background: var(--nd-buttonHoverBg);
  text-decoration: none;
}

.form-link-icon {
  margin-right: 0.75em;
  flex-shrink: 0;
  opacity: 0.75;
}

.form-link-suffix {
  margin-left: auto;
  opacity: 0.7;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ---- Description ---- */
.description {
  font-size: 0.9em;
  line-height: 1.7;
  color: var(--nd-fg);
  word-break: break-word;
}

.description :deep(a) {
  color: var(--nd-accent);
  text-decoration: none;
}

.description :deep(a:hover) {
  text-decoration: underline;
}

.description :deep(img) {
  max-width: 100%;
  border-radius: 8px;
}

.description :deep(h1),
.description :deep(h2),
.description :deep(h3) {
  color: var(--nd-fgHighlighted);
  margin: 0.8em 0 0.4em;
  font-size: 1.1em;
}

.description :deep(p) {
  margin: 0.5em 0;
}

.description :deep(ul),
.description :deep(ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.description :deep(blockquote) {
  border-left: 3px solid var(--nd-accent);
  padding-left: 12px;
  margin: 0.5em 0;
  opacity: 0.8;
}

/* ---- Server Rules (Misskey MkFolder style) ---- */
.rules-container {
  margin: 0 16px 8px;
}

.rules-container .rules-list {
  display: none;
}

.rules-container.open .rules-list {
  display: block;
}

.rules-container.open .rules-chevron {
  transform: rotate(180deg);
}

.rules-toggle {
  margin: 0;
  width: 100%;
  border-radius: 6px;
}

.rules-chevron {
  transition: transform 0.2s;
}

.rules-list {
  list-style: none;
  padding: 8px 0 4px;
  margin: 0;
}

.rule-item {
  display: flex;
  gap: 8px;
  padding: 6px 0;
  word-break: break-word;
}

.rule-number {
  flex-shrink: 0;
  display: flex;
  position: sticky;
  top: 8px;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: var(--nd-accentedBg);
  color: var(--nd-accent);
  font-size: 13px;
  font-weight: bold;
}

.rule-text {
  padding-top: 6px;
  font-size: 0.9em;
  line-height: 1.5;
  color: var(--nd-fg);
}
</style>
