import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StreamConnectionState } from '../types'
import { MisskeyStream } from './streaming'

// setStatus is the private funnel that all connection-status transitions go
// through. Driving it directly (with fake timers) verifies the #507 offline
// debounce without mocking the whole Tauri boundary.
type StatusDriver = { setStatus(s: StreamConnectionState): void }
const drive = (s: MisskeyStream, state: StreamConnectionState) =>
  (s as unknown as StatusDriver).setStatus(state)

const GRACE_MS = 5000

describe('MisskeyStream offline debounce (#507)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function makeStream() {
    const stream = new MisskeyStream('acct')
    const counts = { connected: 0, reconnecting: 0, disconnected: 0 }
    stream.on('connected', () => counts.connected++)
    stream.on('reconnecting', () => counts.reconnecting++)
    stream.on('disconnected', () => counts.disconnected++)
    return { stream, counts }
  }

  it('surfaces recovery to connected immediately', () => {
    const { stream, counts } = makeStream()
    drive(stream, 'connected')
    expect(counts.connected).toBe(1)
  })

  it('debounces a live connection drop by the grace window', () => {
    const { stream, counts } = makeStream()
    drive(stream, 'connected')
    drive(stream, 'reconnecting')

    // Nothing offline-facing yet — within the grace window the badge stays put.
    expect(counts.reconnecting).toBe(0)
    vi.advanceTimersByTime(GRACE_MS - 1)
    expect(counts.reconnecting).toBe(0)

    vi.advanceTimersByTime(1)
    expect(counts.reconnecting).toBe(1)
  })

  it('cancels the offline transition if reconnect succeeds within grace', () => {
    const { stream, counts } = makeStream()
    drive(stream, 'connected')
    drive(stream, 'reconnecting')

    vi.advanceTimersByTime(GRACE_MS - 1)
    drive(stream, 'connected') // recovered before grace elapsed
    vi.advanceTimersByTime(GRACE_MS)

    expect(counts.reconnecting).toBe(0)
    expect(counts.disconnected).toBe(0)
    expect(counts.connected).toBe(2)
  })

  it('does not restart the timer on repeated reconnecting (falls offline once)', () => {
    const { stream, counts } = makeStream()
    drive(stream, 'connected')
    drive(stream, 'reconnecting')
    vi.advanceTimersByTime(GRACE_MS - 1)
    drive(stream, 'reconnecting') // repeat must not defer the deadline
    vi.advanceTimersByTime(1)

    expect(counts.reconnecting).toBe(1)
  })

  it('surfaces the initial connection failure immediately (no grace)', () => {
    const { stream, counts } = makeStream()
    // Never connected yet: a drop is the initializing failure, shown at once.
    drive(stream, 'disconnected')
    expect(counts.disconnected).toBe(1)
  })
})
