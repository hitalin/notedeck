import { impactFeedback, selectionFeedback } from '@tauri-apps/plugin-haptics'

/** 軽いタップ感（リアクション、絵文字ピック、フォロー） */
export function hapticLight(): void {
  impactFeedback('light').catch(() => {})
}

/** スイッチ切り替え時の選択フィードバック */
export function hapticSelection(): void {
  selectionFeedback().catch(() => {})
}

/** しきい値到達時のやや強めのフィードバック */
export function hapticMedium(): void {
  impactFeedback('medium').catch(() => {})
}
