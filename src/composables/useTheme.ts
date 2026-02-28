import { watch } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useThemeStore } from '@/stores/theme'

const idle =
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 50)

export function useTheme(): void {
  const accountsStore = useAccountsStore()
  const themeStore = useThemeStore()

  watch(
    () => accountsStore.accounts,
    (accounts) => {
      idle(() => {
        for (const acc of accounts) {
          themeStore.fetchAccountTheme(acc.id)
        }
      })
    },
    { immediate: true },
  )
}
