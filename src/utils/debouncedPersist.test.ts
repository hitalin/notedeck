import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDebouncedPersist,
  createKeyedDebouncedPersist,
} from './debouncedPersist'

describe('createDebouncedPersist', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedule は delayMs 後に 1 回だけ persist を呼ぶ (debounce)', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const { schedule } = createDebouncedPersist(persist, { delayMs: 100 })

    schedule()
    schedule()
    schedule()
    expect(persist).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('persist の失敗は onError に渡される (schedule 経路)', async () => {
    const cause = new Error('disk full')
    const persist = vi.fn().mockRejectedValue(cause)
    const onError = vi.fn()
    const { schedule } = createDebouncedPersist(persist, {
      delayMs: 100,
      onError,
    })

    schedule()
    await vi.advanceTimersByTimeAsync(100)
    expect(onError).toHaveBeenCalledWith(cause)
  })

  it('flush はペンディングがあれば即時 persist し、なければ no-op', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const { schedule, flush } = createDebouncedPersist(persist, {
      delayMs: 100,
    })

    await flush()
    expect(persist).not.toHaveBeenCalled()

    schedule()
    await flush()
    expect(persist).toHaveBeenCalledTimes(1)

    // flush 済みなのでタイマーは発火しない
    await vi.advanceTimersByTimeAsync(200)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('flush は persist の失敗を呼び出し元へ伝播する', async () => {
    const persist = vi.fn().mockRejectedValue(new Error('boom'))
    const { schedule, flush } = createDebouncedPersist(persist, {
      delayMs: 100,
    })

    schedule()
    await expect(flush()).rejects.toThrow('boom')
  })

  it('cancel はペンディングを破棄する', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const { schedule, cancel } = createDebouncedPersist(persist, {
      delayMs: 100,
    })

    schedule()
    cancel()
    await vi.advanceTimersByTimeAsync(200)
    expect(persist).not.toHaveBeenCalled()
  })
})

describe('createKeyedDebouncedPersist', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('key ごとに独立して debounce する', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const { schedule } = createKeyedDebouncedPersist<string>(persist, {
      delayMs: 100,
    })

    schedule('a')
    schedule('a')
    schedule('b')
    expect(persist).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist).toHaveBeenCalledWith('a')
    expect(persist).toHaveBeenCalledWith('b')
  })

  it('同 key の再 schedule はタイマーをリセットする', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const { schedule } = createKeyedDebouncedPersist<string>(persist, {
      delayMs: 100,
    })

    schedule('a')
    await vi.advanceTimersByTimeAsync(60)
    schedule('a')
    await vi.advanceTimersByTimeAsync(60)
    expect(persist).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(40)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('persist の失敗は key 付きで onError に渡される', async () => {
    const cause = new Error('disk full')
    const persist = vi.fn().mockRejectedValue(cause)
    const onError = vi.fn()
    const { schedule } = createKeyedDebouncedPersist<string>(persist, {
      delayMs: 100,
      onError,
    })

    schedule('a')
    await vi.advanceTimersByTimeAsync(100)
    expect(onError).toHaveBeenCalledWith('a', cause)
  })

  it('flush はペンディングのある key だけ即時 persist する', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const { schedule, flush } = createKeyedDebouncedPersist<string>(persist, {
      delayMs: 100,
    })

    await flush('a')
    expect(persist).not.toHaveBeenCalled()

    schedule('a')
    schedule('b')
    await flush('a')
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith('a')

    // b のタイマーは生きている
    await vi.advanceTimersByTimeAsync(100)
    expect(persist).toHaveBeenCalledTimes(2)
    expect(persist).toHaveBeenCalledWith('b')
  })

  it('cancel は指定 key のペンディングのみ破棄する', async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const { schedule, cancel } = createKeyedDebouncedPersist<string>(persist, {
      delayMs: 100,
    })

    schedule('a')
    schedule('b')
    cancel('a')
    await vi.advanceTimersByTimeAsync(200)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist).toHaveBeenCalledWith('b')
  })
})
