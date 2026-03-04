import { utils, values } from '@syuilo/aiscript'
import type { Value } from '@syuilo/aiscript/interpreter/value.js'

export interface AiScriptEnvOptions {
  /** Mk:api の実装。未設定なら Mk:api は使用不可エラー */
  api?: (
    endpoint: string,
    params: Record<string, unknown>,
  ) => Promise<unknown>
  /** localStorage のキー prefix（Mk:save/Mk:load 用） */
  storagePrefix?: string
}

export interface AiScriptGlobalConstants {
  THIS_ID?: string
  THIS_URL?: string
  USER_ID?: string
  USER_NAME?: string
  USER_USERNAME?: string
  CUSTOM_EMOJIS?: unknown[]
  LOCALE?: string
  SERVER_URL?: string
}

/**
 * Mk:* API とグローバル定数を Record<string, Value> で返す。
 * Interpreter の consts に spread して使う。
 */
export function createAiScriptEnv(
  options: AiScriptEnvOptions,
  globals?: AiScriptGlobalConstants,
): Record<string, Value> {
  const consts: Record<string, Value> = {}
  const storageKey = (key: string) =>
    `nd-aiscript-${options.storagePrefix ?? 'default'}:${key}`

  // --- Mk:dialog ---
  consts['Mk:dialog'] = values.FN_NATIVE(
    async ([titleVal, textVal, _typeVal]) => {
      const title = titleVal?.type === 'str' ? titleVal.value : ''
      const text = textVal?.type === 'str' ? textVal.value : ''
      window.alert(`${title}\n${text}`)
      return values.NULL
    },
  )

  // --- Mk:confirm ---
  consts['Mk:confirm'] = values.FN_NATIVE(async ([titleVal, textVal]) => {
    const title = titleVal?.type === 'str' ? titleVal.value : ''
    const text = textVal?.type === 'str' ? textVal.value : ''
    const result = window.confirm(`${title}\n${text}`)
    return values.BOOL(result)
  })

  // --- Mk:api ---
  consts['Mk:api'] = values.FN_NATIVE(async ([endpointVal, paramsVal]) => {
    if (!options.api) {
      throw new Error('Mk:api is not available')
    }
    const endpoint = endpointVal?.type === 'str' ? endpointVal.value : ''
    const params =
      paramsVal?.type === 'obj'
        ? (utils.valToJs(paramsVal) as Record<string, unknown>)
        : {}
    const result = await options.api(endpoint, params)
    return utils.jsToVal(result)
  })

  // --- Mk:save ---
  consts['Mk:save'] = values.FN_NATIVE(([keyVal, valueVal]) => {
    if (keyVal?.type !== 'str' || !valueVal) return
    try {
      localStorage.setItem(
        storageKey(keyVal.value),
        JSON.stringify(utils.valToJs(valueVal)),
      )
    } catch {
      // ignore storage errors
    }
  })

  // --- Mk:load ---
  consts['Mk:load'] = values.FN_NATIVE(([keyVal]) => {
    if (keyVal?.type !== 'str') return values.NULL
    try {
      const raw = localStorage.getItem(storageKey(keyVal.value))
      if (raw === null) return values.NULL
      return utils.jsToVal(JSON.parse(raw))
    } catch {
      return values.NULL
    }
  })

  // --- グローバル定数 ---
  if (globals) {
    if (globals.THIS_ID !== undefined)
      consts.THIS_ID = values.STR(globals.THIS_ID)
    if (globals.THIS_URL !== undefined)
      consts.THIS_URL = values.STR(globals.THIS_URL)
    if (globals.USER_ID !== undefined)
      consts.USER_ID = values.STR(globals.USER_ID)
    if (globals.USER_NAME !== undefined)
      consts.USER_NAME = values.STR(globals.USER_NAME)
    if (globals.USER_USERNAME !== undefined)
      consts.USER_USERNAME = values.STR(globals.USER_USERNAME)
    if (globals.LOCALE !== undefined)
      consts.LOCALE = values.STR(globals.LOCALE)
    if (globals.SERVER_URL !== undefined)
      consts.SERVER_URL = values.STR(globals.SERVER_URL)
    if (globals.CUSTOM_EMOJIS !== undefined)
      consts.CUSTOM_EMOJIS = utils.jsToVal(globals.CUSTOM_EMOJIS)
  }

  return consts
}
