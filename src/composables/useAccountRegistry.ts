import { watch } from 'vue'
import { useAccountRegistryStore } from '@/stores/accountRegistry'
import { useAccountsStore } from '@/stores/accounts'

/**
 * per-account registry の薄いコンポーザブル。
 *
 * - store をそのまま返す (caller が get/set/remove/listKeys/invalidate を直接使える)
 * - accounts ストアを watch し、アカウント削除時に該当 cache を invalidate
 *
 * App ルートで一度呼び出せば watcher が常駐する (useTheme と同じパターン)。
 */
export function useAccountRegistry() {
  const accountsStore = useAccountsStore()
  const registryStore = useAccountRegistryStore()

  let prevIds = new Set(accountsStore.accounts.map((a) => a.id))
  watch(
    () => accountsStore.accounts,
    (accounts) => {
      const currentIds = new Set(accounts.map((a) => a.id))
      for (const id of prevIds) {
        if (!currentIds.has(id)) {
          registryStore.invalidate(id)
        }
      }
      prevIds = currentIds
    },
  )

  return registryStore
}
