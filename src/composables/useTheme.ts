import { watch } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useThemeStore } from '@/stores/theme'

export function useTheme(): void {
  const accountsStore = useAccountsStore()
  const themeStore = useThemeStore()

  watch(
    () => accountsStore.accounts,
    (accounts) => {
      Promise.all(
        accounts.map((acc) => themeStore.fetchAccountTheme(acc.id)),
      ).catch(() => {})
    },
    { immediate: true },
  )
}
