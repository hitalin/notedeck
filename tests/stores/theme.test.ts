import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThemeStore } from '@/stores/theme'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'

/** Mock fetch to route by URL path */
function mockFetch(routes: Record<string, unknown>) {
  return vi.fn().mockImplementation((url: string) => {
    for (const [pattern, data] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        if (data instanceof Error) return Promise.reject(data)
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data),
        })
      }
    }
    return Promise.resolve({ ok: false })
  })
}

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

    // Should reset to builtin-dark, not restore the server theme
    expect(store.currentSource?.kind).toBe('builtin-dark')
    // The stale server-compiled CSS should NOT be applied
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

  it('fetchAccountTheme() fetches from registry first', async () => {
    const regTheme = { name: 'My Custom', props: { accent: '#ff6600', bg: '#1a1a2e' } }
    vi.stubGlobal(
      'fetch',
      mockFetch({
        'i/registry/get-all': { 'default:darkTheme': [[0, regTheme]] },
      }),
    )

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-1', 'example.com', 'tok')

    const cached = store.getAccountThemes('acc-1')
    expect(cached).not.toBeNull()
    expect(cached!.dark).toBeDefined()
    expect(cached!.dark!.props.accent).toBe('#ff6600')
  })

  it('fetchAccountTheme() falls back to /api/meta when registry empty', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        'i/registry/get-all': {},
        'api/meta': {
          defaultDarkTheme: JSON.stringify({ name: 'Server D', props: { bg: '#222' } }),
          defaultLightTheme: null,
        },
      }),
    )

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-2', 'fallback.host', 'tok')

    const cached = store.getAccountThemes('acc-2')
    expect(cached).not.toBeNull()
    expect(cached!.dark).toBeDefined()
    expect(cached!.dark!.props.bg).toBe('#222')
    expect(cached!.light).toBeUndefined()
  })

  it('fetchAccountTheme() caches both dark and light from meta', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        'i/registry/get-all': {},
        'api/meta': {
          defaultDarkTheme: JSON.stringify({ name: 'D', props: { bg: '#000' } }),
          defaultLightTheme: JSON.stringify({ name: 'L', props: { bg: '#fff' } }),
        },
      }),
    )

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-3', 'test.host', 'tok')

    const cached = store.getAccountThemes('acc-3')
    expect(cached!.dark).toBeDefined()
    expect(cached!.light).toBeDefined()
  })

  it('fetchAccountTheme() does not re-fetch for cached account', async () => {
    const mock = mockFetch({
      'i/registry/get-all': {},
      'api/meta': {
        defaultDarkTheme: JSON.stringify({ name: 'D', props: {} }),
      },
    })
    vi.stubGlobal('fetch', mock)

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-cache', 'cached.host', 'tok')
    await store.fetchAccountTheme('acc-cache', 'cached.host', 'tok')

    // sync get-all (1) + base get-all (1) + meta (1) = 3 for first call only
    expect(mock).toHaveBeenCalledTimes(3)
  })

  it('fetchAccountTheme() handles network errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-offline', 'offline.host', 'tok')

    expect(store.getAccountThemes('acc-offline')).toBeNull()
  })

  it('fetchAccountTheme() parses direct theme object from registry', async () => {
    const theme = { name: 'Direct', props: { accent: '#00ff00' } }
    vi.stubGlobal(
      'fetch',
      mockFetch({ 'i/registry/get-all': { 'default:darkTheme': theme } }),
    )

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-direct', 'direct.host', 'tok')

    const cached = store.getAccountThemes('acc-direct')
    expect(cached!.dark!.props.accent).toBe('#00ff00')
  })

  // --- getCompiledForAccount ---

  it('getCompiledForAccount() returns null for unknown account', () => {
    const store = useThemeStore()
    expect(store.getCompiledForAccount('unknown-acc')).toBeNull()
  })

  it('getCompiledForAccount() compiles and caches theme', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        'i/registry/get-all': {},
        'api/meta': {
          defaultDarkTheme: JSON.stringify({
            name: 'Custom',
            props: { accent: '#ff6600', bg: '#1a1a2e' },
          }),
        },
      }),
    )

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-compile', 'column.host', 'tok')

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
    vi.stubGlobal(
      'fetch',
      mockFetch({
        'i/registry/get-all': {},
        'api/meta': {
          defaultDarkTheme: JSON.stringify({ name: 'D', props: { bg: '#111' } }),
          defaultLightTheme: JSON.stringify({ name: 'L', props: { bg: '#eee' } }),
        },
      }),
    )

    const store = useThemeStore()
    store.init()
    store.applySource({ kind: 'builtin-light', theme: LIGHT_THEME })
    await store.fetchAccountTheme('acc-light', 'variant.host', 'tok')

    const compiled = store.getCompiledForAccount('acc-light')
    expect(compiled).not.toBeNull()
    expect(compiled!.bg).toBe('#eee')
  })

  it('getCompiledForAccount() falls back to dark when no light available', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        'i/registry/get-all': {},
        'api/meta': {
          defaultDarkTheme: JSON.stringify({ name: 'D', props: { bg: '#222' } }),
        },
      }),
    )

    const store = useThemeStore()
    store.init()
    store.applySource({ kind: 'builtin-light', theme: LIGHT_THEME })
    await store.fetchAccountTheme('acc-fb', 'fallback2.host', 'tok')

    const compiled = store.getCompiledForAccount('acc-fb')
    expect(compiled).not.toBeNull()
    expect(compiled!.bg).toBe('#222')
  })

  it('applySource() clears compiled cache so columns recompile', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        'i/registry/get-all': {},
        'api/meta': {
          defaultDarkTheme: JSON.stringify({ name: 'D', props: { bg: '#111' } }),
          defaultLightTheme: JSON.stringify({ name: 'L', props: { bg: '#eee' } }),
        },
      }),
    )

    const store = useThemeStore()
    store.init()
    await store.fetchAccountTheme('acc-switch', 'switch.host', 'tok')

    const dark = store.getCompiledForAccount('acc-switch')
    expect(dark!.bg).toBe('#111')

    store.applySource({ kind: 'builtin-light', theme: LIGHT_THEME })
    const light = store.getCompiledForAccount('acc-switch')
    expect(light!.bg).toBe('#eee')
    expect(light).not.toBe(dark)
  })

  // --- per-account isolation ---

  it('different accounts on same host can have different themes', async () => {
    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('i/registry/get-all')) {
          callCount++
          // First account's sync scope get-all returns theme A
          if (callCount === 1) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                'default:darkTheme': { name: 'A-Dark', props: { accent: '#ff0000' } },
              }),
            })
          }
          // Second account's sync scope get-all returns theme B
          if (callCount === 2) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({
                'default:darkTheme': { name: 'B-Dark', props: { accent: '#0000ff' } },
              }),
            })
          }
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
        }
        return Promise.resolve({ ok: false })
      }),
    )

    const store = useThemeStore()
    await store.fetchAccountTheme('acc-a', 'same.host', 'tok-a')
    await store.fetchAccountTheme('acc-b', 'same.host', 'tok-b')

    const a = store.getCompiledForAccount('acc-a')
    const b = store.getCompiledForAccount('acc-b')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a!.accent).toBe('#ff0000')
    expect(b!.accent).toBe('#0000ff')
  })
})
