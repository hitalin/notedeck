import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router, setupAccountRedirect } from './router'
import { useAccountsStore } from './stores/accounts'
import { useThemeStore } from './stores/theme'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import './styles/global.css'

// CSP violation diagnostics (remove after debugging)
const _cspLog: string[] = []
function _showCspLog() {
  if (_cspLog.length === 0) return
  const el = document.createElement('pre')
  el.textContent = _cspLog.join('\n')
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    zIndex: '99999',
    background: '#1a0000',
    color: '#ff6b6b',
    fontSize: '11px',
    padding: '8px',
    maxHeight: '30vh',
    overflow: 'auto',
    margin: '0',
    whiteSpace: 'pre-wrap',
  })
  document.body.appendChild(el)
}
document.addEventListener('securitypolicyviolation', (e) => {
  _cspLog.push(
    `[CSP] ${e.violatedDirective} blocked=${e.blockedURI} src=${e.sourceFile}:${e.lineNumber}`,
  )
  _showCspLog()
})

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
