/**
 * 予約投稿の日時表示ユーティリティ。日本語固定。
 */

const DOW = '日月火水木金土'
const z2 = (n: number) => String(n).padStart(2, '0')
const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0)

/** "今日 14:30" / "明日 09:00" / "12/5(金) 14:30" / "2027/2/3(水) 10:00" */
export function formatScheduleAbsolute(iso: string, now = Date.now()): string {
  const d = new Date(iso)
  const hm = `${z2(d.getHours())}:${z2(d.getMinutes())}`
  const diff = Math.round(
    (startOfDay(d.getTime()) - startOfDay(now)) / 86400000,
  )
  if (diff === 0) return `今日 ${hm}`
  if (diff === 1) return `明日 ${hm}`
  if (diff === -1) return `昨日 ${hm}`
  const y =
    d.getFullYear() === new Date(now).getFullYear() ? '' : `${d.getFullYear()}/`
  return `${y}${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]}) ${hm}`
}

/** "あと30分" / "あと2時間15分" / "期限切れ" / 7日以上先は絶対表示 */
export function formatScheduleRelative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now
  const past = diff < 0
  const prefix = past ? '' : 'あと'
  const suffix = past ? '前' : ''
  const min = Math.floor(Math.abs(diff) / 60000)
  if (min < 1) return past ? '期限切れ' : 'まもなく'
  if (min < 60) return `${prefix}${min}分${suffix}`
  const h = Math.floor(min / 60)
  if (h < 24) {
    const m = min % 60
    return `${prefix}${h}時間${m ? `${m}分` : ''}${suffix}`
  }
  const day = Math.floor(h / 24)
  if (day < 7) return `${prefix}${day}日${suffix}`
  return formatScheduleAbsolute(iso, now)
}

export const isPastSchedule = (iso: string, now = Date.now()) =>
  new Date(iso).getTime() < now

/** 日時ピッカーのプリセット。`at(now)` で実時刻を算出する。 */
export const SCHEDULE_PRESETS: readonly {
  label: string
  at: (now: Date) => Date
}[] = [
  { label: '30分後', at: (n) => new Date(n.getTime() + 30 * 60_000) },
  { label: '1時間後', at: (n) => new Date(n.getTime() + 60 * 60_000) },
  { label: '3時間後', at: (n) => new Date(n.getTime() + 180 * 60_000) },
  {
    label: '明日9:00',
    at: (n) => {
      const d = new Date(n)
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
      return d
    },
  },
  { label: '1週間後', at: (n) => new Date(n.getTime() + 7 * 24 * 60 * 60_000) },
] as const

/** input[type=date] 用 "YYYY-MM-DD"（ローカル時刻） */
export const toLocalDateInput = (d: Date) =>
  `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`

/** input[type=time] 用 "HH:MM"（ローカル時刻） */
export const toLocalTimeInput = (d: Date) =>
  `${z2(d.getHours())}:${z2(d.getMinutes())}`

/** datetime-local input 用の "YYYY-MM-DDTHH:MM"（ローカル時刻） */
export const toLocalDatetimeInput = (d: Date) =>
  `${toLocalDateInput(d)}T${toLocalTimeInput(d)}`
