import { impactFeedback, selectionFeedback } from '@tauri-apps/plugin-haptics'
import { catchIgnore } from '@/utils/logger'

/** 軽いタップ感（リアクション、絵文字ピック、フォロー） */
export function hapticLight(): void {
  impactFeedback('light').catch(catchIgnore('haptics'))
}

/** スイッチ切り替え時の選択フィードバック */
export function hapticSelection(): void {
  selectionFeedback().catch(catchIgnore('haptics'))
}

/** しきい値到達時のやや強めのフィードバック */
export function hapticMedium(): void {
  impactFeedback('medium').catch(catchIgnore('haptics'))
}
