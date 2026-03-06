import { invoke } from '@tauri-apps/api/core'
import { computed, nextTick, type Ref, ref } from 'vue'
import { createAdapter } from '@/adapters/registry'
import type {
  NormalizedDriveFile,
  NormalizedNote,
  NoteVisibility,
  ServerAdapter,
} from '@/adapters/types'
import { applyNotePostInterruptors } from '@/aiscript/plugin-api'
import {
  type Draft,
  deleteDraft,
  loadDrafts,
  saveDraft,
} from '@/composables/useDrafts'
import { useAccountsStore } from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'
import { useThemeStore } from '@/stores/theme'
import {
  CUSTOM_TL_ICONS,
  detectAvailableTimelines,
} from '@/utils/customTimelines'
import { AppError } from '@/utils/errors'

const MAX_TEXT_LENGTH = 3000

interface VisibilityOption {
  value: NoteVisibility
  label: string
  icon: string
}

const visibilityOptions: VisibilityOption[] = [
  {
    value: 'public',
    label: 'パブリック',
    icon: 'M22 12A10 10 0 112 12a10 10 0 0120 0zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z',
  },
  {
    value: 'home',
    label: 'ホーム',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-2 0h2',
  },
  {
    value: 'followers',
    label: 'フォロワー',
    icon: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
  },
  {
    value: 'specified',
    label: 'ダイレクト',
    icon: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0l-8.25 5.25a1.5 1.5 0 01-1.5 0L2.25 6.75',
  },
]

const defaultVisibility = visibilityOptions[0] as VisibilityOption

const DEFAULT_MODE_ICON = 'M12 2a10 10 0 100 20 10 10 0 000-20z'

