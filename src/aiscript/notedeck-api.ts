import type { Interpreter } from '@syuilo/aiscript'
import { utils, values } from '@syuilo/aiscript'
import type { Value, VFn } from '@syuilo/aiscript/interpreter/value.js'
import type { useCommandStore } from '@/commands/registry'
import type { ColumnType, useDeckStore } from '@/stores/deck'
import { version as appVersion } from '../../package.json'

const VALID_COLUMN_TYPES: readonly string[] = [
  'timeline',
  'notifications',
  'search',
  'list',
  'antenna',
  'favorites',
  'clip',
  'user',
  'mentions',
  'channel',
  'specified',
  'chat',
  'widget',
  'aiscript',
  'play',
] as const

export interface NoteDeckEnvContext {
  deckStore: ReturnType<typeof useDeckStore>
  commandStore: ReturnType<typeof useCommandStore>
  /** Set after interpreter is created, enables Nd:register_command handlers */
  interpreter?: Interpreter
  /** Track registered command IDs for cleanup */
  registeredCommandIds: string[]
}

export function createNoteDeckEnv(
  ctx: NoteDeckEnvContext,
): Record<string, Value> {
  const { deckStore, commandStore } = ctx
  const consts: Record<string, Value> = {}

  // --- Feature detection ---
  consts.NOTEDECK = values.TRUE
  consts['Nd:version'] = values.STR(appVersion)

  // --- Nd:columns ---
  consts['Nd:columns'] = values.FN_NATIVE(() => {
    return utils.jsToVal(
      deckStore.columns.map((col) => ({
        id: col.id,
        type: col.type,
        name: col.name,
        accountId: col.accountId,
      })),
    )
  })

  // --- Nd:addColumn ---
  consts['Nd:addColumn'] = values.FN_NATIVE(([typeVal, optionsVal]) => {
    utils.assertString(typeVal)
    if (!VALID_COLUMN_TYPES.includes(typeVal.value)) {
      throw new Error(`Nd:addColumn: invalid column type "${typeVal.value}"`)
    }
    const options =
      optionsVal?.type === 'obj'
        ? (utils.valToJs(optionsVal) as Record<string, unknown>)
        : {}
    const col = deckStore.addColumn({
      type: typeVal.value as ColumnType,
      name: typeof options.name === 'string' ? options.name : null,
      width: typeof options.width === 'number' ? options.width : 380,
      accountId:
        typeof options.accountId === 'string' ? options.accountId : null,
    })
    return values.STR(col.id)
  })

  // --- Nd:removeColumn ---
  consts['Nd:removeColumn'] = values.FN_NATIVE(([idVal]) => {
    utils.assertString(idVal)
    deckStore.removeColumn(idVal.value)
  })

  // --- Nd:register_command ---
  consts['Nd:register_command'] = values.FN_NATIVE(
    ([idVal, labelVal, iconVal, handlerVal]) => {
      utils.assertString(idVal)
      utils.assertString(labelVal)
      utils.assertString(iconVal)
      utils.assertFunction(handlerVal)
      const commandId = `nd-plugin:${idVal.value}`
      commandStore.register({
        id: commandId,
        label: labelVal.value,
        icon: iconVal.value,
        category: 'general',
        shortcuts: [],
        execute: () => {
          const interp = ctx.interpreter
          if (!interp) {
            console.warn('[Nd:register_command] interpreter not available')
            return
          }
          try {
            interp.execFn(handlerVal as VFn, [])
          } catch (e) {
            console.warn('[Nd:register_command]', e)
          }
        },
      })
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
