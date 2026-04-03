import { computed } from 'vue'
import { useUnreadChat } from '@/composables/useUnreadChat'
import { useUnreadNotifications } from '@/composables/useUnreadNotifications'
import type { ColumnType } from '@/stores/deck'

/**
 * カラム type ごとの注意バッジカウントを提供する。
 * ナビバー・ボトムバー・モバイルナビで共通利用。
 *
 * 新しいカラム type のバッジを追加するには、
 * 対応する useUnread* composable を追加し badges に登録するだけ。
 */
export function useColumnBadge() {
  const { totalUnread: notificationUnread, markAllAsRead } =
    useUnreadNotifications()
  const { totalUnread: chatUnread, resetAll: resetChatUnread } = useUnreadChat()

  const badges = computed<Partial<Record<ColumnType, number>>>(() => ({
    notifications: notificationUnread.value,
    chat: chatUnread.value,
  }))

  function getBadge(type: ColumnType): number {
    return badges.value[type] ?? 0
  }

  /** バッジタップ時のクリアアクション（type に応じて既読化など） */
  function clearBadge(type: ColumnType) {
    switch (type) {
      case 'notifications':
        markAllAsRead()
        break
      case 'chat':
        resetChatUnread()
        break
    }
  }

  return { badges, getBadge, clearBadge }
}
