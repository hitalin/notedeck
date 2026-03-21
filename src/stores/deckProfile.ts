import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { DeckColumn, DeckProfile, DeckWindowLayout } from '@/stores/deck'

const PROFILES_KEY = 'nd-deck-profiles'
const ACTIVE_PROFILE_KEY = 'nd-deck-active-profile'

let profileCounter = 0
function genProfileId(): string {
  return `profile-${Date.now()}-${++profileCounter}`
}

/** Deep-clone reactive state into a plain object safe for localStorage. */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export const useDeckProfileStore = defineStore('deckProfile', () => {
  const activeProfileId = ref<string | null>(null)
  /** Per-window profile ID (set via ?profile= query). Isolates this window from deck:sync. */
  const windowProfileId = ref<string | null>(null)
  /** Bumped on every saveProfiles() to make profile-derived computeds reactive */
  const profileVersion = ref(0)

  const currentProfileName = computed(() => {
    // Depend on both windowProfileId and profileVersion for reactivity
    const _v = profileVersion.value
    if (!windowProfileId.value) return null
    return loadProfileById(windowProfileId.value).profile?.name ?? null
  })

  function loadProfiles(): DeckProfile[] {
    try {
      const raw = localStorage.getItem(PROFILES_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
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
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
    profileVersion.value++
  }

  function saveActiveProfileId(id: string | null) {
    activeProfileId.value = id
    if (id) {
      localStorage.setItem(ACTIVE_PROFILE_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_PROFILE_KEY)
    }
  }

  function loadActiveProfileId() {
    activeProfileId.value = localStorage.getItem(ACTIVE_PROFILE_KEY)
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
    saveProfiles(profiles)
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
      id: genProfileId(),
      name: autoName,
      columns: [],
      layout: [],
      createdAt: Date.now(),
    }
    profiles.push(profile)
    saveProfiles(profiles)
    saveActiveProfileId(profile.id)
    windowProfileId.value = profile.id

    return profile
  }

  /** Create an empty profile without switching the current window to it */
  function createEmptyProfile(name?: string): DeckProfile {
    const profiles = loadProfiles()
    const autoName = name || nextProfileName(profiles)
    const profile: DeckProfile = {
      id: genProfileId(),
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
  }

  function renameProfile(profileId: string, newName: string) {
    const { profiles, profile } = loadProfileById(profileId)
    if (profile) {
      profile.name = newName
      saveProfiles(profiles)
    }
  }

  /** Initialize this window with an isolated profile */
  function initWindowProfile(profileId: string): {
    columns: DeckColumn[]
    layout: string[][]
  } {
    windowProfileId.value = profileId
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

  /** Ensure profiles exist on first load, fix blank names */
  function ensureDefaults(columns: DeckColumn[], layout: string[][]) {
    const profiles = loadProfiles()
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
        id: genProfileId(),
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
    }
  }

  return {
    activeProfileId,
    windowProfileId,
    profileVersion,
    currentProfileName,
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
    ensureDefaults,
  }
})
