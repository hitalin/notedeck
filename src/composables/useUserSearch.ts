import { ref, watch } from 'vue'
import type { NormalizedUser } from '@/adapters/types'
import { commands, unwrap } from '@/utils/tauriInvoke'

/**
 * Core search: fuzzy search + exact lookup in parallel.
 * Returns merged results with exact match prepended.
 */
export async function searchUsers(
  accountId: string,
  query: string,
): Promise<NormalizedUser[]> {
  const q = query.trim().replace(/^@/, '')
  if (!q) return []

  const [searchResult, lookupResult] = await Promise.allSettled([
    commands
      .apiSearchUsersByQuery(accountId, q, 8)
      .then((r) => unwrap(r) as unknown as NormalizedUser[]),
    tryLookupUser(accountId, q),
  ])

  const items = searchResult.status === 'fulfilled' ? searchResult.value : []
  const looked = lookupResult.status === 'fulfilled' ? lookupResult.value : null

  if (looked && !items.some((u) => u.id === looked.id)) {
    return [looked, ...items]
  }
  return items
}

/**
 * Vue composable wrapping searchUsers with debounce and reactivity.
 */
export function useUserSearch(getAccountId: () => string | null) {
  const query = ref('')
  const results = ref<NormalizedUser[]>([])
  const searching = ref(false)

  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  watch(query, (val) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (!val.trim() || !getAccountId()) {
      results.value = []
      return
    }
    debounceTimer = setTimeout(async () => {
      const accountId = getAccountId()
      if (!accountId) return
      searching.value = true
      try {
        results.value = await searchUsers(accountId, val)
      } catch {
        results.value = []
      } finally {
        searching.value = false
      }
    }, 300)
  })

  return { query, results, searching }
}

/** Try exact lookup by @user or @user@host. Returns null if not found. */
async function tryLookupUser(
  accountId: string,
  query: string,
): Promise<NormalizedUser | null> {
  const parts = query.split('@')
  const username = parts[0] || ''
  const host = parts[1] || null
  if (!username) return null
  try {
    return unwrap(
      await commands.apiLookupUser(accountId, username, host),
    ) as unknown as NormalizedUser
  } catch {
    return null
  }
}

/** Format user as @username or @username@host */
export function formatUserHandle(user: NormalizedUser): string {
  return user.host ? `@${user.username}@${user.host}` : `@${user.username}`
}
