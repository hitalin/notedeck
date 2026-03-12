import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router, setupAccountRedirect } from './router'
import { useAccountsStore } from './stores/accounts'
import { useThemeStore } from './stores/theme'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import './styles/global.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// Apply cached theme before mount to prevent FOUC
const themeStore = useThemeStore()
themeStore.init()

// Start loading accounts early (runs in parallel with mount)
useAccountsStore().loadAccounts()

app.use(router)

// Redirect to login reactively after accounts load (non-blocking)
setupAccountRedirect()

app.mount('#app')
