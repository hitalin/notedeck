import { describe, expect, it } from 'vitest'
import { GALLERY_BUILTIN_CAPABILITIES, galleryListCapability } from './gallery'

describe('gallery.list capability', () => {
  it('declares account.read, cheap, aiTool, all params optional', () => {
    expect(galleryListCapability.id).toBe('gallery.list')
    expect(galleryListCapability.permissions).toEqual(['account.read'])
    expect(galleryListCapability.signature?.cheap).toBe(true)
    expect(galleryListCapability.signature?.returns?.type).toBe('array')
    expect(galleryListCapability.aiTool).toBe(true)
    const params = galleryListCapability.signature?.params
    expect(params?.limit?.optional).toBe(true)
    expect(params?.untilId?.optional).toBe(true)
    expect(params?.accountId?.optional).toBe(true)
  })
})

describe('GALLERY_BUILTIN_CAPABILITIES', () => {
  it('contains list only', () => {
    const ids = GALLERY_BUILTIN_CAPABILITIES.map((c) => c.id).sort()
    expect(ids).toEqual(['gallery.list'])
  })
})
