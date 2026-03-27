/**
 * Adaptive Quality — デバイス性能に応じたパフォーマンスプリセット推奨。
 *
 * ゲームエンジンの「自動画質調整」を Web に適用。
 * 検出結果は推奨のみ — 自動適用はしない（ユーザーが設定 UI で確認）。
 */
export type QualityPreset = 'low' | 'balanced' | 'high'

interface DeviceSignals {
  cores: number
  memoryGB: number | undefined
  prefersReducedMotion: boolean
}

function readDeviceSignals(): DeviceSignals {
  return {
    cores: navigator.hardwareConcurrency ?? 2,
    memoryGB: (navigator as { deviceMemory?: number }).deviceMemory,
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches,
  }
}

/**
 * RAF フレーム時間を計測してフレームドロップを検出する。
 * @param sampleCount 計測するフレーム数（デフォルト 30）
 * @returns 平均フレーム時間（ms）
 */
function measureFrameTime(sampleCount = 30): Promise<number> {
  return new Promise((resolve) => {
    const times: number[] = []
    let prev = 0

    function tick(now: number) {
      if (prev > 0) {
        times.push(now - prev)
      }
      prev = now

      if (times.length < sampleCount) {
        requestAnimationFrame(tick)
      } else {
        const avg = times.reduce((a, b) => a + b, 0) / times.length
        resolve(avg)
      }
    }

    requestAnimationFrame(tick)
  })
}

/**
 * 静的シグナル（CPU コア数、メモリ）のみで即座に推奨を返す。
 */
export function detectQualitySync(): QualityPreset {
  const signals = readDeviceSignals()

  if (signals.prefersReducedMotion) return 'low'
  if (signals.cores <= 2) return 'low'
  if (signals.memoryGB !== undefined && signals.memoryGB <= 2) return 'low'
  if (signals.cores >= 8) return 'high'
  if (signals.memoryGB !== undefined && signals.memoryGB >= 8) return 'high'
  return 'balanced'
}

/**
 * フレーム計測を含む精密な推奨を返す（30 フレーム≒500ms）。
 * 起動後の落ち着いたタイミングで呼ぶことを推奨。
 */
export async function detectQuality(): Promise<QualityPreset> {
  const sync = detectQualitySync()

  // prefers-reduced-motion は最優先
  if (sync === 'low') return 'low'

  const avgFrameTime = await measureFrameTime()

  // 20ms 以上 = 50fps 未満 → low を推奨
  if (avgFrameTime > 20) return 'low'
  // 18ms 以上 = 55fps 前後 → balanced
  if (avgFrameTime > 18) return 'balanced'

  return sync
}
