import type { Interpreter } from '@syuilo/aiscript'
import { utils, values } from '@syuilo/aiscript'
import type { Value, VFn } from '@syuilo/aiscript/interpreter/value.js'
import type { CapabilitySignature, PermissionKey } from '@/capabilities/types'
import type { Command, useCommandStore } from '@/commands/registry'
import { version as appVersion } from '../../package.json'

export interface NoteDeckEnvContext {
  commandStore: ReturnType<typeof useCommandStore>
  /** Set after interpreter is created, enables Nd:register_command handlers */
  interpreter?: Interpreter
  /** Track registered command IDs for cleanup */
  registeredCommandIds: string[]
}

export function createNoteDeckEnv(
  ctx: NoteDeckEnvContext,
): Record<string, Value> {
  const { commandStore } = ctx
  const consts: Record<string, Value> = {}

  // --- Feature detection ---
  consts.NOTEDECK = values.TRUE
  consts['Nd:version'] = values.STR(appVersion)

  // --- Nd:register_command ---
  // 5 引数目の `options` を渡すと capability registry にもミラー登録され、
  // AI tool calling / HTTP API / CLI からも呼べるようになる。
  // options なし = 従来通り UI コマンドパレット専用。
  //
  // カラム操作 (旧 Nd:columns / Nd:addColumn / Nd:removeColumn) は
  // `Nd:call('column.list')` / `Nd:call('column.add', ...)` /
  // `Nd:call('column.remove', ...)` で代替する (capability registry 経由)。
  consts['Nd:register_command'] = values.FN_NATIVE(
    ([idVal, labelVal, iconVal, handlerVal, optionsVal]) => {
      utils.assertString(idVal)
      utils.assertString(labelVal)
      utils.assertString(iconVal)
      utils.assertFunction(handlerVal)

      const parsed = parseRegisterCommandOptions(optionsVal)
      const commandId = `nd-plugin:${idVal.value}`
      const handler = handlerVal as VFn
      const command: Command = {
        id: commandId,
        label: labelVal.value,
        icon: iconVal.value,
        category: 'general',
        shortcuts: [],
        execute: (params) => {
          const interp = ctx.interpreter
          if (!interp) {
            console.warn('[Nd:register_command] interpreter not available')
            return
          }
          try {
            // params あり (= dispatcher / AI tool 経由) は戻り値を返す必要があるため
            // 同期実行 + JS 値変換。params なし (= UI コマンドパレット経由) は
            // 戻り値不要なので fire-and-forget。
            if (params && Object.keys(params).length > 0) {
              const result = interp.execFnSync(handler, [utils.jsToVal(params)])
              return utils.valToJs(result)
            }
            interp.execFn(handler, [])
          } catch (e) {
            console.warn('[Nd:register_command]', e)
            throw e
          }
        },
      }
      if (parsed.aiTool) command.aiTool = true
      if (parsed.permissions) command.permissions = parsed.permissions
      if (parsed.requiresConfirmation !== undefined) {
        command.requiresConfirmation = parsed.requiresConfirmation
      }
      if (parsed.signature) command.signature = parsed.signature

      commandStore.register(command)
      ctx.registeredCommandIds.push(commandId)
    },
  )

  return consts
}

/**
 * Cleanup NoteDeck API resources (unregister commands, etc.)
 */
export function cleanupNoteDeckEnv(ctx: NoteDeckEnvContext): void {
  for (const id of ctx.registeredCommandIds) {
    ctx.commandStore.unregister(id)
  }
  ctx.registeredCommandIds.length = 0
}

interface ParsedRegisterCommandOptions {
  aiTool: boolean
  permissions?: PermissionKey[]
  requiresConfirmation?: boolean
  signature?: CapabilitySignature
}

/**
 * `Nd:register_command` の 5 引数目を解析する。AiScript の obj 値から
 * Command 用フィールドを取り出す。未知フィールドは無視する。
 */
function parseRegisterCommandOptions(
  optionsVal: Value | undefined,
): ParsedRegisterCommandOptions {
  const out: ParsedRegisterCommandOptions = { aiTool: false }
  if (!optionsVal || optionsVal.type !== 'obj') return out

  const options = utils.valToJs(optionsVal) as Record<string, unknown>
  if (options.aiTool === true) out.aiTool = true
  if (Array.isArray(options.permissions)) {
    out.permissions = options.permissions.filter(
      (p): p is string => typeof p === 'string',
    ) as PermissionKey[]
  }
  if (typeof options.requiresConfirmation === 'boolean') {
    out.requiresConfirmation = options.requiresConfirmation
  }
  if (
    options.signature &&
    typeof options.signature === 'object' &&
    !Array.isArray(options.signature)
  ) {
    const sig = options.signature as Record<string, unknown>
    const signature: CapabilitySignature = {
      description: typeof sig.description === 'string' ? sig.description : '',
    }
    if (sig.params && typeof sig.params === 'object') {
      signature.params = sig.params as CapabilitySignature['params']
    }
    if (sig.returns && typeof sig.returns === 'object') {
      signature.returns = sig.returns as CapabilitySignature['returns']
    }
    if (typeof sig.cheap === 'boolean') signature.cheap = sig.cheap
    out.signature = signature
  }
  return out
}
