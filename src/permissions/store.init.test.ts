// permissions.json5 の初回読込 (async) と起動直後の判定のレース (#716)。
// autoRun ウィジェットが読込完了前に dispatch へ到達すると、confirmSkips が
// 空のデフォルト値で判定されて「今後確認しない」の記憶が効かない。
// settingsFs をモックして読込を保留し、whenPermissionsReady の待機を検証する。
import { describe, expect, it, vi } from 'vitest'

let resolveRead: ((content: string) => void) | undefined

vi.mock('@/utils/settingsFs', () => ({
  isTauri: true,
  readPermissionsSettings: () =>
    new Promise<string>((resolve) => {
      resolveRead = resolve
    }),
  readAiSettings: () => Promise.resolve(''),
  writeAiSettings: () => Promise.resolve(),
  writePermissionsSettings: () => Promise.resolve(),
}))

vi.mock('@/utils/tauriInvoke', () => ({
  commands: {
    permissionsSync: () => Promise.resolve({ status: 'ok', data: null }),
  },
  unwrap: (r: unknown) => r,
}))

describe('whenPermissionsReady (#716)', () => {
  it('読込完了前は解決せず、完了後に confirmSkips が反映される', async () => {
    const { whenPermissionsReady, isConfirmSkipped } = await import('./store')

    let ready = false
    const p = whenPermissionsReady().then(() => {
      ready = true
    })

    // 読込が保留されている間は resolve されない
    await Promise.resolve()
    await Promise.resolve()
    expect(ready).toBe(false)
    // この時点で判定するとデフォルト値 (confirmSkips 空) — これがバグの再現
    expect(isConfirmSkipped('plugin:widget:w1', 'http.fetch')).toBe(false)

    resolveRead?.(
      JSON.stringify({
        confirmSkips: { 'plugin:widget:w1': ['http.fetch'] },
      }),
    )
    await p
    expect(ready).toBe(true)
    expect(isConfirmSkipped('plugin:widget:w1', 'http.fetch')).toBe(true)
  })
})
