import { commands, unwrap } from '@/utils/tauriInvoke'

export const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

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
  return unwrap(await commands.listSettingsFiles(subdir))
}

export async function readSettingsFile(
  subdir: string,
  name: string,
): Promise<string> {
  if (!isTauri) return ''
  return unwrap(await commands.readSettingsFile(subdir, name))
}

export async function writeSettingsFile(
  subdir: string,
  name: string,
  content: string,
): Promise<void> {
  if (!isTauri) return
  unwrap(await commands.writeSettingsFile(subdir, name, content))
}

export async function deleteSettingsFile(
  subdir: string,
  name: string,
): Promise<void> {
  if (!isTauri) return
  unwrap(await commands.deleteSettingsFile(subdir, name))
}

export async function renameSettingsFile(
  subdir: string,
  oldName: string,
  newName: string,
): Promise<void> {
  if (!isTauri) return
  unwrap(await commands.renameSettingsFile(subdir, oldName, newName))
}

export async function getSettingsDir(): Promise<string> {
  if (!isTauri) return ''
  return unwrap(await commands.getSettingsDir())
}

/**
 * OS 既定アプリ (通常はユーザーが登録したテキストエディタ) で設定ファイルを開く。
 * `getSettingsDir()` で得た絶対パスに subdir と name を結合して `openPath()` に渡す。
 */
export async function openSettingsFileInEditor(
  name: string,
  subdir?: string,
): Promise<void> {
  if (!isTauri) return
  const dir = await getSettingsDir()
  if (!dir) return
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  const parts = subdir ? [dir, subdir, name] : [dir, name]
  const fullPath = parts.join(sep)
  const { openPath } = await import('@tauri-apps/plugin-opener')
  await openPath(fullPath)
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
  return unwrap(await commands.readRootSettingsFile(name))
}

async function writeRootSettingsFile(
  name: string,
  content: string,
): Promise<void> {
  if (!isTauri) return
  unwrap(await commands.writeRootSettingsFile(name, content))
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

// --- AI settings helpers ---

export async function readAiSettings(): Promise<string> {
  return readRootSettingsFile('ai.json5')
}

export async function writeAiSettings(content: string): Promise<void> {
  return writeRootSettingsFile('ai.json5', content)
}

export async function readAiPrompt(): Promise<string> {
  return readRootSettingsFile('AI.md')
}

export async function writeAiPrompt(content: string): Promise<void> {
  return writeRootSettingsFile('AI.md', content)
}

// --- Tasks helpers ---

export async function readTasks(): Promise<string> {
  return readRootSettingsFile('tasks.json5')
}

export async function writeTasks(content: string): Promise<void> {
  return writeRootSettingsFile('tasks.json5', content)
}

// --- Navbar helpers ---

export async function readNavbar(): Promise<string> {
  return readRootSettingsFile('navbar.json5')
}

export async function writeNavbar(content: string): Promise<void> {
  return writeRootSettingsFile('navbar.json5', content)
}

// --- Post form button order helpers ---

export async function readPostForm(): Promise<string> {
  return readRootSettingsFile('postform.json5')
}

export async function writePostForm(content: string): Promise<void> {
  return writeRootSettingsFile('postform.json5', content)
}

// --- Account order helpers ---

export async function readAccountOrder(): Promise<string> {
  return readRootSettingsFile('accounts.json5')
}

export async function writeAccountOrder(content: string): Promise<void> {
  return writeRootSettingsFile('accounts.json5', content)
}

// --- Performance helpers ---

export async function readPerformance(): Promise<string> {
  return readRootSettingsFile('performance.json5')
}

export async function writePerformance(content: string): Promise<void> {
  return writeRootSettingsFile('performance.json5', content)
}

// --- Snippet helpers ---

const SNIPPETS_DIR = 'snippets'
const SNIPPET_EXT = /\.(json5?|code-snippets|jsonc)$/i

export async function listSnippetFiles(): Promise<string[]> {
  const files = await listSettingsFiles(SNIPPETS_DIR)
  return files.filter((f) => SNIPPET_EXT.test(f))
}

export async function readSnippetFile(filename: string): Promise<string> {
  return readSettingsFile(SNIPPETS_DIR, filename)
}

export async function writeSnippetFile(
  filename: string,
  content: string,
): Promise<void> {
  return writeSettingsFile(SNIPPETS_DIR, filename, content)
}

export async function deleteSnippetFile(filename: string): Promise<void> {
  return deleteSettingsFile(SNIPPETS_DIR, filename)
}

// --- Draft helpers (per-account JSON files in drafts/) ---

const DRAFTS_DIR = 'drafts'

export function draftFilename(accountId: string): string {
  return `${sanitizeFilename(accountId)}.json`
}

export async function listDraftFiles(): Promise<string[]> {
  const files = await listSettingsFiles(DRAFTS_DIR)
  return files.filter((f) => f.endsWith('.json'))
}

export async function readDraftFile(accountId: string): Promise<string> {
  return readSettingsFile(DRAFTS_DIR, draftFilename(accountId))
}

export async function writeDraftFile(
  accountId: string,
  content: string,
): Promise<void> {
  return writeSettingsFile(DRAFTS_DIR, draftFilename(accountId), content)
}

export async function deleteDraftFile(accountId: string): Promise<void> {
  return deleteSettingsFile(DRAFTS_DIR, draftFilename(accountId))
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
