import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { useAccountsStore } from '@/stores/accounts'

export function useAccountMode(accountId: MaybeRefOrGetter<string>) {
  const accountsStore = useAccountsStore()

  const canInteract = computed(() => {
    const account = accountsStore.accountMap.get(toValue(accountId))
    return account?.hasToken ?? false
  })

  return { canInteract }
}
