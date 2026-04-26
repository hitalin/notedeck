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
      // ゲスト/トークン失効アカウントは認証必須エンドポイント (i/registry/get-all 等) を
      // 呼べないので skip。呼ぶと毎回 AUTH エラーでログを汚す上、結果も得られない。
      const authed = accounts.filter((acc) => acc.hasToken)
      Promise.all(
        authed.map((acc) => themeStore.fetchAccountTheme(acc.id)),
      ).catch(catchLog('theme-fetch'))
    },
    { immediate: true },
  )
}