export function usePostFormState(
  props: {
    accountId: string
    replyTo?: NormalizedNote
    renoteId?: string
    editNote?: NormalizedNote
    channelId?: string
  },
  callbacks: {
    onPosted: (editedNoteId?: string) => void
  },
  fileInput: Ref<HTMLInputElement | null>,
) {
  const accountsStore = useAccountsStore()
  const serversStore = useServersStore()
  const themeStore = useThemeStore()

  const text = ref('')
  const cw = ref('')
  const showCw = ref(false)
  const visibility = ref<NoteVisibility>('public')
  const localOnly = ref(!!props.channelId)
  const showVisibilityMenu = ref(false)
  const showAccountMenu = ref(false)
  const isPosting = ref(false)
  const posted = ref(false)
  const error = ref<string | null>(null)
  const attachedFiles = ref<NormalizedDriveFile[]>([])
  const isUploading = ref(false)
  const noteModeFlags = ref<Record<string, boolean>>({})
  const disabledVisibilities = ref(new Set<string>())
  const showPoll = ref(false)
  const pollChoices = ref<string[]>(['', ''])
  const pollMultiple = ref(false)
  const pollExpiresAt = ref<number | null>(null)
  const scheduledAt = ref<string | null>(null)
  const supportsScheduledNotes = ref(false)
  const drafts = ref<Draft[]>([])
  const showDraftMenu = ref(false)

  let adapter: ServerAdapter | null = null

  const activeAccountId = ref(props.accountId)
  const accounts = computed(() => accountsStore.accounts)
  const account = computed(() =>
    accountsStore.accounts.find((a) => a.id === activeAccountId.value),
  )

  const formThemeVars = computed(() =>
    themeStore.getStyleVarsForAccount(activeAccountId.value),
  )

  const currentVisibility = computed(
    (): VisibilityOption =>
      visibilityOptions.find((o) => o.value === visibility.value) ??
      defaultVisibility,
  )

  const remainingChars = computed(() => MAX_TEXT_LENGTH - text.value.length)

  const canPost = computed(() => {
    if (isPosting.value || isUploading.value) return false
    if (remainingChars.value < 0) return false
    if (props.renoteId) return true
    if (attachedFiles.value.length > 0) return true
    if (showPoll.value && pollChoices.value.filter((c) => c.trim()).length >= 2)
      return true
    return text.value.trim().length > 0
  })

  async function initAdapter() {
    const acc = account.value
    if (!acc) return
    adapter = null
    try {
      const serverInfo = await serversStore.getServerInfo(acc.host)
      adapter = createAdapter(serverInfo, acc.id)
      supportsScheduledNotes.value = serverInfo.features.scheduledNotes === true
    } catch (e) {
      error.value = AppError.from(e).message
      supportsScheduledNotes.value = false
    }
    // Load drafts for this account
    drafts.value = loadDrafts(acc.id)
    // Detect active modes for note-level flags
    try {
      const availability = await detectAvailableTimelines(acc.id)
      const flags: Record<string, boolean> = {}
      for (const [key, value] of Object.entries(availability.modes)) {
        if (value) {
          flags[key.replace(/^isIn/, 'isNoteIn')] = true
        }
      }
      noteModeFlags.value = flags
    } catch {
      noteModeFlags.value = {}
    }

    // Detect visibility restrictions from role policies
    const disabled = new Set<string>()
    try {
      const policies = await invoke<Record<string, boolean>>(
        'api_get_user_policies',
        { accountId: acc.id },
      )
      // Standard: canPublicNote
      if (policies.canPublicNote === false) disabled.add('public')
      // Fork extensions: can*Note pattern (e.g., canHomeNote, canPublicNonLtlNote)
      for (const [key, value] of Object.entries(policies)) {
        if (value !== false) continue
        const match = key.match(/^can(.+)Note$/)
        if (!match || key === 'canPublicNote') continue
        const name =
          (match[1]?.charAt(0).toLowerCase() ?? '') + (match[1]?.slice(1) ?? '')
        disabled.add(name)
      }
      // Filter mode flags by can*Note policies (e.g., canYamiNote=false → remove isNoteInYamiMode)
      const filtered: Record<string, boolean> = {}
      for (const [flagKey, flagValue] of Object.entries(noteModeFlags.value)) {
        const m = flagKey.match(/^isNoteIn(.+)Mode$/)
        if (m) {
          const policyKey = `can${m[1]}Note`
          if (policies[policyKey] === false) continue
        }
        filtered[flagKey] = flagValue
      }
      noteModeFlags.value = filtered
    } catch {
      // Policies unavailable — allow all
    }
    // Reply to specified → restrict to followers/specified
    if (props.replyTo?.visibility === 'specified') {
      disabled.add('public')
      disabled.add('home')
    }
    disabledVisibilities.value = disabled

    // Auto-correct if current visibility is disabled
    if (disabled.has(visibility.value)) {
      const first = visibilityOptions.find((o) => !disabled.has(o.value))
      if (first) visibility.value = first.value
    }
  }

  async function switchAccount(id: string) {
    activeAccountId.value = id
    showAccountMenu.value = false
    error.value = null
    await initAdapter()
  }

  async function post() {
    if (!adapter || !canPost.value) return

    isPosting.value = true
    error.value = null

    try {
      if (props.editNote) {
        await adapter.api.updateNote(props.editNote.id, {
          text: text.value || undefined,
          cw: showCw.value && cw.value ? cw.value : undefined,
        })
      } else {
        const fileIds =
          attachedFiles.value.length > 0
            ? attachedFiles.value.map((f) => f.id)
            : undefined
        const modeFlags =
          Object.keys(noteModeFlags.value).length > 0
            ? noteModeFlags.value
            : undefined
        const pollParam =
          showPoll.value &&
          pollChoices.value.filter((c) => c.trim()).length >= 2
            ? {
                choices: pollChoices.value.filter((c) => c.trim()),
                multiple: pollMultiple.value || undefined,
                expiresAt: pollExpiresAt.value ?? undefined,
              }
            : undefined
        const noteParams = applyNotePostInterruptors({
          text: text.value || undefined,
          cw: showCw.value && cw.value ? cw.value : undefined,
          visibility: visibility.value,
          localOnly:
            visibility.value === 'specified'
              ? false
              : localOnly.value || undefined,
          modeFlags,
          replyId: props.replyTo?.id,
          renoteId: props.renoteId,
          channelId: props.channelId,
          fileIds,
          poll: pollParam,
          scheduledAt: scheduledAt.value ?? undefined,
        })
        await adapter.api.createNote(noteParams)
      }
      posted.value = true
      callbacks.onPosted(props.editNote?.id)
    } catch (e) {
      error.value = AppError.from(e).message
    } finally {
      isPosting.value = false
    }
  }

  function openFilePicker() {
    fileInput.value?.click()
  }

  async function onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement
    const files = input.files
    if (!files || !adapter) return

    isUploading.value = true
    error.value = null

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const buffer = await file.arrayBuffer()
        const data = Array.from(new Uint8Array(buffer))
        // biome-ignore lint/style/noNonNullAssertion: adapter is initialized before upload
        return adapter!.api.uploadFile(
          file.name,
          data,
          file.type || 'application/octet-stream',
        )
      })
      const uploaded = await Promise.all(uploadPromises)
      attachedFiles.value = [...attachedFiles.value, ...uploaded]
    } catch (e) {
      error.value = AppError.from(e).message
    } finally {
      isUploading.value = false
      input.value = ''
    }
  }

  function removeFile(fileId: string) {
    attachedFiles.value = attachedFiles.value.filter((f) => f.id !== fileId)
  }

  function selectVisibility(v: NoteVisibility) {
    visibility.value = v
    showVisibilityMenu.value = false
  }

  function noteModeLabel(noteKey: string): string {
    const match = noteKey.match(/^isNoteIn(.+)Mode$/)
    return match?.[1] ?? noteKey
  }

  function noteModeIcon(noteKey: string): string {
    const label = noteModeLabel(noteKey).toLowerCase()
    return CUSTOM_TL_ICONS[label] ?? DEFAULT_MODE_ICON
  }

  function insertAtCursor(
    textarea: HTMLTextAreaElement | null,
    insert: string,
  ) {
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    text.value = text.value.slice(0, start) + insert + text.value.slice(end)
    nextTick(() => {
      const pos = start + insert.length
      textarea.setSelectionRange(pos, pos)
      textarea.focus()
    })
  }

  function addPollChoice() {
    if (pollChoices.value.length < 10) {
      pollChoices.value.push('')
    }
  }

  function removePollChoice(index: number) {
    if (pollChoices.value.length > 2) {
      pollChoices.value.splice(index, 1)
    }
  }

  function resetForm() {
    text.value = ''
    cw.value = ''
    showCw.value = false
    attachedFiles.value = []
    showPoll.value = false
    pollChoices.value = ['', '']
    pollMultiple.value = false
    pollExpiresAt.value = null
    scheduledAt.value = null
    error.value = null
    posted.value = false
  }

  function saveCurrentDraft() {
    const acc = account.value
    if (!acc) return
    const draft = saveDraft(acc.id, {
      text: text.value,
      cw: cw.value,
      showCw: showCw.value,
      visibility: visibility.value,
      localOnly: localOnly.value,
      fileIds: attachedFiles.value.map((f) => f.id),
      pollChoices: pollChoices.value,
      pollMultiple: pollMultiple.value,
      showPoll: showPoll.value,
      scheduledAt: scheduledAt.value,
    })
    drafts.value = [
      draft,
      ...drafts.value.filter((d) => d.id !== draft.id),
    ].slice(0, 10)
    showDraftMenu.value = false
  }

  function restoreDraft(draft: Draft) {
    text.value = draft.text
    cw.value = draft.cw
    showCw.value = draft.showCw
    visibility.value = draft.visibility
    localOnly.value = draft.localOnly
    pollChoices.value =
      draft.pollChoices.length >= 2 ? draft.pollChoices : ['', '']
    pollMultiple.value = draft.pollMultiple
    showPoll.value = draft.showPoll
    scheduledAt.value = draft.scheduledAt
    // Note: file attachments are not restored (IDs may be expired)
    showDraftMenu.value = false
  }

  function removeDraft(draftId: string) {
    const acc = account.value
    if (!acc) return
    deleteDraft(acc.id, draftId)
    drafts.value = drafts.value.filter((d) => d.id !== draftId)
  }

  return {
    // Refs
    text,
    cw,
    showCw,
    visibility,
    localOnly,
    showVisibilityMenu,
    showAccountMenu,
    isPosting,
    posted,
    error,
    attachedFiles,
    isUploading,
    noteModeFlags,
    disabledVisibilities,
    activeAccountId,
    showPoll,
    pollChoices,
    pollMultiple,
    pollExpiresAt,
    scheduledAt,
    supportsScheduledNotes,
    drafts,
    showDraftMenu,
    // Computed
    accounts,
    account,
    formThemeVars,
    currentVisibility,
    remainingChars,
    canPost,
    // Constants
    MAX_TEXT_LENGTH,
    visibilityOptions,
    // Functions
    initAdapter,
    switchAccount,
    post,
    openFilePicker,
    onFileSelected,
    removeFile,
    selectVisibility,
    noteModeLabel,
    noteModeIcon,
    insertAtCursor,
    addPollChoice,
    removePollChoice,
    resetForm,
    saveCurrentDraft,
    restoreDraft,
    removeDraft,
  }
}
