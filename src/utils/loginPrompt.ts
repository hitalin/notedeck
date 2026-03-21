import { isGuestAccount, useAccountsStore } from '@/stores/accounts'
import { useToast } from '@/stores/toast'

export function showLoginPrompt(accountId: string): void {
  const toast = useToast()
  const account = useAccountsStore().accountMap.get(accountId)
  if (!account) return

  if (isGuestAccount(account)) {
    toast.show('ログインするとリアクションや投稿ができます', 'info')
  } else {
    toast.show('再ログインするとリアクションや投稿ができます', 'info')
  }
}
