import JSON5 from 'json5'
import { defineStore } from 'pinia'
import { ref } from 'vue'

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
 *  JSON round-trip is required because structuredClone cannot handle Vue reactive Proxies. */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
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
  /** Bumped on every saveProfiles() to make profile-derived computeds reactive */
  const profileVersion = ref(0)
  /** Whether file-based storage has been initialized */
  const initialized = ref(false)

  /** Cached profile name, kept in sync imperatively to avoid localStorage dependency. */
  const currentProfileName = ref<string | null>(null)

  /** Update currentProfileName from current windowProfileId. */
  function refreshProfileName() {
    if (!windowProfileId.value) {
      currentProfileName.value = null
      return
    }
    const { profile } = loadProfileById(windowProfileId.value)
    currentProfileName.value = profile?.name ?? null
  }

  // --- localStorage cache (sync access) ---

  function loadProfiles(): DeckProfile[] {
    return getStorageJson<DeckProfile[]>(STORAGE_KEYS.deckProfiles, [])
  }

  /** Load profiles and find one by ID in a single pass. */
  function loadProfileById(id: string): {
    profiles: DeckProfile[]
    profile: DeckProfile | undefined
  } {
    const profiles = loadProfiles()
    return { profiles, profile: profiles.find((p) => p.id === id) }
  }

  function saveProfiles(profiles: DeckProfile[]) {
    // Sync: localStorage cache
    setStorageJson(STORAGE_KEYS.deckProfiles, profiles)
    profileVersion.value++

    // Async: write each profile to file (fire-and-forget)
    if (initialized.value) {
      persistProfilesToFiles(profiles).catch((e) =>
        console.warn('[deckProfile] failed to persist to files:', e),
      )
    }
  }

  /** Write only the given profile to its file. */
  async function persistSingleProfile(profile: DeckProfile): Promise<void> {
    const filename = settingsFs.profileFilename(profile.name)
    const content = JSON5.stringify(toFileFormat(profile), null, 2)
    await settingsFs.writeProfile(filename, content)
  }

  /** Write all profiles to files (used for initial migration / full sync). */
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

  /** Save current deck state into the specified profile */
  function syncColumnsToProfile(
    profileId: string,
    columns: DeckColumn[],
    layout: string[][],
  ) {
    const { profiles, profile } = loadProfileById(profileId)
    if (!profile) return
    profile.columns = deepClone(columns)
    profile.layout = deepClone(layout)
    // Sync: update localStorage cache
    setStorageJson(STORAGE_KEYS.deckProfiles, profiles)
    profileVersion.value++
    // Async: write only this profile to file
    if (initialized.value) {
      persistSingleProfile(profile).catch((e) =>
        console.warn('[deckProfile] failed to persist profile:', e),
      )
    }
  }

  /**
   * Save current deck state and apply a new profile in one pass.
   * Avoids redundant localStorage round-trips compared to separate
   * syncColumnsToProfile() + applyProfile() calls.
   */
  function switchProfile(
    newProfileId: string,
    currentColumns: DeckColumn[],
    currentLayout: string[][],
  ): { columns: DeckColumn[]; layout: string[][] } | null {
    const profiles = loadProfiles()

    // 1. Save current state to old profile (in-memory)
    if (windowProfileId.value) {
      const oldProfile = profiles.find((p) => p.id === windowProfileId.value)
      if (oldProfile) {
        oldProfile.columns = deepClone(currentColumns)
        oldProfile.layout = deepClone(currentLayout)
      }
    }

    // 2. Find new profile
    const newProfile = profiles.find((p) => p.id === newProfileId)
    if (!newProfile) return null

    // 3. Single localStorage write for both changes
    setStorageJson(STORAGE_KEYS.deckProfiles, profiles)
    profileVersion.value++

    // 4. Capture old profile ID before updating state
    const oldProfileId = windowProfileId.value

    // 5. Update active state
    windowProfileId.value = newProfileId
    saveActiveProfileId(newProfileId)
    refreshProfileName()

    // 6. Async: persist only the changed profiles to files
    if (initialized.value) {
      const toWrite = oldProfileId
        ? profiles.filter((p) => p.id === oldProfileId || p.id === newProfileId)
        : [newProfile]
      // Deduplicate if same profile
      const unique = [...new Map(toWrite.map((p) => [p.id, p])).values()]
      Promise.all(unique.map((p) => persistSingleProfile(p))).catch((e) =>
        console.warn('[deckProfile] failed to persist profiles:', e),
      )
    }

    return {
      columns: structuredClone(newProfile.columns),
      layout: structuredClone(newProfile.layout),
    }
  }

  function saveAsProfile(
    name: string | undefined,
    currentColumns: DeckColumn[],
    currentLayout: string[][],
  ): DeckProfile {
    // Save current state to the active profile before creating a new one
    if (windowProfileId.value) {
      syncColumnsToProfile(windowProfileId.value, currentColumns, currentLayout)
    }

    const profiles = loadProfiles()
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

  /** Create an empty profile without switching the current window to it */
  function createEmptyProfile(name?: string): DeckProfile {
    const profiles = loadProfiles()
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
    return loadProfiles()
  }

  /** Apply a profile, returning its columns and layout. Caller must set deck state. */
  function applyProfile(
    profileId: string,
    currentColumns: DeckColumn[],
    currentLayout: string[][],
  ): { columns: DeckColumn[]; layout: string[][] } | null {
    // Save current state before switching
    if (windowProfileId.value) {
      syncColumnsToProfile(windowProfileId.value, currentColumns, currentLayout)
    }

    const { profile } = loadProfileById(profileId)
    if (!profile) return null
    windowProfileId.value = profileId
    saveActiveProfileId(profileId)
    refreshProfileName()
    return {
      columns: structuredClone(profile.columns),
      layout: structuredClone(profile.layout),
    }
  }

  function deleteProfile(profileId: string) {
    const profiles = loadProfiles().filter((p) => p.id !== profileId)
    saveProfiles(profiles)
    if (activeProfileId.value === profileId) {
      saveActiveProfileId(profiles[0]?.id ?? null)
    }

    // Also delete the file directly
    if (initialized.value) {
      settingsFs
        .deleteProfile(profileId)
        .catch((e) => console.warn('[deckProfile] failed to delete file:', e))
    }
  }

  function renameProfile(profileId: string, newName: string) {
    const { profiles, profile } = loadProfileById(profileId)
    if (!profile) return

    const oldFilename = profile.id
    const newFilename = settingsFs.profileFilename(newName)

    profile.name = newName
    profile.id = newFilename

    // Update activeProfileId if it was pointing to the old ID
    if (activeProfileId.value === oldFilename) {
      saveActiveProfileId(newFilename)
    }
    if (windowProfileId.value === oldFilename) {
      windowProfileId.value = newFilename
    }

    saveProfiles(profiles)
    refreshProfileName()

    // Rename file on disk
    if (initialized.value && oldFilename !== newFilename) {
      settingsFs
        .renameProfile(oldFilename, newFilename)
        .catch((e) => console.warn('[deckProfile] failed to rename file:', e))
    }
  }

  /** Initialize this window with an isolated profile */
  function initWindowProfile(profileId: string): {
    columns: DeckColumn[]
    layout: string[][]
  } {
    windowProfileId.value = profileId
    refreshProfileName()
    const { profile } = loadProfileById(profileId)
    if (profile) {
      return {
        columns: structuredClone(profile.columns),
        layout: structuredClone(profile.layout),
      }
    }
    return { columns: [], layout: [] }
  }

  /** Save window layout (position/size) to the current profile */
  function saveWindowLayout(windowLayout: DeckWindowLayout) {
    if (!windowProfileId.value) return
    const { profiles, profile } = loadProfileById(windowProfileId.value)
    if (!profile) return
    if (!profile.windows) profile.windows = []
    const existing = profile.windows.findIndex((w) => w.id === windowLayout.id)
    if (existing >= 0) {
      profile.windows[existing] = windowLayout
    } else {
      profile.windows.push(windowLayout)
    }
    saveProfiles(profiles)
  }

  /** Remove a window layout entry from the current profile */
  function removeWindowLayout(windowId: string) {
    if (!windowProfileId.value) return
    const { profiles, profile } = loadProfileById(windowProfileId.value)
    if (!profile?.windows) return
    profile.windows = profile.windows.filter((w) => w.id !== windowId)
    saveProfiles(profiles)
  }

  /** Get saved window layouts for the current profile */
  function getWindowLayouts(): DeckWindowLayout[] {
    if (!windowProfileId.value) return []
    return loadProfileById(windowProfileId.value).profile?.windows ?? []
  }

  // --- File-based initialization ---

  /** Check if a profile ID is in the new filename-based format. */
  function isNewFormatId(id: string): boolean {
    return id.endsWith('.ndprofile.json5')
  }

  /** Load profiles from files (Tauri only). */
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
  function ensureDefaults(columns: DeckColumn[], layout: string[][]) {
    let profiles = loadProfiles()

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
        columns: deepClone(columns),
        layout: deepClone(layout),
        createdAt: Date.now(),
      }
      profiles.push(profile)
      saveProfiles(profiles)
      saveActiveProfileId(profile.id)
    } else {
      loadActiveProfileId()
      // If activeProfileId points to a non-existent profile, reset to first
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

  /** Initialize file-based storage: load from files and sync localStorage cache. */
  async function initFileStorage(): Promise<void> {
    const fileProfiles = await loadProfilesFromFiles()

    if (fileProfiles.length > 0) {
      // Files are source of truth — update localStorage cache
      setStorageJson(STORAGE_KEYS.deckProfiles, fileProfiles)
      profileVersion.value++
    }
    initialized.value = true
  }

  return {
    activeProfileId,
    windowProfileId,
    profileVersion,
    currentProfileName,
    initialized,
    loadProfiles,
    loadProfileById,
    saveProfiles,
    saveActiveProfileId,
    loadActiveProfileId,
    syncColumnsToProfile,
    saveAsProfile,
    createEmptyProfile,
    getProfiles,
    applyProfile,
    deleteProfile,
    renameProfile,
    initWindowProfile,
    saveWindowLayout,
    removeWindowLayout,
    getWindowLayouts,
    switchProfile,
    ensureDefaults,
  }
})
