import { type Ast, Interpreter, Parser, utils } from '@syuilo/aiscript'
import type { Value } from '@syuilo/aiscript/interpreter/value.js'
import {
  Interpreter as LegacyInterpreter,
  Parser as LegacyParser,
} from '@syuilo/aiscript-0-19-0'

export interface AiScriptIOCallbacks {
  onOutput: (text: string) => void
  onError: (error: Error) => void
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
    err: (e: Error) => {
      callbacks.onError(e)
    },
    maxStep: 100000,
    abortOnError: true,
    irqRate: 300,
  }
}

export function isLegacyScript(code: string): boolean {
  const version = utils.getLangVersion(code)
  if (version == null) return true
  const [major] = version.split('.').map(Number)
  return (major ?? 0) < 1
}

export function parseAiScript(code: string): {
  ast: Ast.Node[]
  legacy: boolean
} {
  const legacy = isLegacyScript(code)
  if (legacy) {
    const legacyParser = new LegacyParser()
    const ast = legacyParser.parse(code) as unknown as Ast.Node[]
    return { ast, legacy }
  }
  const parser = new Parser()
  const ast = parser.parse(code)
  return { ast, legacy }
}

export function createAiScriptInterpreter(
  env: Record<string, Value>,
  ioOpts: ReturnType<typeof createInterpreterOptions>,
  legacy: boolean,
): Interpreter {
  if (legacy) {
    const interp = new LegacyInterpreter(
      env as Record<string, never>,
      ioOpts as unknown as ConstructorParameters<typeof LegacyInterpreter>[1],
    )
    return interp as unknown as Interpreter
  }
  return new Interpreter(env, ioOpts)
}

export async function execAiScript(
  interpreter: Interpreter,
  ast: Ast.Node[],
  legacy: boolean,
): Promise<void> {
  if (legacy) {
    const interp = interpreter as unknown as LegacyInterpreter
    await interp.exec(ast as unknown as Parameters<typeof interp.exec>[0])
  } else {
    await interpreter.exec(ast)
  }
}
