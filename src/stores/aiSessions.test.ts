import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// in-memory 疑似ファイルシステム。settingsFs を差し替えて
// serialize → 書込 → 読込 → deserialize の round-trip を store 越しに検証する。
const files = new Map<string, string>()

vi.mock('@/utils/settingsFs', () => ({
  isTauri: true,
  aiSessionFilename: (id: string) => `${id}.json5`,
  listAiSessionFiles: async () => Array.from(files.keys()),
  readAiSessionFile: async (f: string) => files.get(f) ?? '',
  writeAiSessionFile: async (f: string, content: string) => {
    files.set(f, content)
  },
  deleteAiSessionFile: async (f: string) => {
    files.delete(f)
  },
}))

import JSON5 from 'json5'

import { useAiSessionsStore } from '@/stores/aiSessions'

describe('useAiSessionsStore.addTriggeredSkillIds (#725)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    files.clear()
    setActivePinia(createPinia())
  })

  it('accumulates ids as a union across calls, preserving first-seen order', () => {
    const store = useAiSessionsStore()
    const s = store.createNew({ model: 'm', connectionId: 'c' })
    store.addTriggeredSkillIds(s.id, ['mfm-art'])
    store.addTriggeredSkillIds(s.id, ['translator', 'mfm-art'])
    expect(store.get(s.id)?.triggeredSkillIds).toEqual([
      'mfm-art',
      'translator',
    ])
  })

  it('is undefined for sessions that never triggered a skill', () => {
    const store = useAiSessionsStore()
    const s = store.createNew({ model: 'm', connectionId: 'c' })
    expect(store.get(s.id)?.triggeredSkillIds).toBeUndefined()
  })

  it('no-ops (keeps the same session object) when nothing new is added', () => {
    const store = useAiSessionsStore()
    const s = store.createNew({ model: 'm', connectionId: 'c' })
    store.addTriggeredSkillIds(s.id, ['mfm-art'])
    const before = store.get(s.id)
    store.addTriggeredSkillIds(s.id, [])
    store.addTriggeredSkillIds(s.id, ['mfm-art'])
    expect(store.get(s.id)).toBe(before)
  })

  it('ignores unknown session ids', () => {
    const store = useAiSessionsStore()
    expect(() => store.addTriggeredSkillIds('nope', ['a'])).not.toThrow()
  })
})

describe('useAiSessionsStore triggeredSkillIds persistence (#725)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    files.clear()
    setActivePinia(createPinia())
  })

  it('round-trips triggeredSkillIds through file persistence', async () => {
    const store = useAiSessionsStore()
    const s = store.createNew({ model: 'm', connectionId: 'c' })
    store.addTriggeredSkillIds(s.id, ['mfm-art', 'translator'])
    await store.flush(s.id)

    setActivePinia(createPinia())
    const fresh = useAiSessionsStore()
    await fresh.loadAllMeta()
    expect(fresh.get(s.id)?.triggeredSkillIds).toEqual([
      'mfm-art',
      'translator',
    ])
  })

  it('omits the field from the file when no skill has triggered', async () => {
    const store = useAiSessionsStore()
    const s = store.createNew({ model: 'm', connectionId: 'c' })
    await store.flush(s.id)
    const raw = files.get(`${s.id}.json5`)
    expect(raw).toBeTruthy()
    expect(JSON5.parse(raw as string)).not.toHaveProperty('triggeredSkillIds')
  })

  it('treats legacy files without the field as undefined', async () => {
    files.set(
      'legacy.json5',
      JSON.stringify({
        schemaVersion: 1,
        id: 'legacy',
        kind: 'chat',
        title: 't',
        model: 'm',
        connectionId: 'c',
        createdAt: 1,
        updatedAt: 1,
        messages: [],
      }),
    )
    const store = useAiSessionsStore()
    await store.loadAllMeta()
    expect(store.get('legacy')?.triggeredSkillIds).toBeUndefined()
  })

  it('drops non-string entries when reading a file', async () => {
    files.set(
      'weird.json5',
      JSON.stringify({
        schemaVersion: 1,
        id: 'weird',
        kind: 'chat',
        title: 't',
        model: 'm',
        connectionId: 'c',
        createdAt: 1,
        updatedAt: 1,
        messages: [],
        triggeredSkillIds: ['ok', 42, '', null],
      }),
    )
    const store = useAiSessionsStore()
    await store.loadAllMeta()
    expect(store.get('weird')?.triggeredSkillIds).toEqual(['ok'])
  })
})

describe('中断残骸の読込時浄化 (#770)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    files.clear()
    setActivePinia(createPinia())
  })

  it('空 content の assistant placeholder を読込時に落とす (tool_use 付きは残す)', async () => {
    files.set(
      'residue.json5',
      JSON.stringify({
        schemaVersion: 1,
        id: 'residue',
        kind: 'chat',
        title: 't',
        model: 'm',
        connectionId: 'c',
        createdAt: 1,
        updatedAt: 1,
        messages: [
          { id: 'u1', role: 'user', content: '質問', timestamp: 1 },
          // 中断で残った streaming placeholder — 落とす
          { id: 'a1', role: 'assistant', content: '', timestamp: 2 },
          // tool_use のみで本文空の assistant — 正当なので残す
          {
            id: 'a2',
            role: 'assistant',
            content: '',
            timestamp: 3,
            toolUseId: 'toolu_1',
            toolUseName: 'time.now',
          },
          { id: 'a3', role: 'assistant', content: '回答', timestamp: 4 },
        ],
      }),
    )
    const store = useAiSessionsStore()
    await store.loadAllMeta()
    const messages = store.get('residue')?.messages ?? []
    expect(messages.map((m) => m.id)).toEqual(['u1', 'a2', 'a3'])
    expect(store.get('residue')?.messageCount).toBe(3)
  })
})
