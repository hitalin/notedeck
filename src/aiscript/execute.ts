import { Interpreter, type Ast, Parser } from '@syuilo/aiscript'
import { createAiScriptEnv, type AiScriptEnvOptions } from './api'
import {
  createInterpreterOptions,
  type AiScriptIOCallbacks,
} from './common'
import { sanitizeCode } from './sanitize'

export type ExecuteOptions = AiScriptEnvOptions & AiScriptIOCallbacks

/**
 * パース + Interpreter 生成 + 実行を一括で行う便利関数。
 * UI 不要・Play 変数不要のシンプルなケース向け。
 */
export async function executeAiScript(
  code: string,
  options: ExecuteOptions,
): Promise<void> {
  const parser = new Parser()
  let ast: Ast.Node[]
  try {
    ast = parser.parse(sanitizeCode(code))
  } catch (e) {
    options.onError(e instanceof Error ? e : new Error(String(e)))
    return
  }

  const env = createAiScriptEnv(options)
  const ioOpts = createInterpreterOptions(options)
  const interpreter = new Interpreter(env, ioOpts)
  try {
    await interpreter.exec(ast)
  } catch (e) {
    options.onError(e instanceof Error ? e : new Error(String(e)))
  }
}

// Re-exports
export {
  createAiScriptEnv,
  type AiScriptEnvOptions,
  type AiScriptGlobalConstants,
} from './api'
export {
  createAiScriptUiLib,
  type UiCallbacks,
  type UiComponent,
  type UiComponentType,
} from './ui'
export {
  createInterpreterOptions,
  type AiScriptIOCallbacks,
} from './common'
