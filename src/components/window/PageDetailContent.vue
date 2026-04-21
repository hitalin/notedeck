<script setup lang="ts">
import type { Interpreter } from '@syuilo/aiscript'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  computed,
  defineAsyncComponent,
  onMounted,
  ref,
  useTemplateRef,
} from 'vue'
import { applyPageViewInterruptors } from '@/aiscript/plugin-api'
import AiScriptDialog from '@/components/common/AiScriptDialog.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import AiScriptUiRenderer, {
  type PostFormRequest,
} from '@/components/deck/widgets/AiScriptUiRenderer.vue'
import { useAiScriptRunner } from '@/composables/useAiScriptRunner'
import { usePortal } from '@/composables/usePortal'
import { useWindowExternalLink } from '@/composables/useWindowExternalLink'
import { useAccountsStore } from '@/stores/accounts'
import { AppError } from '@/utils/errors'
import { commands, unwrap } from '@/utils/tauriInvoke'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

const props = defineProps<{
  accountId: string
  pageId: string
}>()

const accountsStore = useAccountsStore()
const account = computed(
  () => accountsStore.accounts.find((a) => a.id === props.accountId) ?? null,
)
const serverUrl = computed(() =>
  account.value ? `https://${account.value.host}` : '',
)

interface PageContent {
  id: string
  type: string
  text?: string
  // biome-ignore lint: AiScript page content varies
  [key: string]: any
}

interface PageDetail {
  id: string
  title: string
  summary: string | null
  name: string
  content: PageContent[]
  variables: unknown[]
  script: string
  userId: string
  user: {
    username: string
    host: string | null
    name: string | null
    avatarUrl: string | null
  }
  likedCount: number
  isLiked: boolean
  createdAt: string
  updatedAt: string
}

const page = ref<PageDetail | null>(null)
const fetchError = ref<string | null>(null)
const fetching = ref(false)

const dialogRef = ref<InstanceType<typeof AiScriptDialog> | null>(null)
const {
  interpreter,
  consoleOutput,
  uiComponents,
  runError,
  running,
  run: runScript,
  reset: resetRun,
} = useAiScriptRunner()

const postPortalRef = useTemplateRef<HTMLElement>('postPortalRef')
usePortal(postPortalRef)

const showPostForm = ref(false)
const postFormData = ref<PostFormRequest>({})

function handlePost(form: PostFormRequest) {
  postFormData.value = form
  showPostForm.value = true
}

function closePostForm() {
  showPostForm.value = false
  postFormData.value = {}
}

const pageCreatedDate = computed(() =>
  page.value ? new Date(page.value.createdAt).toLocaleDateString() : '',
)
const pageUpdatedDate = computed(() =>
  page.value ? new Date(page.value.updatedAt).toLocaleDateString() : '',
)

const isOwnPage = computed(
  () =>
    page.value && account.value && page.value.userId === account.value.userId,
)

const pageWebUrl = computed(() => {
  if (!page.value || !serverUrl.value) return undefined
  return `${serverUrl.value}/@${page.value.user.username}/pages/${page.value.name}`
})

const pageEditUrl = computed(() => {
  if (!isOwnPage.value || !page.value || !serverUrl.value) return undefined
  return `${serverUrl.value}/pages/edit/${page.value.id}`
})

useWindowExternalLink(() =>
  pageWebUrl.value ? { url: pageWebUrl.value } : null,
)

const contentTexts = computed(() => {
  if (!page.value?.content) return []
  return page.value.content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text as string)
})

async function loadPage() {
  resetRun()
  page.value = null
  fetchError.value = null
  fetching.value = true
  try {
    const detail = unwrap(
      await commands.apiGetPage(props.accountId, props.pageId),
    ) as unknown as PageDetail
    page.value = applyPageViewInterruptors(detail)
    if (detail.script) {
      await runScript(detail.script, {
        accountId: props.accountId,
        storagePrefix: `page-${detail.id}`,
        globals: {
          THIS_ID: detail.id,
          THIS_URL: `${serverUrl.value}/@${detail.user.username}/pages/${detail.name}`,
          USER_ID: account.value?.userId ?? '',
          USER_NAME: account.value?.displayName ?? '',
          USER_USERNAME: account.value?.username ?? '',
          LOCALE: navigator.language,
          SERVER_URL: serverUrl.value,
        },
        dialog: () => dialogRef.value,
      })
    }
  } catch (e) {
    fetchError.value = AppError.from(e).message
  } finally {
    fetching.value = false
  }
}

