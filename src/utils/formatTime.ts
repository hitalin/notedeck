// Cache keyed on "iso:currentMinute" to avoid repeated Date allocations
const timeCache = new Map<string, string>()
let lastMinute = -1

export function formatTime(iso: string): string {
  const nowMs = Date.now()
  const currentMinute = Math.floor(nowMs / 60000)

  // Invalidate cache every minute
  if (currentMinute !== lastMinute) {
    timeCache.clear()
    lastMinute = currentMinute
  }

  const cached = timeCache.get(iso)
  if (cached) return cached

  const diff = nowMs - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)

  let result: string
  if (minutes < 1) result = 'now'
  else if (minutes < 60) result = `${minutes}m`
  else {
    const hours = Math.floor(minutes / 60)
    if (hours < 24) result = `${hours}h`
    else result = `${Math.floor(hours / 24)}d`
  }

  timeCache.set(iso, result)
  return result
}
