import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { useThemeStore } from './stores/theme'
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import './styles/global.css'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// Apply cached theme before mount to prevent FOUC
const themeStore = useThemeStore()
themeStore.init()

app.use(router)
app.mount('#app')
