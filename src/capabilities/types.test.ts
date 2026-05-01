import { describe, expect, it } from 'vitest'
import type {
  CapabilitySignature,
  ParameterDef,
  PermissionKey,
  ReturnTypeDef,
} from './types'

describe('CapabilitySignature shape', () => {
  it('builds a minimal signature (description only)', () => {
    const sig: CapabilitySignature = {
      description: 'Get the current time',
    }
    expect(sig.description).toBe('Get the current time')
    expect(sig.params).toBeUndefined()
    expect(sig.returns).toBeUndefined()
  })

  it('builds a full signature with params and returns', () => {
    const sig: CapabilitySignature = {
      description: 'Post a note to the current account',
      params: {
        text: {
          type: 'string',
          description: 'Note body text',
        },
        visibility: {
          type: 'string',
          description: 'Visibility level',
          enum: ['public', 'home', 'followers', 'specified'],
          optional: true,
        },
      },
      returns: {
        type: 'object',
        description: 'The created note object',
      },
    }
    expect(sig.params?.text?.type).toBe('string')
    expect(sig.params?.visibility?.enum).toContain('public')
    expect(sig.params?.visibility?.optional).toBe(true)
    expect(sig.returns?.type).toBe('object')
  })
})

describe('ParameterDef shape', () => {
  it('required parameter has no optional flag', () => {
    const p: ParameterDef = { type: 'string', description: 'required' }
    expect(p.optional).toBeUndefined()
  })

  it('optional parameter sets optional: true', () => {
    const p: ParameterDef = {
      type: 'string',
      description: 'optional',
      optional: true,
    }
    expect(p.optional).toBe(true)
  })

  it('accepts all primitive type values', () => {
    const types: ParameterDef['type'][] = [
      'string',
      'number',
      'boolean',
      'object',
      'array',
    ]
    for (const t of types) {
      const p: ParameterDef = { type: t, description: t }
      expect(p.type).toBe(t)
    }
  })
})

describe('ReturnTypeDef shape', () => {
  it('void return is valid for action capabilities', () => {
    const ret: ReturnTypeDef = { type: 'void' }
    expect(ret.type).toBe('void')
    expect(ret.description).toBeUndefined()
  })

  it('object return can carry a description', () => {
    const ret: ReturnTypeDef = { type: 'object', description: 'a note' }
    expect(ret.description).toBe('a note')
  })
})

describe('PermissionKey re-export', () => {
  it('is the same union as in useAiConfig', () => {
    // 型レベルだけだが、代入できることを実行時にも確認する。
    const key: PermissionKey = 'notes.read'
    expect(key).toBe('notes.read')
  })
})
