import { describe, expect, it } from 'vitest'
import { parseSkillFile, serializeSkillFile } from '@/utils/skillFrontmatter'

describe('parseSkillFile', () => {
  it('extracts flat string/number/boolean/array fields from frontmatter', () => {
    const raw = [
      '---',
      'id: translator',
      'name: 翻訳',
      'version: 0.1.0',
      'mode: manual',
      'triggers: [composing-reply, viewing-thread]',
      'builtIn: true',
      'createdAt: 1700000000000',
      '---',
      'body line 1',
      'body line 2',
    ].join('\n')

    const { meta, body } = parseSkillFile(raw)
    expect(meta.id).toBe('translator')
    expect(meta.name).toBe('翻訳')
    expect(meta.version).toBe('0.1.0')
    expect(meta.mode).toBe('manual')
    expect(meta.triggers).toEqual(['composing-reply', 'viewing-thread'])
    expect(meta.builtIn).toBe(true)
    expect(meta.createdAt).toBe(1700000000000)
    expect(body).toBe('body line 1\nbody line 2')
  })

  it('returns whole content as body when no frontmatter is present', () => {
    const raw = 'no frontmatter here\njust body'
    const { meta, body } = parseSkillFile(raw)
    expect(meta).toEqual({})
    expect(body).toBe(raw)
  })

  it('strips matching surrounding quotes from string values', () => {
    const raw = "---\nname: '日本語: コロン入り'\n---\nbody"
    const { meta } = parseSkillFile(raw)
    expect(meta.name).toBe('日本語: コロン入り')
  })

  it('handles empty string values', () => {
    const raw = '---\nauthor:\nname: x\n---\n'
    const { meta } = parseSkillFile(raw)
    expect(meta.author).toBe('')
    expect(meta.name).toBe('x')
  })
})

describe('serializeSkillFile', () => {
  it('round-trips through parseSkillFile', () => {
    const original = {
      id: 'aizu',
      name: '三須木藍',
      version: '0.1.0',
      mode: 'always',
      triggers: ['a', 'b'],
      builtIn: true,
    }
    const body = '本文です。\n2 行目。'
    const serialized = serializeSkillFile(original, body)
    const { meta, body: parsedBody } = parseSkillFile(serialized)
    expect(meta).toMatchObject(original)
    expect(parsedBody).toBe(body)
  })

  it('quotes values containing colons or commas', () => {
    const out = serializeSkillFile(
      { name: 'has: colon', desc: 'has, comma' },
      '',
    )
    const { meta } = parseSkillFile(out)
    expect(meta.name).toBe('has: colon')
    expect(meta.desc).toBe('has, comma')
  })
})
