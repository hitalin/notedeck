import type { Transport } from '@codemirror/lsp-client'

export function createWorkerTransport(worker: Worker): Transport {
  const handlers = new Set<(value: string) => void>()

  worker.onmessage = (e: MessageEvent<string>) => {
    for (const handler of handlers) {
      handler(e.data)
    }
  }

  return {
    send(message: string) {
      worker.postMessage(message)
    },
    subscribe(handler: (value: string) => void) {
      handlers.add(handler)
    },
    unsubscribe(handler: (value: string) => void) {
      handlers.delete(handler)
    },
  }
}
