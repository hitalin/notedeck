import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router, setupAccountRedirect } from './router'
import { initEarlyAccountListener, useAccountsStore } from './stores/accounts'
import { useKeybindsStore } from './stores/keybinds'
import { usePerformanceStore } from './stores/performance'
import { useServersStore } from './stores/servers'
import { useSettingsStore } from './stores/settings'
import { useThemeStore } from './stores/theme'
import { isTauri } from './utils/settingsFs'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import './styles/global.css'

if (isTauri) {
  // Register the `nd:accounts-early` listener as early as possible so the Rust
  // backend's pre-init emit (src-tauri/src/lib.rs:376) is never missed.
  // Done synchronously at module load — before Pinia, before mount.
  initEarlyAccountListener()

  // Pre-warm Tauri API module (critical path in App.vue onMounted)
  import('@tauri-apps/api/window')

  const isPipRoute = location.pathname === '/pip'

  if (!isPipRoute) {
    // Pre-fetch DeckPage chunk so its CSS <link> is inserted early.
    // DeckPage is lazy-imported in the router to preserve CSS Modules injection order,
    // but on Windows WebView2 the CSS load can race with first paint. Triggering the
    // import here (without await) starts the CSS download immediately while the router
    // still controls when the component is actually evaluated.
    import('./views/DeckPage.vue')

    // Pre-fetch most common column chunks so downloads start during Vue bootstrap
    // (normally these don't start until DeckColumnsArea.onMounted).
    if (import.meta.env.PROD) {
      import('./components/deck/DeckTimelineColumn.vue')
      import('./components/deck/DeckNotificationColumn.vue')
    }
  }
}

// Defer non-critical CSS to idle time — KaTeX and Shiki are not needed at startup.
// WebView2 など requestIdleCallback 未実装環境ではフォールバック 50ms
// （2000ms は初回描画に数式/コード表示が間に合わず空白が見えてしまう）
const _idle =
  window.requestIdleCallback ??
  ((cb: IdleRequestCallback) => setTimeout(cb, 50))
_idle(() => {
  import('katex/dist/katex.min.css')
  import('./assets/shiki-dark-plus.css')
})

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// Global error handler — catch unhandled promise rejections
// Vue component errors are caught by onErrorCaptured in App.vue (Vapor Mode compatible)
window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandled] Promise rejection:', event.reason)
})

// Suppress ResizeObserver loop warnings.
// TanStack Virtual's internal ResizeObserver cascades when dynamic-height items
// (images loading, content expanding) cause layout recalculations within the same frame.
// This is a known, harmless limitation of the ResizeObserver spec with virtual scrollers.
// See: https://github.com/TanStack/virtual/issues/426
const _roError = 'ResizeObserver loop'
window.addEventListener('error', (e) => {
  if (e.message?.startsWith(_roError)) e.stopImmediatePropagation()
})
window.addEventListener('unhandledrejection', (e) => {
  if (
    typeof e.reason?.message === 'string' &&
    e.reason.message.startsWith(_roError)
  )
    e.preventDefault()
})

if (isTauri) {
  // Load settings.json (scalar preferences) BEFORE any store init.
  // All stores read from settingsStore as the single source of truth,
  // so it must be loaded before they initialize. ~1-5ms for local file I/O.
  await useSettingsStore().load()

  // Apply cached theme before mount to prevent FOUC
  const themeStore = useThemeStore()
  themeStore.init()

  // Initialize file-based storage for keybinds and performance settings
  useKeybindsStore().init()
  usePerformanceStore().init()

  // Start loading accounts (fire-and-forget). Blocking mount on this invoke
  // would freeze the whole app if Rust AppState init stalls. Instead we rely
  // on the pre-registered `nd:accounts-early` listener (deterministic) and
  // DeckColumn's `requireAccount` guard, which renders a static blank while
  // `accountsStore.isLoaded` is false so no "アカウントが見つかりません" flashes.
  useAccountsStore().loadAccounts()

  // Pre-load server info from DB so ColumnBadges can show icons immediately
  useServersStore().loadCachedServers()
}

app.use(router)

if (isTauri) {
  // Redirect to login reactively after accounts load (non-blocking)
  setupAccountRedirect()
}

app.mount('#app')
