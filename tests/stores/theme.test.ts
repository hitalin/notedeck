import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThemeStore } from '@/stores/theme'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'

describe('theme store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.removeAttribute('style')
    document.documentElement.removeAttribute('data-color-scheme')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('init() applies builtin dark theme by default', () => {
    const store = useThemeStore()
    store.init()
    expect(store.currentSource?.kind).toBe('builtin-dark')
    expect(document.documentElement.style.getPropertyValue('--nd-bg')).not.toBe('')
  })

  it('init() restores theme from localStorage', () => {
    const source = { kind: 'builtin-light' as const, theme: LIGHT_THEME }
    const compiled = { bg: '#fafafa', fg: '#5f5f5f' }
    localStorage.setItem('nd-theme-source', JSON.stringify(source))
    localStorage.setItem('nd-theme-compiled', JSON.stringify(compiled))

    const store = useThemeStore()
    store.init()

    expect(store.currentSource?.kind).toBe('builtin-light')
    expect(document.documentElement.style.getPropertyValue('--nd-bg')).toBe('#fafafa')
  })

  it('init() resets to builtin dark when localStorage has server theme', () => {
    const serverSource = { kind: 'server-dark' as const, host: 'yami.ski', theme: DARK_THEME }
    localStorage.setItem('nd-theme-source', JSON.stringify(serverSource))
    localStorage.setItem('nd-theme-compiled', JSON.stringify({ bg: '#123456' }))

    const store = useThemeStore()
    store.init()

    expect(store.currentSource?.kind).toBe('builtin-dark')
    expect(document.documentElement.style.getPropertyValue('--nd-bg')).not.toBe('#123456')
  })

  it('applySource() compiles and applies a theme', () => {
    const store = useThemeStore()
    store.init()

    store.applySource({ kind: 'builtin-light', theme: LIGHT_THEME })

    expect(store.currentSource?.kind).toBe('builtin-light')
    const bg = document.documentElement.style.getPropertyValue('--nd-bg')
    expect(bg).not.toBe('')
    expect(localStorage.getItem('nd-theme-source')).toContain('builtin-light')
    expect(localStorage.getItem('nd-theme-compiled')).not.toBeNull()
  })

  it('applySource() switches between dark and light', () => {
    const store = useThemeStore()
    store.init()

    store.applySource({ kind: 'builtin-dark', theme: DARK_THEME })
    const darkBg = document.documentElement.style.getPropertyValue('--nd-bg')

    store.applySource({ kind: 'builtin-light', theme: LIGHT_THEME })
    const lightBg = document.documentElement.style.getPropertyValue('--nd-bg')

    expect(darkBg).not.toBe(lightBg)
  })

  it('applySource() with server theme uses correct base', () => {
    const store = useThemeStore()
    store.init()

    const serverDark = {
      id: 'server-dark-test',
      name: 'Server Dark',
      base: 'dark' as const,
      props: { accent: '#ff0000' },
    }
    store.applySource({ kind: 'server-dark', host: 'test.host', theme: serverDark })

    expect(store.currentSource?.kind).toBe('server-dark')
    const accent = document.documentElement.style.getPropertyValue('--nd-accent')
    expect(accent).toBe('#ff0000')
    const bg = document.documentElement.style.getPropertyValue('--nd-bg')
    expect(bg).not.toBe('')
  })

  // --- fetchAccountTheme ---

  it('fetchAccountTheme() fetches from sync registry first', async () => {
    const regTheme = { name: 'My Custom', props: { accent: '#ff6600', bg: '#1a1a2e' } }
    vi.mocked(invoke).mockResolvedValue({
      syncDark: [[0, regTheme]],
    })

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-1')

    const cached = store.getAccountThemes('acc-1')
    expect(cached).not.toBeNull()
    expect(cached!.dark).toBeDefined()
    expect(cached!.dark!.props.accent).toBe('#ff6600')
  })

  it('fetchAccountTheme() falls back to meta when no registry data', async () => {
    vi.mocked(invoke).mockResolvedValue({
      metaDark: JSON.stringify({ name: 'Server D', props: { bg: '#222' } }),
    })

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-2')

    const cached = store.getAccountThemes('acc-2')
    expect(cached).not.toBeNull()
    expect(cached!.dark).toBeDefined()
    expect(cached!.dark!.props.bg).toBe('#222')
    expect(cached!.light).toBeUndefined()
  })

  it('fetchAccountTheme() caches both dark and light from meta', async () => {
    vi.mocked(invoke).mockResolvedValue({
      metaDark: JSON.stringify({ name: 'D', props: { bg: '#000' } }),
      metaLight: JSON.stringify({ name: 'L', props: { bg: '#fff' } }),
    })

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-3')

    const cached = store.getAccountThemes('acc-3')
    expect(cached!.dark).toBeDefined()
    expect(cached!.light).toBeDefined()
  })

  it('fetchAccountTheme() does not re-fetch for cached account', async () => {
    vi.mocked(invoke).mockResolvedValue({
      metaDark: JSON.stringify({ name: 'D', props: {} }),
    })

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-cache')
    await store.fetchAccountTheme('acc-cache')

    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('fetchAccountTheme() handles errors gracefully', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('Network error'))

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-offline')

    expect(store.getAccountThemes('acc-offline')).toBeNull()
  })

  it('fetchAccountTheme() parses direct theme object from registry', async () => {
    const theme = { name: 'Direct', props: { accent: '#00ff00' } }
    vi.mocked(invoke).mockResolvedValue({
      syncDark: theme,
    })

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-direct')

    const cached = store.getAccountThemes('acc-direct')
    expect(cached!.dark!.props.accent).toBe('#00ff00')
  })

  it('fetchAccountTheme() uses base registry as fallback', async () => {
    const theme = { name: 'Base Dark', props: { accent: '#aabbcc' } }
    vi.mocked(invoke).mockResolvedValue({
      baseDark: theme,
    })

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-base')

    const cached = store.getAccountThemes('acc-base')
    expect(cached!.dark!.props.accent).toBe('#aabbcc')
  })

  // --- getCompiledForAccount ---

  it('getCompiledForAccount() returns null for unknown account', () => {
    const store = useThemeStore()
    expect(store.getCompiledForAccount('unknown-acc')).toBeNull()
  })

  it('getCompiledForAccount() compiles and caches theme', async () => {
    vi.mocked(invoke).mockResolvedValue({
      metaDark: JSON.stringify({
        name: 'Custom',
        props: { accent: '#ff6600', bg: '#1a1a2e' },
      }),
    })

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-compile')

    const compiled = store.getCompiledForAccount('acc-compile')
    expect(compiled).not.toBeNull()
    expect(compiled!.accent).toBe('#ff6600')
    expect(compiled!.bg).toBe('#1a1a2e')
    expect(compiled!.fg).toBeDefined()

    // Second call should return cached result (same reference)
    const compiled2 = store.getCompiledForAccount('acc-compile')
    expect(compiled2).toBe(compiled)
  })

  it('getCompiledForAccount() uses light theme when base is light', async () => {
    vi.mocked(invoke).mockResolvedValue({
      metaDark: JSON.stringify({ name: 'D', props: { bg: '#111' } }),
      metaLight: JSON.stringify({ name: 'L', props: { bg: '#eee' } }),
    })

    const store = useThemeStore()
    store.init()
    store.applySource({ kind: 'builtin-light', theme: LIGHT_THEME })
    await store.fetchAccountTheme('acc-light')

    const compiled = store.getCompiledForAccount('acc-light')
    expect(compiled).not.toBeNull()
    expect(compiled!.bg).toBe('#eee')
  })

  it('getCompiledForAccount() falls back to dark when no light available', async () => {
    vi.mocked(invoke).mockResolvedValue({
      metaDark: JSON.stringify({ name: 'D', props: { bg: '#222' } }),
    })

    const store = useThemeStore()
    store.init()
    store.applySource({ kind: 'builtin-light', theme: LIGHT_THEME })
    await store.fetchAccountTheme('acc-fb')

    const compiled = store.getCompiledForAccount('acc-fb')
    expect(compiled).not.toBeNull()
    expect(compiled!.bg).toBe('#222')
  })

  it('applySource() clears compiled cache so columns recompile', async () => {
    vi.mocked(invoke).mockResolvedValue({
      metaDark: JSON.stringify({ name: 'D', props: { bg: '#111' } }),
      metaLight: JSON.stringify({ name: 'L', props: { bg: '#eee' } }),
    })

    const store = useThemeStore()
    store.init()
    await store.fetchAccountTheme('acc-switch')

    const dark = store.getCompiledForAccount('acc-switch')
    expect(dark!.bg).toBe('#111')

    store.applySource({ kind: 'builtin-light', theme: LIGHT_THEME })
    const light = store.getCompiledForAccount('acc-switch')
    expect(light!.bg).toBe('#eee')
    expect(light).not.toBe(dark)
  })

  // --- per-account isolation ---

  it('different accounts can have different themes', async () => {
    let callCount = 0
    vi.mocked(invoke).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { syncDark: { name: 'A-Dark', props: { accent: '#ff0000' } } }
      }
      return { syncDark: { name: 'B-Dark', props: { accent: '#0000ff' } } }
    })

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-a')
    await store.fetchAccountTheme('acc-b')

    const a = store.getCompiledForAccount('acc-a')
    const b = store.getCompiledForAccount('acc-b')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.accent).toBe('#ff0000')
    expect(b!.accent).toBe('#0000ff')
  })
})
