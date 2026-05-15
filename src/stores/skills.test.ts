import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/settingsFs', () => ({
  isTauri: false,
}))

import type { SkillMeta } from '@/stores/skills'
import { useSkillsStore } from '@/stores/skills'

function makeSkill(
  partial: Partial<SkillMeta> & Pick<SkillMeta, 'id'>,
): Omit<SkillMeta, 'createdAt' | 'updatedAt'> {
  return {
    name: partial.name ?? partial.id,
    version: '1.0.0',
    mode: 'trigger',
    triggers: [],
    scope: 'global',
    body: 'body',
    cheapCheckCapabilities: [],
    ...partial,
  }
}

describe('useSkillsStore.triggerMatchingSkillIds', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns ids whose triggers substring-match the input (mode=trigger)', () => {
    const store = useSkillsStore()
    store.add(makeSkill({ id: 'guide', triggers: ['どこ', '使い方'] }))
    expect(store.triggerMatchingSkillIds('投稿はどこ?')).toEqual(['guide'])
    expect(store.triggerMatchingSkillIds('使い方を教えて')).toEqual(['guide'])
  })

  it('returns empty array when no trigger matches', () => {
    const store = useSkillsStore()
    store.add(makeSkill({ id: 'guide', triggers: ['どこ', 'help'] }))
    expect(store.triggerMatchingSkillIds('今日の天気は')).toEqual([])
  })

  it('ignores skills whose mode is not "trigger"', () => {
    const store = useSkillsStore()
    store.add(
      makeSkill({ id: 'manual-skill', mode: 'manual', triggers: ['どこ'] }),
    )
    store.add(
      makeSkill({ id: 'always-skill', mode: 'always', triggers: ['どこ'] }),
    )
    store.add(
      makeSkill({
        id: 'heartbeat-skill',
        mode: 'heartbeat',
        triggers: ['どこ'],
      }),
    )
    expect(store.triggerMatchingSkillIds('どこ?')).toEqual([])
  })

  it('matches case-insensitively (e.g. Help / HELP / help)', () => {
    const store = useSkillsStore()
    store.add(makeSkill({ id: 'guide', triggers: ['Help'] }))
    expect(store.triggerMatchingSkillIds('HELP me')).toEqual(['guide'])
    expect(store.triggerMatchingSkillIds('please help')).toEqual(['guide'])
  })

  it('returns all matching ids when multiple skills hit', () => {
    const store = useSkillsStore()
    store.add(makeSkill({ id: 'guide', triggers: ['どこ'] }))
    store.add(makeSkill({ id: 'tour', triggers: ['使い方'] }))
    expect(store.triggerMatchingSkillIds('どこで使い方を見る?')).toEqual([
      'guide',
      'tour',
    ])
  })

  it('returns empty array for empty / whitespace input', () => {
    const store = useSkillsStore()
    store.add(makeSkill({ id: 'guide', triggers: ['どこ'] }))
    expect(store.triggerMatchingSkillIds('')).toEqual([])
  })

  it('skips trigger skills with empty triggers[]', () => {
    const store = useSkillsStore()
    store.add(makeSkill({ id: 'guide', triggers: [] }))
    expect(store.triggerMatchingSkillIds('どこ?')).toEqual([])
  })

  it('skips empty-string entries inside triggers[]', () => {
    const store = useSkillsStore()
    store.add(makeSkill({ id: 'guide', triggers: ['', 'どこ'] }))
    expect(store.triggerMatchingSkillIds('xyz')).toEqual([])
    expect(store.triggerMatchingSkillIds('どこ?')).toEqual(['guide'])
  })
})
