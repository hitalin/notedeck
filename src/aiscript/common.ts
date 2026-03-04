import { utils } from '@syuilo/aiscript'
import type { AiScriptError } from '@syuilo/aiscript/error.js'
import type { Value } from '@syuilo/aiscript/interpreter/value.js'

export interface AiScriptIOCallbacks {
  onOutput: (text: string) => void
  onError: (error: AiScriptError) => void
}

/**
 * Interpreter コンストラクタの第2引数を生成する。
 * maxStep, abortOnError, irqRate の共通値を1箇所に集約。
 */
export function createInterpreterOptions(callbacks: AiScriptIOCallbacks) {
  return {
    out: (val: Value) => {
      callbacks.onOutput(utils.reprValue(val))
    },
    err: (e: AiScriptError) => {
      callbacks.onError(e)
    },
    maxStep: 100000,
    abortOnError: true,
    irqRate: 300,
  }
}
