/**
 * Web Worker のシングルトン管理・リクエスト/レスポンスの Promise 化を共通化するファクトリー。
 *
 * 各 Worker は `{ id: number, ... }` 形式のレスポンスを返す前提。
 */

interface WorkerResponse {
  id: number
}

export interface WorkerClient<TRes extends WorkerResponse> {
  /** Worker にメッセージを送り、対応するレスポンスを Promise で返す */
  post: (data: Record<string, unknown>) => Promise<TRes>
}

interface PendingCallbacks<TRes> {
  resolve: (data: TRes) => void
  reject: (reason: unknown) => void
}

export function createWorkerClient<TRes extends WorkerResponse>(
  factory: () => Worker,
): WorkerClient<TRes> {
  let worker: Worker | null = null
  let requestId = 0
  const pending = new Map<number, PendingCallbacks<TRes>>()

  function getWorker(): Worker {
    if (!worker) {
      worker = factory()
      worker.onmessage = (event: MessageEvent<TRes>) => {
        const { id } = event.data
        const cb = pending.get(id)
        if (cb) {
          pending.delete(id)
          cb.resolve(event.data)
        }
      }
      worker.onerror = (event) => {
        console.error('[WorkerClient] Worker failed to load:', event.message)
        for (const [id, cb] of pending) {
          pending.delete(id)
          cb.reject(new Error(`Worker error: ${event.message}`))
        }
        worker = null
      }
    }
    return worker
  }

  return {
    post(data) {
      return new Promise((resolve, reject) => {
        const id = requestId++
        pending.set(id, { resolve, reject })
        getWorker().postMessage({ ...data, id })
      })
    },
  }
}
