// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountRegistryStore } from '@/stores/accountRegistry'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'

const mockInvoke = vi.mocked(invoke)

const SCOPE = ['client', 'preferences', 'sync']

describe('accountRegistry store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    mockInvoke.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('get() fetches via API on cache miss and stores the value', async () => {
    mockInvoke.mockResolvedValueOnce('dark-theme-id')
    const store = useAccountRegistryStore()

    const result = await store.get('acc1', SCOPE, 'theme:dark')

    expect(result).toBe('dark-theme-id')
    expect(mockInvoke).toHaveBeenCalledWith('api_get_registry_value', {
      accountId: 'acc1',
      scope: SCOPE,
      key: 'theme:dark',
    })
    expect(store.getCached('acc1', SCOPE, 'theme:dark')).toBe('dark-theme-id')
  })

  it('get() does not call API when cache is hit', async () => {
    mockInvoke.mockResolvedValueOnce('dark-theme-id')
    const store = useAccountRegistryStore()

    await store.get('acc1', SCOPE, 'theme:dark')
    mockInvoke.mockClear()
    const second = await store.get('acc1', SCOPE, 'theme:dark')

    expect(second).toBe('dark-theme-id')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('get() returns null and stores negative cache when API throws', async () => {
    mockInvoke.mockRejectedValueOnce({
      code: 'Network',
      message: 'offline',
    })
    const store = useAccountRegistryStore()

    const result = await store.get('acc1', SCOPE, 'missing')

    expect(result).toBeNull()
    expect(store.getCached('acc1', SCOPE, 'missing')).toBeNull()
  })

  it('set() writes through cache and persists to localStorage', async () => {
    mockInvoke.mockResolvedValueOnce(null)
    const store = useAccountRegistryStore()

    await store.set('acc1', SCOPE, 'theme:dark', 'my-theme')

    expect(mockInvoke).toHaveBeenCalledWith('api_set_registry_value', {
      accountId: 'acc1',
      scope: SCOPE,
      key: 'theme:dark',
      value: 'my-theme',
    })
    expect(store.getCached('acc1', SCOPE, 'theme:dark')).toBe('my-theme')

    const persisted = localStorage.getItem('nd-account-registry')
    expect(persisted).toContain('my-theme')
  })

  it('remove() deletes cache entry and calls API', async () => {
    mockInvoke
      .mockResolvedValueOnce(null) // set
      .mockResolvedValueOnce(null) // remove
    const store = useAccountRegistryStore()

    await store.set('acc1', SCOPE, 'theme:dark', 'my-theme')
    await store.remove('acc1', SCOPE, 'theme:dark')

    expect(mockInvoke).toHaveBeenLastCalledWith('api_delete_registry_value', {
      accountId: 'acc1',
      scope: SCOPE,
      key: 'theme:dark',
    })
    expect(store.getCached('acc1', SCOPE, 'theme:dark')).toBeUndefined()
  })

  it('invalidate() drops all cache entries for an account', async () => {
    mockInvoke
      .mockResolvedValueOnce('dark')
      .mockResolvedValueOnce('light')
      .mockResolvedValueOnce('other-dark')
    const store = useAccountRegistryStore()

    await store.get('acc1', SCOPE, 'theme:dark')
    await store.get('acc1', SCOPE, 'theme:light')
    await store.get('acc2', SCOPE, 'theme:dark')

    store.invalidate('acc1')

    expect(store.getCached('acc1', SCOPE, 'theme:dark')).toBeUndefined()
    expect(store.getCached('acc1', SCOPE, 'theme:light')).toBeUndefined()
    expect(store.getCached('acc2', SCOPE, 'theme:dark')).toBe('other-dark')
  })

  it('listKeys() returns the type map from API', async () => {
    mockInvoke.mockResolvedValueOnce({
      'theme:dark': 'string',
      plugins: 'array',
    })
    const store = useAccountRegistryStore()

    const result = await store.listKeys('acc1', SCOPE)

    expect(result).toEqual({ 'theme:dark': 'string', plugins: 'array' })
    expect(mockInvoke).toHaveBeenCalledWith('api_list_registry_keys', {
      accountId: 'acc1',
      scope: SCOPE,
    })
  })

  it('listKeys() returns empty object when API throws', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('boom'))
    const store = useAccountRegistryStore()

    const result = await store.listKeys('acc1', SCOPE)

    expect(result).toEqual({})
  })
})
