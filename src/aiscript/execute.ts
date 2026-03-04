import { type Ast, Interpreter, Parser } from '@syuilo/aiscript'
import { type AiScriptEnvOptions, createAiScriptEnv } from './api'
import { type AiScriptIOCallbacks, createInterpreterOptions } from './common'
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
  type AiScriptEnvOptions,
  type AiScriptGlobalConstants,
  createAiScriptEnv,
} from './api'
export {
  type AiScriptIOCallbacks,
  createInterpreterOptions,
} from './common'
export {
  createAiScriptUiLib,
  type UiCallbacks,
  type UiComponent,
  type UiComponentType,
} from './ui'
