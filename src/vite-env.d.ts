/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string
declare const __GIT_COMMIT__: string

declare module '*.json5' {
  const value: unknown
  export default value
}