async function toggleLike() {
  if (!page.value) return
  try {
    if (page.value.isLiked) {
      unwrap(await commands.apiUnlikePage(props.accountId, page.value.id))
    } else {
      unwrap(await commands.apiLikePage(props.accountId, page.value.id))
    }
    page.value.isLiked = !page.value.isLiked
    page.value.likedCount += page.value.isLiked ? 1 : -1
  } catch {
    // ignore
  }
}

onMounted(loadPage)
</script>

<template>
  <div :class="$style.root">
    <AiScriptDialog ref="dialogRef" />
    <div v-if="fetching" :class="$style.loading"><LoadingSpinner /></div>
    <div v-else-if="fetchError" :class="$style.error">{{ fetchError }}</div>
    <template v-else-if="page">
      <div :class="$style.header">
        <div :class="$style.title">{{ page.title }}</div>
        <div v-if="page.summary" :class="$style.summary">{{ page.summary }}</div>
      </div>

      <div v-if="uiComponents.length" :class="$style.ui">
        <AiScriptUiRenderer
          :components="uiComponents"
          :interpreter="(interpreter as Interpreter | null)"
          :server-url="serverUrl"
          @post="handlePost"
        />
      </div>

      <div v-if="contentTexts.length" :class="$style.content">
        <MkMfm
          v-for="(text, i) in contentTexts"
          :key="i"
          :text="text"
          :server-host="account?.host"
          :account-id="accountId"
        />
      </div>

      <div v-if="consoleOutput.length" :class="$style.console">
        <div
          v-for="(line, i) in consoleOutput"
          :key="i"
          :class="[$style.consoleLine, { [$style.errorLine]: line.isError }]"
        >
          {{ line.text }}
        </div>
      </div>

      <div v-if="runError" :class="$style.runError">{{ runError }}</div>

      <div v-if="running && !uiComponents.length && !runError" :class="$style.empty">
        Running...
      </div>

      <div :class="$style.footer">
        <div :class="$style.author">
          <img :src="page.user.avatarUrl || '/avatar-default.svg'" :class="$style.authorAvatar" @error="(e: Event) => (e.target as HTMLImageElement).src = '/avatar-error.svg'" />
          By @{{ page.user.username }}
        </div>
        <div :class="$style.dates">
          <div v-if="page.createdAt !== page.updatedAt">
            <i class="ti ti-clock" /> Updated: {{ pageUpdatedDate }}
          </div>
          <div>
            <i class="ti ti-clock" /> Created: {{ pageCreatedDate }}
          </div>
        </div>
        <div :class="$style.actions">
          <button
            class="_button"
            :class="[$style.actionBtn, { [$style.liked]: page.isLiked }]"
            @click="toggleLike"
          >
            <i class="ti ti-heart" />
            {{ page.likedCount }}
          </button>
          <button
            v-if="pageEditUrl"
            class="_button"
            :class="$style.actionBtn"
            @click="pageEditUrl && openUrl(pageEditUrl)"
          >
            <i class="ti ti-pencil" />
            編集
          </button>
        </div>
      </div>
    </template>
  </div>

  <div v-if="showPostForm" ref="postPortalRef">
    <MkPostForm
      :account-id="accountId"
      :initial-text="postFormData.text"
      :initial-cw="postFormData.cw"
      :initial-visibility="postFormData.visibility"
      :initial-local-only="postFormData.localOnly"
      @close="closePostForm"
      @posted="closePostForm"
    />
  </div>
</template>

<style lang="scss" module>
.root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.loading,
.empty {
  padding: 24px;
  text-align: center;
  opacity: 0.7;
}

.error,
.runError {
  margin: 12px;
  padding: 8px 10px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-love-subtle);
  color: var(--nd-love);
  font-size: 0.85em;
  white-space: pre-wrap;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px 16px 12px;
}

.title {
  font-size: 1.2em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
}

.summary {
  font-size: 0.9em;
  opacity: 0.7;
  white-space: pre-wrap;
  line-height: 1.5;
}

.ui {
  padding: 16px 12px;
}

.content {
  padding: 8px 16px 16px;
  line-height: 1.7;
  word-break: break-word;
}

.console {
  padding: 8px 10px;
  margin: 0 12px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.8em;
  line-height: 1.6;
}

.consoleLine {
  white-space: pre-wrap;
  word-break: break-all;

  &.errorLine {
    color: var(--nd-love);
  }
}

.errorLine {
  /* used as modifier */
}

.footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--nd-divider);
}

.author {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  opacity: 0.7;
}

.authorAvatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.dates {
  font-size: 0.75em;
  opacity: 0.5;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.actions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}

.actionBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: var(--nd-radius-full);
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  font-size: 0.8em;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  &.liked {
    color: var(--nd-love);
  }
}

.liked {
  /* used as modifier */
}
</style>
