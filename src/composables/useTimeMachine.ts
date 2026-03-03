import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import type { NormalizedNote } from '@/adapters/types'

export function useTimeMachine(
  getAccountId: () => string | undefined,
  getTimelineType: () => string,
) {
  const isActive = ref(false)
  const targetDate = ref<string | null>(null)
  const dateRange = ref<{ min: string; max: string } | null>(null)

  async function loadDateRange() {
    const accountId = getAccountId()
    const tlType = getTimelineType()
    if (!accountId) return
    try {
      const result = await invoke<[string, string] | null>(
        'api_get_cache_date_range',
        { accountId, timelineType: tlType },
      )
      if (result) {
        dateRange.value = { min: result[0], max: result[1] }
      }
    } catch {
      /* non-critical */
    }
  }

  async function jumpToDate(date: string): Promise<NormalizedNote[]> {
    const accountId = getAccountId()
    const tlType = getTimelineType()
    if (!accountId) return []

    const before = `${date}T23:59:59.999Z`
    targetDate.value = date
    isActive.value = true

    return invoke<NormalizedNote[]>('api_get_cached_timeline_before', {
      accountId,
      timelineType: tlType,
      before,
      limit: 40,
    })
  }

  async function loadMoreBefore(beforeDate: string): Promise<NormalizedNote[]> {
    const accountId = getAccountId()
    const tlType = getTimelineType()
    if (!accountId) return []

    return invoke<NormalizedNote[]>('api_get_cached_timeline_before', {
      accountId,
      timelineType: tlType,
      before: beforeDate,
      limit: 40,
    })
  }

  function deactivate() {
    isActive.value = false
    targetDate.value = null
  }

  return {
    isActive,
    targetDate,
    dateRange,
    loadDateRange,
    jumpToDate,
    loadMoreBefore,
    deactivate,
  }
}
