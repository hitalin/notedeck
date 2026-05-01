import { describe, expect, it } from 'vitest'
import { USER_BUILTIN_CAPABILITIES, userLookupCapability } from './user'

describe('user.lookup capability', () => {
  it('declares account.read permission and aiTool: true', () => {
    expect(userLookupCapability.permissions).toEqual(['account.read'])
    expect(userLookupCapability.aiTool).toBe(true)
    expect(userLookupCapability.id).toBe('user.lookup')
    expect(userLookupCapability.signature?.returns?.type).toBe('object')
  })

  it('marks username as required and host as optional', () => {
    const params = userLookupCapability.signature?.params
    expect(params?.username?.optional).not.toBe(true)
    expect(params?.host?.optional).toBe(true)
  })

  it('throws when username is missing or blank', async () => {
    await expect(userLookupCapability.execute({})).rejects.toThrow(
      /username is required/,
    )
    await expect(
      userLookupCapability.execute({ username: '   ' }),
    ).rejects.toThrow(/username is required/)
  })
})

describe('USER_BUILTIN_CAPABILITIES', () => {
  it('contains user.lookup', () => {
    expect(USER_BUILTIN_CAPABILITIES).toHaveLength(1)
    expect(USER_BUILTIN_CAPABILITIES).toContain(userLookupCapability)
  })
})
