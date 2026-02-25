import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatTime } from '@/utils/formatTime'

describe('formatTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "now" for less than 1 minute ago', () => {
    expect(formatTime('2025-06-15T11:59:30Z')).toBe('now')
  })

  it('returns minutes for less than 1 hour', () => {
    expect(formatTime('2025-06-15T11:45:00Z')).toBe('15m')
  })

  it('returns hours for less than 1 day', () => {
    expect(formatTime('2025-06-15T09:00:00Z')).toBe('3h')
  })

  it('returns days for 1+ days', () => {
    expect(formatTime('2025-06-13T12:00:00Z')).toBe('2d')
  })

  it('returns "1m" at exactly 1 minute', () => {
    expect(formatTime('2025-06-15T11:59:00Z')).toBe('1m')
  })

  it('returns "1h" at exactly 60 minutes', () => {
    expect(formatTime('2025-06-15T11:00:00Z')).toBe('1h')
  })

  it('returns "1d" at exactly 24 hours', () => {
    expect(formatTime('2025-06-14T12:00:00Z')).toBe('1d')
  })
})
