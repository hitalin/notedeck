import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useFrameScheduler } from './useFrameScheduler'

describe('useFrameScheduler', () => {
  it('high が normal より先に実行される', async () => {
    const order: string[] = []
    const scope = effectScope()

    scope.run(() => {
      const { schedule } = useFrameScheduler()
      schedule(() => order.push('normal'), 'normal')
      schedule(() => order.push('high'), 'high')
    })

    await new Promise((r) => requestAnimationFrame(r))
    expect(order).toEqual(['high', 'normal'])
    scope.stop()
  })

  it('同一フレームで複数の high タスクが順番通りに実行される', async () => {
    const order: string[] = []
    const scope = effectScope()

    scope.run(() => {
      const { schedule } = useFrameScheduler()
      schedule(() => order.push('h1'), 'high')
      schedule(() => order.push('h2'), 'high')
      schedule(() => order.push('n1'), 'normal')
    })

    await new Promise((r) => requestAnimationFrame(r))
    expect(order).toEqual(['h1', 'h2', 'n1'])
    scope.stop()
  })

  it('cancel でキューから除去される', async () => {
    const order: string[] = []
    const scope = effectScope()

    scope.run(() => {
      const { schedule, cancel } = useFrameScheduler()
      const fn = () => order.push('cancelled')
      schedule(fn, 'high')
      schedule(() => order.push('kept'), 'normal')
      cancel(fn)
    })

    await new Promise((r) => requestAnimationFrame(r))
    expect(order).toEqual(['kept'])
    scope.stop()
  })

  it('idle タスクが実行される', async () => {
    const fn = vi.fn()
    const scope = effectScope()

    scope.run(() => {
      const { schedule } = useFrameScheduler()
      schedule(fn, 'idle')
    })

    // idle は setTimeout fallback (2000ms) を使うので、タイマーを進める
    await vi.waitFor(() => expect(fn).toHaveBeenCalled(), { timeout: 3000 })
    scope.stop()
  })

  it('scope dispose で全タスクがキャンセルされる', async () => {
    const fn = vi.fn()
    const scope = effectScope()

    scope.run(() => {
      const { schedule } = useFrameScheduler()
      schedule(fn, 'high')
      schedule(fn, 'normal')
    })

    scope.stop() // dispose triggers

    await new Promise((r) => requestAnimationFrame(r))
    expect(fn).not.toHaveBeenCalled()
  })

  it('デフォルト priority は normal', async () => {
    const order: string[] = []
    const scope = effectScope()

    scope.run(() => {
      const { schedule } = useFrameScheduler()
      schedule(() => order.push('high'), 'high')
      schedule(() => order.push('default'))
    })

    await new Promise((r) => requestAnimationFrame(r))
    expect(order).toEqual(['high', 'default'])
    scope.stop()
  })
})
