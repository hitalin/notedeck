import { describe, expect, it } from 'vitest'
import { parseTasks, TasksParseError } from '../schema'

describe('parseTasks', () => {
  it('empty content yields empty task list', () => {
    expect(parseTasks('')).toEqual({ version: 1, tasks: [] })
    expect(parseTasks('   \n')).toEqual({ version: 1, tasks: [] })
  })

  it('accepts a minimal api task', () => {
    const src = `{
      version: 1,
      tasks: [{
        id: 'post',
        label: '投稿',
        action: { type: 'api', method: 'notes/create' },
      }],
    }`
    const parsed = parseTasks(src)
    expect(parsed.tasks).toHaveLength(1)
    expect(parsed.tasks[0]?.id).toBe('post')
    expect(parsed.tasks[0]?.action).toEqual({
      type: 'api',
      method: 'notes/create',
    })
  })

  it('parses text and pick inputs with defaults', () => {
    const src = `{
      version: 1,
      tasks: [{
        id: 'p', label: 'p',
        inputs: [
          { id: 'body', type: 'text', prompt: '本文', default: 'hello' },
          { id: 'vis', type: 'pick', prompt: '公開範囲',
            options: ['public', 'home'], default: 'home' },
        ],
        action: { type: 'api', method: 'notes/create', params: { text: '\${input:body}' } },
      }],
    }`
    const parsed = parseTasks(src)
    const inputs = parsed.tasks[0]?.inputs
    expect(inputs?.[0]).toMatchObject({ type: 'text', default: 'hello' })
    expect(inputs?.[1]).toMatchObject({
      type: 'pick',
      options: ['public', 'home'],
      default: 'home',
    })
  })

  it('rejects missing version', () => {
    expect(() => parseTasks('{ tasks: [] }')).toThrow(TasksParseError)
  })

  it('rejects non-api action type', () => {
    const src = `{
      version: 1,
      tasks: [{
        id: 't', label: 't',
        action: { type: 'shell', command: 'ls' },
      }],
    }`
    expect(() => parseTasks(src)).toThrow(/only 'api' is supported/)
  })

  it('rejects duplicate task ids', () => {
    const src = `{
      version: 1,
      tasks: [
        { id: 'x', label: 'x', action: { type: 'api', method: 'a' } },
        { id: 'x', label: 'y', action: { type: 'api', method: 'b' } },
      ],
    }`
    expect(() => parseTasks(src)).toThrow(/duplicate task id/)
  })

  it('rejects invalid id characters', () => {
    const src = `{
      version: 1,
      tasks: [{ id: 'bad id!', label: 'x', action: { type: 'api', method: 'a' } }],
    }`
    expect(() => parseTasks(src)).toThrow(/tasks\[0\]\.id/)
  })

  it('reports JSON5 parse errors with context', () => {
    expect(() => parseTasks('{ tasks: ')).toThrow(/JSON5 parse error/)
  })
})
