import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { useThemeStore } from './stores/theme'
import './styles/global.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// Apply cached theme before mount to prevent FOUC
const themeStore = useThemeStore()
themeStore.init()

app.use(router)
app.mount('#app')
