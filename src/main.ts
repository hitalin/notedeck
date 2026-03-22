import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router, setupAccountRedirect } from './router'
import { useAccountsStore } from './stores/accounts'
import { useKeybindsStore } from './stores/keybinds'
import { useThemeStore } from './stores/theme'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import 'katex/dist/katex.min.css'
import './styles/global.css'
import './assets/shiki-dark-plus.css'

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

// Initialize keybinds file-based storage
useKeybindsStore().init()

// Start loading accounts early (runs in parallel with mount)
useAccountsStore().loadAccounts()

app.use(router)

// Redirect to login reactively after accounts load (non-blocking)
setupAccountRedirect()

app.mount('#app')
