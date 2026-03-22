import { invoke } from '@tauri-apps/api/core'

const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window

/** Characters not allowed in filenames (Windows + Unix safety). */
const INVALID_CHARS = /[<>:"/\\|?*]/g

/** Sanitize a string for use as a filename. */
export function sanitizeFilename(name: string): string {
  let safe = name.replace(INVALID_CHARS, '_').trim()
  // Collapse consecutive underscores
  safe = safe.replace(/_+/g, '_')
  // Limit length
  if (safe.length > 64) safe = safe.slice(0, 64)
  return safe || 'untitled'
}

// --- Generic settings file operations ---

export async function listSettingsFiles(subdir: string): Promise<string[]> {
  if (!isTauri) return []
  return invoke<string[]>('list_settings_files', { subdir })
}

export async function readSettingsFile(
  subdir: string,
  name: string,
): Promise<string> {
  if (!isTauri) return ''
  return invoke<string>('read_settings_file', { subdir, name })
}

export async function writeSettingsFile(
  subdir: string,
  name: string,
  content: string,
): Promise<void> {
  if (!isTauri) return
  return invoke('write_settings_file', { subdir, name, content })
}

export async function deleteSettingsFile(
  subdir: string,
  name: string,
): Promise<void> {
  if (!isTauri) return
  return invoke('delete_settings_file', { subdir, name })
}

export async function renameSettingsFile(
  subdir: string,
  oldName: string,
  newName: string,
): Promise<void> {
  if (!isTauri) return
  return invoke('rename_settings_file', {
    subdir,
    oldName,
    newName,
  })
}

export async function getSettingsDir(): Promise<string> {
  if (!isTauri) return ''
  return invoke<string>('get_settings_dir')
}

// --- Profile-specific helpers ---

const PROFILES_DIR = 'profiles'
const PROFILE_EXT = '.ndprofile.json5'

export function profileFilename(name: string): string {
  return sanitizeFilename(name) + PROFILE_EXT
}

export async function listProfiles(): Promise<string[]> {
  const files = await listSettingsFiles(PROFILES_DIR)
  return files.filter((f) => f.endsWith(PROFILE_EXT))
}

export async function readProfile(filename: string): Promise<string> {
  return readSettingsFile(PROFILES_DIR, filename)
}

export async function writeProfile(
  filename: string,
  content: string,
): Promise<void> {
  return writeSettingsFile(PROFILES_DIR, filename, content)
}

export async function deleteProfile(filename: string): Promise<void> {
  return deleteSettingsFile(PROFILES_DIR, filename)
}

export async function renameProfile(
  oldFilename: string,
  newFilename: string,
): Promise<void> {
  return renameSettingsFile(PROFILES_DIR, oldFilename, newFilename)
}
