import { type Ast, Parser } from '@syuilo/aiscript'
import type { AiScriptOptions } from './runtime'
import { createInterpreter } from './runtime'
import { sanitizeCode } from './sanitize'

export async function executeAiScript(
  code: string,
  options: AiScriptOptions,
): Promise<void> {
  const parser = new Parser()
  let ast: Ast.Node[]
  try {
    ast = parser.parse(sanitizeCode(code))
  } catch (e) {
    options.onError(e instanceof Error ? e : new Error(String(e)))
    return
  }

  const interpreter = createInterpreter(options)
  try {
    await interpreter.exec(ast)
  } catch (e) {
    options.onError(e instanceof Error ? e : new Error(String(e)))
  }
}

export type { AiScriptOptions } from './runtime'
export { createInterpreter } from './runtime'
export type { UiComponent, UiComponentType } from './ui-types'
