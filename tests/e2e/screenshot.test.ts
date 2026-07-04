/**
 * E2E: 視覚スモーク (#702) — misskey.io のゲストアカウント + ローカル TL
 * カラム 1 個を表示した状態でスクリーンショットを 1 枚保存する。
 * 空デッキだと単色になり検証にならないため、実コンテンツを映す。
 *
 * レンダリング崩れの検出は人間の目 (CI アーティファクト) に委ね、テストは
 * 「複数色が描画された PNG が生成される」ことだけを保証する。
 *
 * ImageMagick (`import` / `identify`) が必要なため NOTEDECK_E2E_SCREENSHOT=1
 * のときのみ実行する (CI の xvfb-run 環境で有効化)。misskey.io への実接続を
 * 含む点に注意 (ゲスト = 無認証の公開 TL のみ)。
 */
import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type E2eApp, isAttachMode, launchApp, waitFor } from './harness'

const enabled = process.env.NOTEDECK_E2E_SCREENSHOT === '1' && !isAttachMode

const run = promisify(execFile)
const GUEST_ID = 'e2e-guest-00000000-0000-0000-0000-000000000001'

let app: E2eApp

beforeAll(async () => {
  if (!enabled) return
  app = await launchApp({
    // create_guest_account と同じ形 (token 空 + __guest__) を seed する
    seedAccount: {
      id: GUEST_ID,
      host: 'misskey.io',
      token: '',
      userId: '__guest__',
      username: 'guest_e2e',
    },
    // スクリーンショットは DISPLAY (Xvfb) 上に描画されている必要がある。
    // WAYLAND_DISPLAY が残っている環境 (WSLg 等) では GTK が Wayland 側へ
    // 描画してしまい root window が単色になるため X11 を強制する
    env: {
      GDK_BACKEND: 'x11',
      WEBKIT_DISABLE_COMPOSITING_MODE: '1',
    },
  })
})

afterAll(async () => {
  await app?.stop()
})

describe.skipIf(!enabled)('視覚スモーク', () => {
  it('ゲスト TL を表示した画面のスクリーンショットが保存できる', async () => {
    // ローカル TL カラムを追加 (ゲスト = 無認証で公開 TL を閲覧)。
    // 名前・幅は指定せず通常の UI 操作と同じデフォルトにする
    const created = await app.post('/api/capabilities/column.add/execute', {
      type: 'timeline',
      tl: 'local',
      accountId: GUEST_ID,
    })
    expect(created.status).toBe(200)
    expect((await created.json()).ok).toBe(true)

    // カラム反映を確認してから、ノートの取得・描画が落ち着くまで待つ。
    // ゲストはストリーミングでなくポーリングに落ちる場合があるため、
    // 接続状態ではなく描画結果 (unique colors) で判定する
    await waitFor(
      async () => {
        const columns = await (await app.get('/api/deck/columns')).json()
        return (
          Array.isArray(columns) &&
          columns.some((c: { type: string }) => c.type === 'timeline')
        )
      },
      'timeline column visible in deck state',
      30_000,
      1000,
    )
    await new Promise((r) => setTimeout(r, 20_000))

    const outDir = path.resolve('e2e-artifacts')
    await mkdir(outDir, { recursive: true })
    const outFile = path.join(outDir, 'screenshot.png')
    await run('import', ['-window', 'root', outFile])

    // 空デッキ/未描画は単色 (unique colors = 1) になる。実コンテンツが
    // 描画されていれば色数は大きくなる
    const { stdout } = await run('identify', ['-format', '%k', outFile])
    const uniqueColors = Number(stdout.trim())
    expect(uniqueColors).toBeGreaterThan(100)
  }, 150_000)
})
