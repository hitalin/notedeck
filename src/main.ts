import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router, setupAccountRedirect } from './router'
import { useAccountsStore } from './stores/accounts'
import { useKeybindsStore } from './stores/keybinds'
import { usePerformanceStore } from './stores/performance'
import { useThemeStore } from './stores/theme'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import './styles/global.css'

// Pre-warm Tauri API module (critical path in App.vue onMounted)
import('@tauri-apps/api/window')

// Pre-fetch DeckPage chunk so its CSS <link> is inserted early.
// DeckPage is lazy-imported in the router to preserve CSS Modules injection order,
// but on Windows WebView2 the CSS load can race with first paint. Triggering the
// import here (without await) starts the CSS download immediately while the router
// still controls when the component is actually evaluated.
import('./views/DeckPage.vue')

// Pre-fetch most common column chunks so downloads start during Vue bootstrap
// (normally these don't start until DeckColumnsArea.onMounted — 4 component layers deep)
if (import.meta.env.PROD) {
  import('./components/deck/DeckTimelineColumn.vue')
  import('./components/deck/DeckNotificationColumn.vue')
}

// Defer non-critical CSS to idle time — KaTeX and Shiki are not needed at startup
const _idle =
  window.requestIdleCallback ??
  ((cb: IdleRequestCallback) => setTimeout(cb, 2000))
_idle(() => {
  import('katex/dist/katex.min.css')
  import('./assets/shiki-dark-plus.css')
})

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// Global error handlers — catch uncaught Vue errors and unhandled rejections
app.config.errorHandler = (err, instance, info) => {
  console.error(`[vue] Uncaught error in ${info}:`, err)
  if (import.meta.env.DEV && instance) {
    console.debug('[vue] Component:', instance.$options.__name ?? instance)
  }
}

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandled] Promise rejection:', event.reason)
})

// Apply cached theme before mount to prevent FOUC
const themeStore = useThemeStore()
themeStore.init()

// Initialize file-based storage for keybinds and performance settings
useKeybindsStore().init()
usePerformanceStore().init()

// Start loading accounts early (runs in parallel with mount).
// In Tauri, invoke('load_accounts') internally awaits AppState readiness,
// so it naturally waits for DB to open — no explicit gate needed.
useAccountsStore().loadAccounts()

app.use(router)

// Redirect to login reactively after accounts load (non-blocking)
setupAccountRedirect()

app.mount('#app')
