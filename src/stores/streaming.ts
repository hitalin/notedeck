import { listen } from '@tauri-apps/api/event'
import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { StreamConnectionState } from '@/adapters/types'

/** Consolidated stream event from Rust TauriEmitter */
interface StreamEventEnvelope {
  kind: string
  payload: Record<string, unknown>
}

export const useStreamingStore = defineStore('streaming', () => {
  /** accountId → StreamConnectionState (reactive for per-key tracking) */
  const states = reactive(new Map<string, StreamConnectionState>())

  let listening = false

  /** Start listening to Tauri stream-event once */
  function startListening(): void {
    if (listening) return
    listening = true

    listen<StreamEventEnvelope>('stream-event', (event) => {
      const { kind, payload } = event.payload
      if (kind !== 'stream-status') return

      const p = payload as Record<string, unknown>
      const accountId = p.accountId as string
      const state = p.state as StreamConnectionState
      if (accountId && state) {
        states.set(accountId, state)
      }
    }).catch((e) => {
      console.error('[streaming store] failed to listen:', e)
      listening = false
    })
  }

  /** Mark an account as connected (called by adapter after stream_connect succeeds) */
  function setConnected(accountId: string): void {
    states.set(accountId, 'connected')
  }

  /** Mark an account as disconnected and clean up */
  function disconnect(accountId: string): void {
    states.set(accountId, 'disconnected')
  }

  function getState(accountId: string): StreamConnectionState | null {
    return states.get(accountId) ?? null
  }

  return {
    states,
    startListening,
    setConnected,
    disconnect,
    getState,
  }
})
