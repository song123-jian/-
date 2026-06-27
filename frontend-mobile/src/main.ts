import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { setupAutoSync } from './utils/offline'

// 引入 Vant 基础样式
import 'vant/lib/index.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

setupAutoSync()
