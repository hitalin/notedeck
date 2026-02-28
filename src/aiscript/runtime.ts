import { Interpreter, utils, values } from '@syuilo/aiscript'
import type { Value } from '@syuilo/aiscript/interpreter/value.js'
import type { UiComponent } from './ui-types'

export interface AiScriptOptions {
  onOutput: (value: string) => void
  onError: (error: Error) => void
  onUiRender?: (components: UiComponent[]) => void
  onUiUpdate?: (id: string, props: Record<string, unknown>) => void
  api?: (endpoint: string, params: Record<string, unknown>) => Promise<unknown>
  storagePrefix?: string
  /** Play-specific variables injected as constants */
  playVariables?: {
    THIS_ID?: string
    THIS_URL?: string
    USER_ID?: string
    USER_NAME?: string
    USER_USERNAME?: string
    CUSTOM_EMOJIS?: unknown[]
    LOCALE?: string
    SERVER_URL?: string
  }
}

let componentIdCounter = 0
function genComponentId(): string {
  return `ais-${Date.now()}-${++componentIdCounter}`
}

function valueToUiComponent(val: Value): UiComponent | null {
  if (val.type !== 'obj') return null
  const obj = val.value as Map<string, Value>
  const typeVal = obj.get('type')
  const propsVal = obj.get('props')
  const idVal = obj.get('id')
  if (!typeVal || typeVal.type !== 'str') return null

  const id = idVal?.type === 'str' ? idVal.value : genComponentId()
  const props: Record<string, unknown> = {}

  let children: UiComponent[] | undefined

  if (propsVal?.type === 'obj') {
    const propsMap = propsVal.value as Map<string, Value>
    for (const [k, v] of propsMap) {
      if (k === 'children' && v.type === 'arr') {
        // Extract children from props for nested components
        children = (v.value as Value[])
          .map(valueToUiComponent)
          .filter((c): c is UiComponent => c !== null)
      } else if (v.type === 'fn') {
        // Keep VFn as-is for event handlers
        props[k] = v
      } else {
        props[k] = utils.valToJs(v)
      }
    }
  }

  // Also check top-level children (fallback)
  if (!children) {
    const childrenVal = obj.get('children')
    if (childrenVal?.type === 'arr') {
      children = (childrenVal.value as Value[])
        .map(valueToUiComponent)
        .filter((c): c is UiComponent => c !== null)
    }
  }

  return { id, type: typeVal.value as UiComponent['type'], props, children }
}

function createUiConstructor(type: string): Value {
  return values.FN_NATIVE(([propsVal]) => {
    const id = genComponentId()
    const obj = new Map<string, Value>()
    obj.set('type', values.STR(type))
    obj.set('id', values.STR(id))
    if (propsVal?.type === 'obj') {
      obj.set('props', propsVal)
    } else {
      obj.set('props', values.OBJ(new Map()))
    }
    return values.OBJ(obj)
  })
}

// Registry for Ui:get lookups
const componentRegistry = new Map<string, Value>()

export function createInterpreter(options: AiScriptOptions): Interpreter {
  const consts: Record<string, Value> = {}

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

  // --- Mk:save / Mk:load ---
  const storageKey = (key: string) =>
    `nd-aiscript-${options.storagePrefix ?? 'default'}:${key}`

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

  // --- Ui:render ---
  consts['Ui:render'] = values.FN_NATIVE(([componentsVal]) => {
    if (!options.onUiRender) return
    if (componentsVal?.type !== 'arr') return
    const components = (componentsVal.value as Value[])
      .map(valueToUiComponent)
      .filter((c): c is UiComponent => c !== null)

    // Register all components for Ui:get
    const registerAll = (comps: UiComponent[]) => {
      for (const c of comps) {
        // Store the original AiScript value for Ui:get
        componentRegistry.set(c.id, utils.jsToVal(c))
        if (c.children) registerAll(c.children)
      }
    }
    registerAll(components)

    options.onUiRender(components)
  })

  // --- Ui:get ---
  consts['Ui:get'] = values.FN_NATIVE(([idVal]) => {
    if (idVal?.type !== 'str') return values.NULL
    return componentRegistry.get(idVal.value) ?? values.NULL
  })

  // --- Ui:C:* constructors ---
  const uiTypes = [
    'text',
    'mfm',
    'button',
    'textInput',
    'numberInput',
    'switch',
    'select',
    'container',
    'folder',
    // Play-specific components
    'postFormButton',
  ]
  for (const type of uiTypes) {
    consts[`Ui:C:${type}`] = createUiConstructor(type)
  }

  // --- Play-specific variables ---
  if (options.playVariables) {
    const pv = options.playVariables
    if (pv.THIS_ID !== undefined) consts.THIS_ID = values.STR(pv.THIS_ID)
    if (pv.THIS_URL !== undefined) consts.THIS_URL = values.STR(pv.THIS_URL)
    if (pv.USER_ID !== undefined) consts.USER_ID = values.STR(pv.USER_ID)
    if (pv.USER_NAME !== undefined) consts.USER_NAME = values.STR(pv.USER_NAME)
    if (pv.USER_USERNAME !== undefined)
      consts.USER_USERNAME = values.STR(pv.USER_USERNAME)
    if (pv.LOCALE !== undefined) consts.LOCALE = values.STR(pv.LOCALE)
    if (pv.SERVER_URL !== undefined)
      consts.SERVER_URL = values.STR(pv.SERVER_URL)
    if (pv.CUSTOM_EMOJIS !== undefined)
      consts.CUSTOM_EMOJIS = utils.jsToVal(pv.CUSTOM_EMOJIS)
  }

  const interpreter = new Interpreter(consts, {
    out: (val: Value) => {
      options.onOutput(utils.reprValue(val))
    },
    err: (e) => {
      options.onError(e)
    },
    maxStep: 100000,
    abortOnError: true,
    irqRate: 300,
  })

  return interpreter
}
