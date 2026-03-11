import { computed } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'

export function useColumnTheme(getColumn: () => DeckColumn) {
  const accountsStore = useAccountsStore()
  const themeStore = useThemeStore()

  const account = computed(() =>
    accountsStore.accounts.find((a) => a.id === getColumn().accountId),
  )

  const columnThemeVars = computed(() => {
    const accountId = getColumn().accountId
    if (!accountId) return undefined
    return themeStore.getStyleVarsForAccount(accountId)
  })

  return { account, columnThemeVars }
}
