import JSON5 from 'json5'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import type { DeckColumn, DeckProfile, DeckWindowLayout } from '@/stores/deck'
import * as settingsFs from '@/utils/settingsFs'
import {
  getStorageJson,
  getStorageString,
  STORAGE_KEYS,
  setStorageJson,
  setStorageString,
} from '@/utils/storage'

/** Deep-clone reactive state into a plain object safe for serialization.
 *  structuredClone strips Vue Proxy wrappers without the overhead of
 *  JSON serialization round-trips. */
function deepClone<T>(value: T): T {
  return structuredClone(value)
}

/** Strip internal-only fields before writing to file. */
function toFileFormat(profile: DeckProfile): Record<string, unknown> {
  const { id: _id, ...rest } = profile
  return rest
}

/** Parse a profile file and assign an ID based on filename. */
function fromFileFormat(
  filename: string,
  data: Record<string, unknown>,
): DeckProfile {
  return {
    id: filename,
    name: (data.name as string) || filename,
    columns: (data.columns as DeckColumn[]) || [],
    layout: (data.layout as string[][]) || [],
    createdAt: (data.createdAt as number) || Date.now(),
    windows: data.windows as DeckWindowLayout[] | undefined,
  }
}

export const useDeckProfileStore = defineStore('deckProfile', () => {
  const activeProfileId = ref<string | null>(null)
  /** Per-window profile ID (set via ?profile= query). Isolates this window from deck:sync. */
  const windowProfileId = ref<string | null>(null)
  /** Bumped on every persist to make profile-derived computeds reactive */
  const profileVersion = ref(0)
  /** Whether file-based storage has been initialized */
  const initialized = ref(false)

  /** Cached profile name, kept in sync imperatively to avoid localStorage dependency. */
  const currentProfileName = ref<string | null>(null)

  /** In-memory cache of profiles. Uses shallowRef to avoid deep reactivity
   *  overhead on large nested DeckColumn[]/DeckWindowLayout[] structures.
   *  In-place mutations are signalled via profileVersion bump. */
  const profilesData = shallowRef<DeckProfile[]>([])

  // --- Profile data access (reactive) ---

  /** The profile this window is currently viewing.
   *  Depends on profileVersion to detect in-place mutations (shallowRef). */
  const currentProfile = computed(() => {
    void profileVersion.value
    return (
      profilesData.value.find((p) => p.id === windowProfileId.value) ?? null
    )
  })

  /** Columns of the current profile (reactive, read-only from outside). */
  const columns = computed<DeckColumn[]>(() => {
    void profileVersion.value
    return currentProfile.value?.columns ?? []
  })

  /** Layout of the current profile (reactive, read-only from outside). */
  const layout = computed<string[][]>(() => {
    void profileVersion.value
    return currentProfile.value?.layout ?? []
  })

  // --- Profile mutation ---

  /** Mutate the current profile's data and schedule persistence. */
  function mutateProfile(fn: (profile: DeckProfile) => void) {
    const profile = currentProfile.value
    if (!profile) return
    fn(profile)
    // Trigger reactivity by bumping version (Vue tracks the ref)
    profileVersion.value++
    schedulePersist()
  }

  function setColumns(newColumns: DeckColumn[]) {
    mutateProfile((p) => {
      p.columns = newColumns
    })
  }

  function setLayout(newLayout: string[][]) {
    mutateProfile((p) => {
      p.layout = newLayout
    })
  }

  function setColumnsAndLayout(
    newColumns: DeckColumn[],
    newLayout: string[][],
  ) {
    mutateProfile((p) => {
      p.columns = newColumns
      p.layout = newLayout
    })
  }

  // --- Persistence (debounced) ---

  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      flushPersist()
    }, 300)
  }

  function flushPersist() {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    try {
      const profiles = profilesData.value
      // Sync: localStorage + bump version
      setStorageJson(STORAGE_KEYS.deckProfiles, profiles)
      // Backward compat: keep nd-deck in sync
      const profile = currentProfile.value
      if (profile) {
        setStorageJson(STORAGE_KEYS.deck, {
          columns: profile.columns,
          layout: profile.layout,
        })
      }
      // Async: write changed profile to file
      if (initialized.value && profile) {
        persistSingleProfile(profile).catch((e) =>
          console.warn('[deckProfile] failed to persist profile:', e),
        )
      }
      // Notify other windows
      if (windowProfileId.value) {
        emitSync('deck:profile-updated', {
          profileId: windowProfileId.value,
        })
      }
    } catch (e) {
      console.warn('[deckProfile] failed to persist:', e)
    }
  }

  // --- Cross-window sync ---

  function emitSync(event: string, payload?: Record<string, unknown>) {
    import('@tauri-apps/api/event')
      .then(({ emit }) => emit(event, payload))
      .catch(() => {
        // Not running in Tauri (browser dev mode)
      })
  }

  function reloadFromStorage() {
    profilesData.value = getStorageJson<DeckProfile[]>(
      STORAGE_KEYS.deckProfiles,
      [],
    )
    profileVersion.value++
    refreshProfileName()
  }

  const unlistenFns: (() => void)[] = []

  async function startSync() {
    stopSync()
    const { listen } = await import('@tauri-apps/api/event')

    // Profile content changed (columns/layout)
    unlistenFns.push(
      await listen<{ profileId: string }>('deck:profile-updated', (event) => {
        if (event.payload.profileId !== windowProfileId.value) return
        reloadFromStorage()
      }),
    )

    // Profile list changed (add/delete/rename)
    unlistenFns.push(
      await listen('deck:profiles-changed', () => {
        reloadFromStorage()
      }),
    )
  }

  function stopSync() {
    for (const fn of unlistenFns) fn()
    unlistenFns.length = 0
  }

  // --- Internal helpers ---

  /** Update currentProfileName from current windowProfileId. */
  function refreshProfileName() {
    currentProfileName.value = currentProfile.value?.name ?? null
  }

  function loadProfilesFromStorage(): DeckProfile[] {
    return getStorageJson<DeckProfile[]>(STORAGE_KEYS.deckProfiles, [])
  }

  /** Persist profiles: write profilesData to localStorage + files + notify other windows. */
  function saveProfiles(profiles: DeckProfile[]) {
    profilesData.value = profiles
    setStorageJson(STORAGE_KEYS.deckProfiles, profiles)
    profileVersion.value++
    if (initialized.value) {
      persistProfilesToFiles(profiles).catch((e) =>
        console.warn('[deckProfile] failed to persist to files:', e),
      )
    }
    // Notify all windows that the profile list changed
    emitSync('deck:profiles-changed')
  }

  /** Write only the given profile to its file. */
  async function persistSingleProfile(profile: DeckProfile): Promise<void> {
    const filename = settingsFs.profileFilename(profile.name)
    const content = JSON5.stringify(toFileFormat(profile), null, 2)
    await settingsFs.writeProfile(filename, content)
  }

  /** Write all profiles to files. */
  async function persistProfilesToFiles(
    profiles: DeckProfile[],
  ): Promise<void> {
    await Promise.all(profiles.map((p) => persistSingleProfile(p)))
  }

  function saveActiveProfileId(id: string | null) {
    activeProfileId.value = id
    setStorageString(STORAGE_KEYS.deckActiveProfile, id)
  }

  function loadActiveProfileId() {
    activeProfileId.value = getStorageString(STORAGE_KEYS.deckActiveProfile)
  }

  /** Find the next available "プロファイル N" name */
  function nextProfileName(profiles: DeckProfile[]): string {
    const names = new Set(profiles.map((p) => p.name))
    for (let i = 1; ; i++) {
      const candidate = `プロファイル ${i}`
      if (!names.has(candidate)) return candidate
    }
  }

  // --- Profile CRUD ---

  function syncColumnsToProfile(
    profileId: string,
    cols: DeckColumn[],
    lay: string[][],
  ) {
    const profile = profilesData.value.find((p) => p.id === profileId)
    if (!profile) return
    profile.columns = deepClone(cols)
    profile.layout = deepClone(lay)
    setStorageJson(STORAGE_KEYS.deckProfiles, profilesData.value)
    profileVersion.value++
    if (initialized.value) {
      persistSingleProfile(profile).catch((e) =>
        console.warn('[deckProfile] failed to persist profile:', e),
      )
    }
  }

  function switchProfile(
    newProfileId: string,
  ): { columns: DeckColumn[]; layout: string[][] } | null {
    const profiles = profilesData.value
    const newProfile = profiles.find((p) => p.id === newProfileId)
    if (!newProfile) return null

    // Single localStorage write
    setStorageJson(STORAGE_KEYS.deckProfiles, profiles)
    profileVersion.value++

    const oldProfileId = windowProfileId.value

    windowProfileId.value = newProfileId
    saveActiveProfileId(newProfileId)
    refreshProfileName()

    // Async: persist only changed profiles
    if (initialized.value) {
      const toWrite = oldProfileId
        ? profiles.filter((p) => p.id === oldProfileId || p.id === newProfileId)
        : [newProfile]
      const unique = [...new Map(toWrite.map((p) => [p.id, p])).values()]
      Promise.all(unique.map((p) => persistSingleProfile(p))).catch((e) =>
        console.warn('[deckProfile] failed to persist profiles:', e),
      )
    }

    return {
      columns: newProfile.columns,
      layout: newProfile.layout,
    }
  }

  function saveAsProfile(name?: string): DeckProfile {
    const profiles = profilesData.value
    const autoName = name || nextProfileName(profiles)

    const profile: DeckProfile = {
      id: settingsFs.profileFilename(autoName),
      name: autoName,
      columns: [],
      layout: [],
      createdAt: Date.now(),
    }
    profiles.push(profile)
    saveProfiles(profiles)
    saveActiveProfileId(profile.id)
    windowProfileId.value = profile.id
    refreshProfileName()

    return profile
  }

  function createEmptyProfile(name?: string): DeckProfile {
    const profiles = profilesData.value
    const autoName = name || nextProfileName(profiles)
    const profile: DeckProfile = {
      id: settingsFs.profileFilename(autoName),
      name: autoName,
      columns: [],
      layout: [],
      createdAt: Date.now(),
    }
    profiles.push(profile)
    saveProfiles(profiles)
    return profile
  }

  function getProfiles(): DeckProfile[] {
    return profilesData.value
  }

  function applyProfile(
    profileId: string,
  ): { columns: DeckColumn[]; layout: string[][] } | null {
    const profile = profilesData.value.find((p) => p.id === profileId)
    if (!profile) return null
    windowProfileId.value = profileId
    saveActiveProfileId(profileId)
    refreshProfileName()
    return {
      columns: profile.columns,
      layout: profile.layout,
    }
  }

  function deleteProfile(profileId: string) {
    const profiles = profilesData.value.filter((p) => p.id !== profileId)
    profilesData.value = profiles
    setStorageJson(STORAGE_KEYS.deckProfiles, profiles)
    profileVersion.value++

    if (activeProfileId.value === profileId) {
      saveActiveProfileId(profiles[0]?.id ?? null)
    }

    if (initialized.value) {
      settingsFs
        .deleteProfile(profileId)
        .catch((e) => console.warn('[deckProfile] failed to delete file:', e))
    }
  }

  function renameProfile(profileId: string, newName: string) {
    const profile = profilesData.value.find((p) => p.id === profileId)
    if (!profile) return

    const oldFilename = profile.id
    const newFilename = settingsFs.profileFilename(newName)

    profile.name = newName
    profile.id = newFilename

    if (activeProfileId.value === oldFilename) {
      saveActiveProfileId(newFilename)
    }
    if (windowProfileId.value === oldFilename) {
      windowProfileId.value = newFilename
    }

    saveProfiles(profilesData.value)
    refreshProfileName()

    if (initialized.value && oldFilename !== newFilename) {
      settingsFs
        .renameProfile(oldFilename, newFilename)
        .catch((e) => console.warn('[deckProfile] failed to rename file:', e))
    }
  }

  /** Initialize this window with a profile */
  function initWindowProfile(profileId: string) {
    windowProfileId.value = profileId
    refreshProfileName()
  }

  /** Save window layout (position/size) to the current profile */
  function saveWindowLayout(windowLayout: DeckWindowLayout) {
    if (!windowProfileId.value) return
    const profile = currentProfile.value
    if (!profile) return
    if (!profile.windows) profile.windows = []
    const existing = profile.windows.findIndex((w) => w.id === windowLayout.id)
    if (existing >= 0) {
      profile.windows[existing] = windowLayout
    } else {
      profile.windows.push(windowLayout)
    }
    setStorageJson(STORAGE_KEYS.deckProfiles, profilesData.value)
    profileVersion.value++
    if (initialized.value) {
      persistSingleProfile(profile).catch((e) =>
        console.warn('[deckProfile] failed to persist profile:', e),
      )
    }
  }

  function removeWindowLayout(windowId: string) {
    if (!windowProfileId.value) return
    const profile = currentProfile.value
    if (!profile?.windows) return
    profile.windows = profile.windows.filter((w) => w.id !== windowId)
    setStorageJson(STORAGE_KEYS.deckProfiles, profilesData.value)
    profileVersion.value++
    if (initialized.value) {
      persistSingleProfile(profile).catch((e) =>
        console.warn('[deckProfile] failed to persist profile:', e),
      )
    }
  }

  function getWindowLayouts(): DeckWindowLayout[] {
    return currentProfile.value?.windows ?? []
  }

  // --- File-based initialization ---

  function isNewFormatId(id: string): boolean {
    return id.endsWith('.ndprofile.json5')
  }

  async function loadProfilesFromFiles(): Promise<DeckProfile[]> {
    const filenames = await settingsFs.listProfiles()
    if (filenames.length === 0) return []

    const results = await Promise.all(
      filenames.map(async (filename) => {
        try {
          const content = await settingsFs.readProfile(filename)
          const data = JSON5.parse(content)
          return fromFileFormat(filename, data)
        } catch (e) {
          console.warn(`[deckProfile] failed to parse ${filename}:`, e)
          return null
        }
      }),
    )
    return results.filter((p): p is DeckProfile => p !== null)
  }

  /** Ensure profiles exist on first load. Discards legacy format profiles. */
  function ensureDefaults(
    fallbackColumns: DeckColumn[],
    fallbackLayout: string[][],
  ) {
    // Load from localStorage into reactive state
    profilesData.value = loadProfilesFromStorage()
    let profiles = profilesData.value

    // Discard legacy profiles (old ID format like "profile-xxx")
    const legacyCount = profiles.filter((p) => !isNewFormatId(p.id)).length
    if (legacyCount > 0) {
      console.info(`[deckProfile] Discarding ${legacyCount} legacy profile(s).`)
      profiles = profiles.filter((p) => isNewFormatId(p.id))
      saveProfiles(profiles)
    }

    // Fix blank names
    let needsSave = false
    for (const [i, profile] of profiles.entries()) {
      if (!profile.name || profile.name.trim() === '') {
        profile.name = `プロファイル ${i + 1}`
        needsSave = true
      }
    }
    if (needsSave) saveProfiles(profiles)

    if (profiles.length === 0) {
      const profile: DeckProfile = {
        id: settingsFs.profileFilename('プロファイル 1'),
        name: 'プロファイル 1',
        columns: deepClone(fallbackColumns),
        layout: deepClone(fallbackLayout),
        createdAt: Date.now(),
      }
      profiles.push(profile)
      saveProfiles(profiles)
      saveActiveProfileId(profile.id)
    } else {
      loadActiveProfileId()
      const first = profiles[0]
      if (first && !profiles.find((p) => p.id === activeProfileId.value)) {
        saveActiveProfileId(first.id)
      }
    }

    // Kick off async file sync in background (Tauri only)
    if (settingsFs.isTauri) {
      initFileStorage().catch((e) =>
        console.warn('[deckProfile] file storage init failed:', e),
      )
    } else {
      initialized.value = true
    }
  }

  async function initFileStorage(): Promise<void> {
    const fileProfiles = await loadProfilesFromFiles()

    if (fileProfiles.length > 0) {
      profilesData.value = fileProfiles
      setStorageJson(STORAGE_KEYS.deckProfiles, fileProfiles)
      profileVersion.value++
    }
    initialized.value = true
  }

  return {
    // Reactive state
    activeProfileId,
    windowProfileId,
    profileVersion,
    currentProfileName,
    initialized,
    columns,
    layout,
    currentProfile,
    // Mutation
    mutateProfile,
    setColumns,
    setLayout,
    setColumnsAndLayout,
    // Persistence
    flushPersist,
    schedulePersist,
    startSync,
    stopSync,
    // Profile CRUD
    syncColumnsToProfile,
    saveAsProfile,
    createEmptyProfile,
    getProfiles,
    applyProfile,
    deleteProfile,
    renameProfile,
    initWindowProfile,
    switchProfile,
    ensureDefaults,
    // Window layout
    saveWindowLayout,
    removeWindowLayout,
    getWindowLayouts,
    // Legacy compat
    saveActiveProfileId,
    loadActiveProfileId,
    saveProfiles,
  }
})
