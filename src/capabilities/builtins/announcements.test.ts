import { describe, expect, it } from 'vitest'
import {
  ANNOUNCEMENTS_BUILTIN_CAPABILITIES,
  announcementsListCapability,
} from './announcements'

describe('announcements.list capability — declaration', () => {
  it('declares account.read permission, cheap, aiTool', () => {
    expect(announcementsListCapability.id).toBe('announcements.list')
    expect(announcementsListCapability.permissions).toEqual(['account.read'])
    expect(announcementsListCapability.signature?.cheap).toBe(true)
    expect(announcementsListCapability.signature?.returns?.type).toBe('array')
    expect(announcementsListCapability.aiTool).toBe(true)
  })

  it('all params optional (limit / isActive / accountId)', () => {
    const params = announcementsListCapability.signature?.params
    expect(params?.limit?.optional).toBe(true)
    expect(params?.isActive?.optional).toBe(true)
    expect(params?.accountId?.optional).toBe(true)
  })
})

describe('ANNOUNCEMENTS_BUILTIN_CAPABILITIES', () => {
  it('contains list only', () => {
    const ids = ANNOUNCEMENTS_BUILTIN_CAPABILITIES.map((c) => c.id).sort()
    expect(ids).toEqual(['announcements.list'])
  })
})
