import { describe, expect, it } from 'vitest'
import {
  THEME_BUILTIN_CAPABILITIES,
  themeApplyCapability,
  themeListCapability,
} from './theme'

// Note: theme.apply の execute は最終的に applyCurrentTheme → window.matchMedia
// に到達するため unit 環境では走らない。capability 定義の正しさだけ検証する。
// 実 execute 挙動は dom テストか実機で確認。

describe('theme.list capability', () => {
  it('declares no permissions and aiTool: true', () => {
    expect(themeListCapability.permissions).toEqual([])
    expect(themeListCapability.aiTool).toBe(true)
    expect(themeListCapability.signature?.returns?.type).toBe('array')
    expect(themeListCapability.id).toBe('theme.list')
  })
})

describe('theme.apply capability', () => {
  it('declares no permissions and aiTool: true', () => {
    expect(themeApplyCapability.permissions).toEqual([])
    expect(themeApplyCapability.aiTool).toBe(true)
    expect(themeApplyCapability.id).toBe('theme.apply')
  })

  it('throws when id is missing', () => {
    expect(() => themeApplyCapability.execute({})).toThrow(/id is required/)
  })

  it('declares mode enum (dark / light)', () => {
    const modeEnum = themeApplyCapability.signature?.params?.mode?.enum
    expect(modeEnum).toEqual(['dark', 'light'])
    expect(themeApplyCapability.signature?.params?.mode?.optional).toBe(true)
    expect(themeApplyCapability.signature?.params?.id?.optional).not.toBe(true)
  })
})

describe('THEME_BUILTIN_CAPABILITIES', () => {
  it('contains list and apply', () => {
    expect(THEME_BUILTIN_CAPABILITIES).toContain(themeListCapability)
    expect(THEME_BUILTIN_CAPABILITIES).toContain(themeApplyCapability)
  })
})
