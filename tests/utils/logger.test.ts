import { describe, expect, it, vi } from 'vitest'
import {
  catchIgnore,
  catchLog,
  logError,
  logIgnored,
  logWarn,
} from '@/utils/logger'

describe('logger', () => {
  it('logWarn outputs to console.warn in dev', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logWarn('test-context', new Error('boom'))
    expect(spy).toHaveBeenCalledWith('[test-context]', 'UNKNOWN', 'boom')
    spy.mockRestore()
  })

  it('logError outputs to console.error in dev', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logError('test-context', 'string error')
    expect(spy).toHaveBeenCalledWith(
      '[test-context]',
      'UNKNOWN',
      'string error',
    )
    spy.mockRestore()
  })

  it('logIgnored outputs to console.debug in dev', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    logIgnored('test-context', { code: 'NETWORK', message: 'offline' })
    expect(spy).toHaveBeenCalledWith(
      '[test-context] ignored:',
      'NETWORK',
      'offline',
    )
    spy.mockRestore()
  })

  it('catchLog returns a function that calls logWarn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handler = catchLog('my-op')
    handler(new Error('fail'))
    expect(spy).toHaveBeenCalledWith('[my-op]', 'UNKNOWN', 'fail')
    spy.mockRestore()
  })

  it('catchIgnore returns a function that calls logIgnored', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const handler = catchIgnore('my-op')
    handler('ignored error')
    expect(spy).toHaveBeenCalledWith(
      '[my-op] ignored:',
      'UNKNOWN',
      'ignored error',
    )
    spy.mockRestore()
  })
})
