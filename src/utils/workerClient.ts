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

export function createWorkerClient<TRes extends WorkerResponse>(
  url: URL,
): WorkerClient<TRes> {
  let worker: Worker | null = null
  let requestId = 0
  const pending = new Map<number, (data: TRes) => void>()

  function getWorker(): Worker {
    if (!worker) {
      worker = new Worker(url, { type: 'module' })
      worker.onmessage = (event: MessageEvent<TRes>) => {
        const { id } = event.data
        const resolve = pending.get(id)
        if (resolve) {
          pending.delete(id)
          resolve(event.data)
        }
      }
    }
    return worker
  }

  return {
    post(data) {
      return new Promise((resolve) => {
        const id = requestId++
        getWorker().postMessage({ ...data, id })
        pending.set(id, resolve)
      })
    },
  }
}
