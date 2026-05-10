import { describe, expect, it } from 'vitest'
import type { MemoData, StoredMemo, StoredMemos } from '@/composables/useMemos'
import { expandMemoRefs, extractMemoRefs, findBacklinksTo } from './memoLinks'

function makeMemo(
  text: string,
  updatedAt = '2026-05-10T10:00:00Z',
): StoredMemo {
  const data: MemoData = {
    text,
    cw: '',
    showCw: false,
    visibility: 'public',
    localOnly: false,
    fileIds: [],
    pollChoices: [],
    pollMultiple: false,
    showPoll: false,
    scheduledAt: null,
    tags: [],
  }
  return { data, updatedAt }
}

describe('extractMemoRefs', () => {
  it('returns empty array for empty / null input', () => {
    expect(extractMemoRefs('')).toEqual([])
  })

  it('extracts a single memo: link', () => {
    const text = 'see [other](memo:20260510120000) for context'
    expect(extractMemoRefs(text)).toEqual(['20260510120000'])
  })

  it('extracts multiple distinct refs', () => {
    const text =
      '[a](memo:20260101000000) and [b](memo:20260102000000) and [c](memo:20260103000000)'
    expect(extractMemoRefs(text).sort()).toEqual([
      '20260101000000',
      '20260102000000',
      '20260103000000',
    ])
  })

  it('deduplicates same id appearing multiple times', () => {
    const text = '[x](memo:20260510120000) and again [x](memo:20260510120000)'
    expect(extractMemoRefs(text)).toEqual(['20260510120000'])
  })

  it('ignores http(s) link', () => {
    const text = 'plain http link [example](https://example.com)'
    expect(extractMemoRefs(text)).toEqual([])
  })

  it('ignores malformed memo links (non-14-digit id)', () => {
    expect(extractMemoRefs('[short](memo:1234)')).toEqual([])
    expect(extractMemoRefs('[long](memo:202605101200000000)')).toEqual([])
    expect(extractMemoRefs('[alpha](memo:abcdefghijklmn)')).toEqual([])
  })
})

describe('findBacklinksTo', () => {
  it('returns memos that link to target', () => {
    const memos: StoredMemos = {
      '20260101000000': makeMemo(
        'this references [target](memo:20260510120000)',
      ),
      '20260102000000': makeMemo('no link here'),
      '20260103000000': makeMemo('also [t](memo:20260510120000)'),
      '20260510120000': makeMemo('the target itself'),
    }
    const map = new Map([['acc-1', memos]])
    const out = findBacklinksTo('20260510120000', map)
    const keys = out.map((r) => r.memoKey).sort()
    expect(keys).toEqual(['20260101000000', '20260103000000'])
  })

  it('does not include the target memo itself even if it self-references', () => {
    const memos: StoredMemos = {
      '20260510120000': makeMemo('self-loop [me](memo:20260510120000)'),
    }
    const map = new Map([['acc-1', memos]])
    expect(findBacklinksTo('20260510120000', map)).toEqual([])
  })

  it('returns empty when no memos reference target', () => {
    const memos: StoredMemos = {
      '20260101000000': makeMemo('plain text'),
    }
    const map = new Map([['acc-1', memos]])
    expect(findBacklinksTo('20260510120000', map)).toEqual([])
  })
})

describe('expandMemoRefs', () => {
  it('expands one level of refs without exceeding budget', () => {
    const a = makeMemo('[b](memo:20260102000000) and [c](memo:20260103000000)')
    const b = makeMemo('plain b')
    const c = makeMemo('plain c')
    const memos: StoredMemos = {
      '20260101000000': a,
      '20260102000000': b,
      '20260103000000': c,
    }
    const map = new Map([['acc-1', memos]])
    const seed = [{ accountId: 'acc-1', memoKey: '20260101000000', memo: a }]
    const out = expandMemoRefs(seed, map, 5)
    const keys = out.map((r) => r.memoKey).sort()
    expect(keys).toEqual(['20260102000000', '20260103000000'])
  })

  it('skips already-included memos (no duplicate expansion)', () => {
    const a = makeMemo('[b](memo:20260102000000)')
    const b = makeMemo('[a](memo:20260101000000)') // back-edge
    const memos: StoredMemos = {
      '20260101000000': a,
      '20260102000000': b,
    }
    const map = new Map([['acc-1', memos]])
    const seed = [
      { accountId: 'acc-1', memoKey: '20260101000000', memo: a },
      { accountId: 'acc-1', memoKey: '20260102000000', memo: b },
    ]
    expect(expandMemoRefs(seed, map, 5)).toEqual([])
  })

  it('caps results at budget', () => {
    const a = makeMemo(
      '[1](memo:20260101000000) [2](memo:20260102000000) [3](memo:20260103000000)',
    )
    const memos: StoredMemos = {
      '20260101000000': makeMemo('1'),
      '20260102000000': makeMemo('2'),
      '20260103000000': makeMemo('3'),
      '20260200000000': a,
    }
    const map = new Map([['acc-1', memos]])
    const seed = [{ accountId: 'acc-1', memoKey: '20260200000000', memo: a }]
    const out = expandMemoRefs(seed, map, 2)
    expect(out.length).toBe(2)
  })

  it('drops dangling refs (id not present in any account)', () => {
    const a = makeMemo('[ghost](memo:20260999999999)')
    const memos: StoredMemos = { '20260101000000': a }
    const map = new Map([['acc-1', memos]])
    const seed = [{ accountId: 'acc-1', memoKey: '20260101000000', memo: a }]
    expect(expandMemoRefs(seed, map, 5)).toEqual([])
  })
})
