import { invoke } from '@tauri-apps/api/core'
import type { TimelineFilter, TimelineType } from '@/adapters/types'

export interface CustomTimelineInfo {
  type: string
  label: string
  icon: string // SVG path
}

// Standard timeline endpoints — excluded from custom detection
const STANDARD_TL_ENDPOINTS = new Set([
  'notes/timeline',
  'notes/local-timeline',
  'notes/hybrid-timeline',
  'notes/global-timeline',
  'notes/user-list-timeline',
])

// Known icons for specific custom timeline types (optional overrides)
export const CUSTOM_TL_ICONS: Record<string, string> = {
  bubble:
    'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12c0 2.1.644 4.052 1.745 5.665L2 22l4.335-1.745A9.956 9.956 0 0012 22z',
  recommended:
    'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  yami: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  hanami:
    'M12 3c-1.5 2-4 4-4 7a4 4 0 008 0c0-3-2.5-5-4-7zm-5 9c-1.2 1.5-3 3-3 5.5a3 3 0 006 0c0-2.5-1.8-4-3-5.5zm10 0c-1.2 1.5-3 3-3 5.5a3 3 0 006 0c0-2.5-1.8-4-3-5.5z',
}

// Generic icon for unknown custom timelines
const GENERIC_TL_ICON =
  'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z'

/**
 * Auto-detect custom timelines by scanning /api/endpoints
 * for notes/*-timeline patterns not in the standard set.
 */
export async function detectCustomTimelines(
  host: string,
): Promise<CustomTimelineInfo[]> {
  try {
    const endpoints = await invoke<string[]>('api_get_endpoints', { host })
    const customs: CustomTimelineInfo[] = []

    for (const ep of endpoints) {
      const match = ep.match(/^notes\/(.+)-timeline$/)
      if (!match || STANDARD_TL_ENDPOINTS.has(ep)) continue
      const type = match[1] as string
      customs.push({
        type,
        label: type.charAt(0).toUpperCase() + type.slice(1),
        icon: CUSTOM_TL_ICONS[type] ?? GENERIC_TL_ICON,
      })
    }

    return customs
  } catch (e) {
    console.warn('[customTimelines] failed to detect:', e)
    return []
  }
}

// --- Timeline availability detection via user policies ---

/** Standard policy key → timeline types it gates */
const POLICY_TIMELINE_MAP: Record<string, TimelineType[]> = {
  ltlAvailable: ['local', 'social'],
  gtlAvailable: ['global'],
}

export interface TimelineAvailability {
  available: TimelineType[]
  denied: Set<string>
  modes: Record<string, boolean> // e.g., { isInYamiMode: true }
}

// Cache: accountId → availability
const availableTlCache = new Map<string, TimelineAvailability>()

/**
 * Detect timeline availability and mode flags from user policies.
 * Scans both known standard policies and fork-specific *TlAvailable patterns.
 * Also extracts isIn*Mode flags for mode toggle detection.
 */
export async function detectAvailableTimelines(
  accountId: string,
): Promise<TimelineAvailability> {
  const cached = availableTlCache.get(accountId)
  if (cached) return cached

  const available: TimelineType[] = ['home']
  const denied = new Set<string>()
  const modes: Record<string, boolean> = {}

  try {
    const data = await invoke<Record<string, boolean>>(
      'api_get_user_policies',
      { accountId },
    )

    // Separate mode flags from policies
    const policies: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('isIn') && key.endsWith('Mode')) {
        modes[key] = value
      } else {
        policies[key] = value
      }
    }

    // Standard TLs
    const handledKeys = new Set(Object.keys(POLICY_TIMELINE_MAP))
    for (const [policyKey, tlTypes] of Object.entries(POLICY_TIMELINE_MAP)) {
      if (policies[policyKey] !== false) {
        available.push(...tlTypes)
      } else {
        for (const t of tlTypes) denied.add(t)
      }
    }

    // Fork-specific: scan *TlAvailable patterns dynamically
    for (const [key, value] of Object.entries(policies)) {
      if (handledKeys.has(key)) continue
      const match = key.match(/^(.+)TlAvailable$/)
      if (!match) continue
      const type = match[1] as string
      if (value !== false) {
        available.push(type)
      } else {
        denied.add(type)
      }
    }
  } catch (e) {
    console.warn('[availableTimelines] failed to detect policies:', e)
    // Fallback: show all standard timelines
    available.push('local', 'social', 'global')
  }

  const result = { available, denied, modes }
  availableTlCache.set(accountId, result)
  return result
}

/** Invalidate the cached availability for an account (e.g., after mode toggle). */
export function clearAvailableTlCache(accountId: string) {
  availableTlCache.delete(accountId)
}

/**
 * Find the mode key (e.g., 'isInYamiMode') for a custom timeline type.
 * Uses heuristic: TL type starts with the mode name extracted from the key.
 * e.g., 'yami' matches 'isInYamiMode', 'hanami' matches 'isInHanaMode'.
 */
export function findModeKeyForTimeline(
  tlType: string,
  modes: Record<string, boolean>,
): string | undefined {
  for (const key of Object.keys(modes)) {
    const match = key.match(/^isIn(.+)Mode$/)
    if (!match) continue
    if (match[1] && tlType.startsWith(match[1].toLowerCase())) return key
  }
  return undefined
}

// --- Filter detection via /api/endpoint ---

/**
 * Canonical filter key → possible API parameter names (including fork aliases).
 * Some forks use inverted names (e.g., excludeBots instead of withBots).
 */
const FILTER_PARAM_ALIASES: Record<keyof TimelineFilter, string[]> = {
  withRenotes: ['withRenotes'],
  withReplies: ['withReplies'],
  withFiles: ['withFiles'],
  withBots: ['withBots', 'excludeBots'],
  withSensitive: ['withSensitive', 'excludeNsfw'],
}

const KNOWN_FILTER_KEYS = Object.keys(
  FILTER_PARAM_ALIASES,
) as (keyof TimelineFilter)[]

// Cache: "host:endpoint" → filter keys
const filterKeyCache = new Map<string, (keyof TimelineFilter)[]>()

function getTimelineEndpoint(type: TimelineType): string {
  switch (type) {
    case 'home':
      return 'notes/timeline'
    case 'local':
      return 'notes/local-timeline'
    case 'social':
      return 'notes/hybrid-timeline'
    case 'global':
      return 'notes/global-timeline'
    default:
      return `notes/${type}-timeline`
  }
}

/**
 * Detect which filter params a timeline endpoint actually supports
 * by probing the /api/endpoint schema.
 */
export async function detectFilterKeys(
  host: string,
  timelineType: TimelineType,
): Promise<(keyof TimelineFilter)[]> {
  const endpoint = getTimelineEndpoint(timelineType)
  const cacheKey = `${host}:${endpoint}`
  const cached = filterKeyCache.get(cacheKey)
  if (cached) return cached

  try {
    const params = await invoke<string[]>('api_get_endpoint_params', {
      host,
      endpoint,
    })
    const keys = KNOWN_FILTER_KEYS.filter((k) =>
      FILTER_PARAM_ALIASES[k].some((alias) => params.includes(alias)),
    )
    filterKeyCache.set(cacheKey, keys)
    return keys
  } catch (e) {
    console.warn('[filterDetection] failed to detect filters:', e)
    return []
  }
}

