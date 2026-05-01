import { describe, expect, it } from 'vitest'
import {
  NOTIFICATIONS_BUILTIN_CAPABILITIES,
  notificationsListCapability,
} from './notifications'

describe('notifications.list capability', () => {
  it('declares notifications permission and aiTool: true', () => {
    expect(notificationsListCapability.permissions).toEqual(['notifications'])
    expect(notificationsListCapability.aiTool).toBe(true)
    expect(notificationsListCapability.id).toBe('notifications.list')
    expect(notificationsListCapability.signature?.returns?.type).toBe('array')
  })

  it('marks limit and untilId as optional', () => {
    const params = notificationsListCapability.signature?.params
    expect(params?.limit?.optional).toBe(true)
    expect(params?.untilId?.optional).toBe(true)
  })
})

describe('NOTIFICATIONS_BUILTIN_CAPABILITIES', () => {
  it('contains notifications.list', () => {
    expect(NOTIFICATIONS_BUILTIN_CAPABILITIES).toHaveLength(1)
    expect(NOTIFICATIONS_BUILTIN_CAPABILITIES).toContain(
      notificationsListCapability,
    )
  })
})
