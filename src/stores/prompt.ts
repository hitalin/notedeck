import { ref } from 'vue'

export interface PromptOptions {
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
  okLabel?: string
  cancelLabel?: string
}

const visible = ref(false)
const options = ref<PromptOptions>({ title: '' })
let resolvePromise: ((value: string | null) => void) | null = null

export function usePrompt() {
  function prompt(opts: PromptOptions): Promise<string | null> {
    if (resolvePromise) {
      resolvePromise(null)
    }
    options.value = opts
    visible.value = true
    return new Promise<string | null>((resolve) => {
      resolvePromise = resolve
    })
  }

  function resolve(result: string | null) {
    visible.value = false
    resolvePromise?.(result)
    resolvePromise = null
  }

  return { visible, options, prompt, resolve }
}
