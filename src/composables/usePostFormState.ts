import { computed, nextTick, type Ref, ref, shallowRef } from 'vue'
import { initAdapterFor } from '@/adapters/initAdapter'
import type {
  NormalizedNote,
  NoteVisibility,
  ServerAdapter,
} from '@/adapters/types'
import { applyNotePostInterruptors } from '@/aiscript/plugin-api'
import {
  DEFAULT_MODE_ICON,
  defaultVisibility,
  MAX_TEXT_LENGTH,
  type VisibilityOption,
  visibilityOptions,
} from '@/composables/postFormConstants'
import {
  type Draft,
  deleteDraft,
  loadDrafts,
  saveDraft,
} from '@/composables/useDrafts'
import { useFileAttachment } from '@/composables/useFileAttachment'
import { useAccountsStore } from '@/stores/accounts'
import { useThemeStore } from '@/stores/theme'
import { useToast } from '@/stores/toast'
import {
  CUSTOM_TL_ICONS,
  detectAvailableTimelines,
} from '@/utils/customTimelines'
import { AppError } from '@/utils/errors'
import { invoke } from '@/utils/tauriInvoke'

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
  let adapter: ServerAdapter | null = null
  const {
    attachedFiles,
    isUploading,
    openFilePicker,
    onFileSelected,
    uploadFilesFromPaths,
    attachDriveFiles,
    removeFile,
  } = useFileAttachment(() => adapter, fileInput, error)
  const noteModeFlags = ref<Record<string, boolean>>({})
  const disabledVisibilities = shallowRef(new Set<string>())
  const showPoll = ref(false)
  const pollChoices = ref<string[]>(['', ''])
  const pollMultiple = ref(false)
  const pollExpiresAt = ref<number | null>(null)
  const scheduledAt = ref<string | null>(null)
  const supportsScheduledNotes = ref(false)
  const drafts = ref<Draft[]>([])
  const showDraftMenu = ref(false)

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
      const result = await initAdapterFor(acc.host, acc.id)
      adapter = result.adapter
      supportsScheduledNotes.value =
        result.serverInfo.features.scheduledNotes === true
    } catch (e) {
      error.value = AppError.from(e).message
      supportsScheduledNotes.value = false
    }
    // Load drafts for this account
    drafts.value = loadDrafts(acc.id)

    // Fetch modes, policies, and user settings in parallel (all independent after adapter init)
    const [availabilityResult, policiesResult, userInfoResult] =
      await Promise.allSettled([
        detectAvailableTimelines(acc.id),
        invoke<Record<string, boolean>>('api_get_user_policies', {
          accountId: acc.id,
        }),
        invoke<{
          defaultNoteVisibility?: string
          defaultNoteLocalOnly?: boolean
        }>('api_get_self', { accountId: acc.id }),
      ])

    // Apply mode flags
    if (availabilityResult.status === 'fulfilled') {
      const flags: Record<string, boolean> = {}
      for (const [key, value] of Object.entries(
        availabilityResult.value.modes,
      )) {
        if (value) {
          flags[key.replace(/^isIn/, 'isNoteIn')] = true
        }
      }
      noteModeFlags.value = flags
    } else {
      noteModeFlags.value = {}
    }

    // Apply visibility restrictions from role policies
    const disabled = new Set<string>()
    if (policiesResult.status === 'fulfilled') {
      const policies = policiesResult.value
      if (policies.canPublicNote === false) disabled.add('public')
      for (const [key, value] of Object.entries(policies)) {
        if (value !== false) continue
        const match = key.match(/^can(.+)Note$/)
        if (!match || key === 'canPublicNote') continue
        const name =
          (match[1]?.charAt(0).toLowerCase() ?? '') + (match[1]?.slice(1) ?? '')
        disabled.add(name)
      }
      // Filter mode flags by can*Note policies
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
    }
    if (props.replyTo?.visibility === 'specified') {
      disabled.add('public')
      disabled.add('home')
    }
    disabledVisibilities.value = disabled

    // Apply default note settings
    if (userInfoResult.status === 'fulfilled') {
      const userInfo = userInfoResult.value
      const v = userInfo.defaultNoteVisibility
      if (v && visibilityOptions.some((o) => o.value === v)) {
        visibility.value = v as NoteVisibility
      }
      if (!props.channelId) {
        localOnly.value = userInfo.defaultNoteLocalOnly === true
      }
    }

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

    // Edit mode: wait for API response (cannot be optimistic)
    if (props.editNote) {
      try {
        await adapter.api.updateNote(props.editNote.id, {
          text: text.value || undefined,
          cw: showCw.value && cw.value ? cw.value : undefined,
        })
        posted.value = true
        callbacks.onPosted(props.editNote.id)
      } catch (e) {
        error.value = AppError.from(e).message
      } finally {
        isPosting.value = false
      }
      return
    }

    // New note: optimistic UI — close form immediately, post in background
    const fileIds =
      attachedFiles.value.length > 0
        ? attachedFiles.value.map((f) => f.id)
        : undefined
    const modeFlags =
      Object.keys(noteModeFlags.value).length > 0
        ? noteModeFlags.value
        : undefined
    const pollParam =
      showPoll.value && pollChoices.value.filter((c) => c.trim()).length >= 2
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
        visibility.value === 'specified' ? false : localOnly.value || undefined,
      modeFlags,
      replyId: props.replyTo?.id,
      renoteId: props.renoteId,
      channelId: props.channelId,
      fileIds,
      poll: pollParam,
      scheduledAt: scheduledAt.value ?? undefined,
    })

    // Close form optimistically before awaiting API
    posted.value = true
    isPosting.value = false
    callbacks.onPosted()

    // Fire API call in background — on failure, save draft and notify
    const currentAdapter = adapter
    const currentAccountId = activeAccountId.value
    currentAdapter.api.createNote(noteParams).catch((e) => {
      const { show } = useToast()
      show(AppError.from(e).message, 'error')
      // Auto-save as draft so user can retry
      saveDraft(currentAccountId, {
        text: noteParams.text ?? '',
        cw: noteParams.cw ?? '',
        showCw: !!noteParams.cw,
        visibility: noteParams.visibility ?? 'public',
        localOnly: noteParams.localOnly ?? false,
        fileIds: noteParams.fileIds ?? [],
        pollChoices: noteParams.poll?.choices ?? [],
        pollMultiple: noteParams.poll?.multiple ?? false,
        showPoll: !!noteParams.poll,
        scheduledAt: noteParams.scheduledAt ?? null,
      })
    })
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
    uploadFilesFromPaths,
    attachDriveFiles,
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
