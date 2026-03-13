import { describe, expect, it } from 'vitest'
import { detectPlatformFromUserAgent } from '@/stores/ui'

describe('ui platform detection', () => {
  it('detects android from user agent', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36'
    expect(detectPlatformFromUserAgent(ua)).toBe('android')
  })

  it('detects ios from user agent', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
    expect(detectPlatformFromUserAgent(ua)).toBe('ios')
  })

  it('returns null for unknown user agent', () => {
    expect(detectPlatformFromUserAgent('SomeCustomAgent/1.0')).toBeNull()
  })
})
