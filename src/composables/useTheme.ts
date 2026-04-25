import { watch } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useThemeStore } from '@/stores/theme'
import { catchLog } from '@/utils/logger'

export function useTheme(): void {
  const accountsStore = useAccountsStore()
  const themeStore = useThemeStore()

  watch(
    () => accountsStore.accounts,
    (accounts) => {
      Promise.all(
        accounts.map((acc) => themeStore.fetchAccountTheme(acc.id)),
      ).catch(catchLog('theme-fetch'))
    },
    { immediate: true },
  )

  // アクティブアカウント切替で per-account テーマを反映する。
  // 切替先のアカウントに registry テーマがあれば applyCurrentTheme が
  // accountThemeCache から拾って適用、なければ global にフォールバック。
  watch(
    () => accountsStore.activeAccount?.id,
    () => {
      themeStore.applyCurrentTheme()
    },
  )
}
