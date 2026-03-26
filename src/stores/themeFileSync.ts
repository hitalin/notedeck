import JSON5 from 'json5'
import type { MisskeyTheme } from '@/theme/types'
import * as settingsFs from '@/utils/settingsFs'

export interface FileStorageData {
  themes: MisskeyTheme[]
  customCss: string | null
  /** True when localStorage has themes but no files exist (needs migration) */
  needsMigrateThemes: boolean
  /** True when localStorage has custom CSS but no file exists */
  needsMigrateCss: boolean
}

/** Load installed themes and custom CSS from the file system. */
export async function loadFromFiles(): Promise<FileStorageData> {
  const filenames = await settingsFs.listThemes()
  let themes: MisskeyTheme[] = []

  if (filenames.length > 0) {
    const results = await Promise.all(
      filenames.map(async (filename) => {
        try {
          const content = await settingsFs.readTheme(filename)
          const parsed = JSON5.parse(content)
          if (parsed?.props) {
            return {
              id: parsed.id || `custom-${filename}`,
              name: parsed.name || filename,
              base: parsed.base === 'light' ? 'light' : 'dark',
              props: parsed.props,
            } as MisskeyTheme
          }
        } catch (e) {
          console.warn(`[theme] failed to parse ${filename}:`, e)
        }
        return null
      }),
    )
    themes = results.filter((t): t is MisskeyTheme => t !== null)
  }

  const customCss = await settingsFs.readCustomCss()

  return {
    themes,
    customCss: customCss || null,
    needsMigrateThemes: filenames.length === 0,
    needsMigrateCss: !customCss,
  }
}

/** Write a single theme to its individual file. */
export async function persistSingleTheme(theme: MisskeyTheme): Promise<void> {
  const filename = settingsFs.themeFilename(theme.name || theme.id)
  const content = JSON5.stringify(theme, null, 2)
  await settingsFs.writeTheme(filename, content)
}

/** Write all themes to individual files. */
export async function persistAllThemes(themes: MisskeyTheme[]): Promise<void> {
  await Promise.all(themes.map((theme) => persistSingleTheme(theme)))
}

/** Delete a theme file by name/id. */
export async function deleteThemeFile(theme: MisskeyTheme): Promise<void> {
  const filename = settingsFs.themeFilename(theme.name || theme.id)
  await settingsFs.deleteTheme(filename)
}

/** Write custom CSS to file. */
export async function writeCustomCssFile(css: string): Promise<void> {
  await settingsFs.writeCustomCss(css)
}
