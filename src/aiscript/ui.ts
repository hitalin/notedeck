import { utils, values } from '@syuilo/aiscript'
import type { Value } from '@syuilo/aiscript/interpreter/value.js'

// --- 型定義（旧 ui-types.ts を統合） ---

export type UiComponentType =
  | 'text'
  | 'mfm'
  | 'button'
  | 'textInput'
  | 'numberInput'
  | 'switch'
  | 'select'
  | 'container'
  | 'folder'
  | 'postFormButton'

export interface UiComponent {
  id: string
  type: UiComponentType
  props: Record<string, unknown>
  children?: UiComponent[]
}

// --- 内部ヘルパー ---

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

// --- パブリック API ---

export interface UiCallbacks {
  onRender: (components: UiComponent[]) => void
}

/**
 * Ui:* API を Record<string, Value> で返す。
 * Interpreter の consts に spread して使う。
 *
 * componentRegistry は呼び出しごとにインスタンス化（グローバル共有しない）。
 */
export function createAiScriptUiLib(
  callbacks: UiCallbacks,
): Record<string, Value> {
  const consts: Record<string, Value> = {}
  const componentRegistry = new Map<string, Value>()

  // --- Ui:render ---
  consts['Ui:render'] = values.FN_NATIVE(([componentsVal]) => {
    if (componentsVal?.type !== 'arr') return
    const components = (componentsVal.value as Value[])
      .map(valueToUiComponent)
      .filter((c): c is UiComponent => c !== null)

    // Register all components for Ui:get
    const registerAll = (comps: UiComponent[]) => {
      for (const c of comps) {
        componentRegistry.set(c.id, utils.jsToVal(c))
        if (c.children) registerAll(c.children)
      }
    }
    registerAll(components)

    callbacks.onRender(components)
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
    'postFormButton',
  ]
  for (const type of uiTypes) {
    consts[`Ui:C:${type}`] = createUiConstructor(type)
  }

  return consts
}
