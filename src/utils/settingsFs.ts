import { invoke } from '@/utils/tauriInvoke'

export const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window

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

// --- Root-level file operations ---

async function readRootSettingsFile(name: string): Promise<string> {
  if (!isTauri) return ''
  return invoke<string>('read_root_settings_file', { name })
}

async function writeRootSettingsFile(
  name: string,
  content: string,
): Promise<void> {
  if (!isTauri) return
  return invoke('write_root_settings_file', { name, content })
}

// --- Theme-specific helpers ---

const THEMES_DIR = 'themes'
const THEME_EXT = '.ndtheme.json5'

export function themeFilename(name: string): string {
  return sanitizeFilename(name) + THEME_EXT
}

export async function listThemes(): Promise<string[]> {
  const files = await listSettingsFiles(THEMES_DIR)
  return files.filter((f) => f.endsWith(THEME_EXT))
}

export async function readTheme(filename: string): Promise<string> {
  return readSettingsFile(THEMES_DIR, filename)
}

export async function writeTheme(
  filename: string,
  content: string,
): Promise<void> {
  return writeSettingsFile(THEMES_DIR, filename, content)
}

export async function deleteTheme(filename: string): Promise<void> {
  return deleteSettingsFile(THEMES_DIR, filename)
}

export async function renameTheme(
  oldFilename: string,
  newFilename: string,
): Promise<void> {
  return renameSettingsFile(THEMES_DIR, oldFilename, newFilename)
}

// --- Custom CSS helpers ---

export async function readCustomCss(): Promise<string> {
  return readRootSettingsFile('custom.css')
}

export async function writeCustomCss(css: string): Promise<void> {
  return writeRootSettingsFile('custom.css', css)
}

// --- Keybinds helpers ---

export async function readKeybinds(): Promise<string> {
  return readRootSettingsFile('keybinds.json5')
}

export async function writeKeybinds(content: string): Promise<void> {
  return writeRootSettingsFile('keybinds.json5', content)
}

// --- Plugin helpers ---

const PLUGINS_DIR = 'plugins'
const PLUGIN_SRC_EXT = '.is'
const PLUGIN_META_EXT = '.meta.json5'

export function pluginSrcFilename(name: string): string {
  return sanitizeFilename(name) + PLUGIN_SRC_EXT
}

export function pluginMetaFilename(name: string): string {
  return sanitizeFilename(name) + PLUGIN_META_EXT
}

export async function listPluginFiles(): Promise<string[]> {
  return listSettingsFiles(PLUGINS_DIR)
}

export async function readPluginFile(filename: string): Promise<string> {
  return readSettingsFile(PLUGINS_DIR, filename)
}

export async function writePluginFile(
  filename: string,
  content: string,
): Promise<void> {
  return writeSettingsFile(PLUGINS_DIR, filename, content)
}

export async function deletePluginFile(filename: string): Promise<void> {
  return deleteSettingsFile(PLUGINS_DIR, filename)
}

export async function renamePluginFile(
  oldFilename: string,
  newFilename: string,
): Promise<void> {
  return renameSettingsFile(PLUGINS_DIR, oldFilename, newFilename)
}
