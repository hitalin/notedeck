import { ref } from 'vue'

export function useSearchFilters() {
  const sinceDate = ref('')
  const untilDate = ref('')
  const ascending = ref(false)
  const showFilters = ref(false)

  function toggleFilters() {
    showFilters.value = !showFilters.value
  }

  function clearDateFilters() {
    sinceDate.value = ''
    untilDate.value = ''
  }

  function toggleSort() {
    ascending.value = !ascending.value
  }

  /** sinceDate as epoch ms (for Misskey API sinceDate param) */
  function getSinceDateMs(): number | undefined {
    return sinceDate.value ? new Date(sinceDate.value).getTime() : undefined
  }

  /** untilDate as epoch ms, end of day (for Misskey API untilDate param) */
  function getUntilDateMs(): number | undefined {
    if (!untilDate.value) return undefined
    const d = new Date(untilDate.value)
    d.setHours(23, 59, 59, 999)
    return d.getTime()
  }

  /** sinceDate as ISO string (for local SQLite cache query) */
  function getSinceDateISO(): string | undefined {
    return sinceDate.value ? new Date(sinceDate.value).toISOString() : undefined
  }

  /** untilDate as ISO string, end of day (for local SQLite cache query) */
  function getUntilDateISO(): string | undefined {
    if (!untilDate.value) return undefined
    const d = new Date(untilDate.value)
    d.setHours(23, 59, 59, 999)
    return d.toISOString()
  }

  /** Has any date filter set */
  function hasDateFilter(): boolean {
    return !!(sinceDate.value || untilDate.value)
  }

  return {
    sinceDate,
    untilDate,
    ascending,
    showFilters,
    toggleFilters,
    clearDateFilters,
    toggleSort,
    getSinceDateMs,
    getUntilDateMs,
    getSinceDateISO,
    getUntilDateISO,
    hasDateFilter,
  }
}
