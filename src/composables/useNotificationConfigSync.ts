/**
 * 通知制御設定 (#747) を Rust 側 (SharedNotificationConfig) に同期する。
 * OS 通知の発火は Rust の streaming 常駐処理なので、JS の settings が
 * 変わるたび apply_notification_config で伝播する。App.vue で 1 mount。
 */

import { watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { commands, unwrap } from '@/utils/tauriInvoke'

export function useNotificationConfigSync(): void {
  const settings = useSettingsStore()

  watch(
    () => ({
      osEnabled: settings.get('notifications.osEnabled') !== false,
      dnd: settings.get('notifications.dnd') === true,
    }),
    async (config) => {
      try {
        unwrap(await commands.applyNotificationConfig(config))
      } catch (e) {
        console.warn('[notifications] config apply failed:', e)
      }
    },
    { immediate: true },
  )
}
