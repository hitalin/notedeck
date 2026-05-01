import { describe, expect, it } from 'vitest'
import { DRIVE_BUILTIN_CAPABILITIES, driveListCapability } from './drive'

describe('drive.list capability', () => {
  it('declares drive.read permission and aiTool: true', () => {
    expect(driveListCapability.permissions).toEqual(['drive.read'])
    expect(driveListCapability.aiTool).toBe(true)
    expect(driveListCapability.id).toBe('drive.list')
    expect(driveListCapability.signature?.returns?.type).toBe('array')
  })

  it('marks all params as optional (no required)', () => {
    const params = driveListCapability.signature?.params
    expect(params?.folderId?.optional).toBe(true)
    expect(params?.limit?.optional).toBe(true)
    expect(params?.fileType?.optional).toBe(true)
  })
})

describe('DRIVE_BUILTIN_CAPABILITIES', () => {
  it('contains drive.list', () => {
    expect(DRIVE_BUILTIN_CAPABILITIES).toHaveLength(1)
    expect(DRIVE_BUILTIN_CAPABILITIES).toContain(driveListCapability)
  })
})
