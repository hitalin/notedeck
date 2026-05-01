import { describe, expect, it } from 'vitest'
import { sanitizeToolName } from './identifier'

describe('sanitizeToolName', () => {
  it('replaces dots with underscores', () => {
    expect(sanitizeToolName('time.now')).toBe('time_now')
    expect(sanitizeToolName('notes.post')).toBe('notes_post')
    expect(sanitizeToolName('account.read')).toBe('account_read')
  })

  it('leaves identifiers without dots unchanged', () => {
    expect(sanitizeToolName('simple')).toBe('simple')
    expect(sanitizeToolName('with-dash')).toBe('with-dash')
    expect(sanitizeToolName('with_underscore')).toBe('with_underscore')
  })

  it('produces a string matching ^[a-zA-Z0-9_-]+$ for typical capability ids', () => {
    const ids = ['time.now', 'notes.post', 'notes.write', 'network.external']
    const re = /^[a-zA-Z0-9_-]+$/
    for (const id of ids) {
      expect(sanitizeToolName(id)).toMatch(re)
    }
  })

  it('replaces every dot occurrence (multi-segment ids)', () => {
    expect(sanitizeToolName('a.b.c')).toBe('a_b_c')
  })
})
