import { watch } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useThemeStore } from '@/stores/theme'

export function useTheme(): void {
  const accountsStore = useAccountsStore()
  const themeStore = useThemeStore()

  watch(
    () => accountsStore.accounts,
    (accounts) => {
      for (const acc of accounts) {
        themeStore.fetchAccountTheme(acc.id)
      }
    },
    { immediate: true },
  )
}
