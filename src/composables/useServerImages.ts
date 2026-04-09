import { computed } from 'vue'
import type { ServerInfo } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'

/**
 * カラムのアカウントに紐づくサーバーのカスタム画像 URL を返す。
 * useColumnSetup を使わないカラム（useColumnTheme のみ）でも利用可能。
 */
export function useServerImages(getColumn: () => DeckColumn) {
  const accountsStore = useAccountsStore()
  const serversStore = useServersStore()

  const serverInfo = computed<ServerInfo | undefined>(() => {
    const acc = accountsStore.accounts.find(
      (a) => a.id === getColumn().accountId,
    )
    if (!acc) return undefined
    return serversStore.getServer(acc.host)
  })

  const serverInfoImageUrl = computed(() => serverInfo.value?.infoImageUrl)
  const serverNotFoundImageUrl = computed(
    () => serverInfo.value?.notFoundImageUrl,
  )
  const serverErrorImageUrl = computed(
    () => serverInfo.value?.serverErrorImageUrl,
  )

  return {
    serverInfoImageUrl,
    serverNotFoundImageUrl,
    serverErrorImageUrl,
  }
}
