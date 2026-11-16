import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev API the browser talks to. `/api` is proxied here for both HTTP and
// WebSocket traffic, so the app can stay same-origin. Override with
// `VITE_API_TARGET` when the local API runs on another port (see
// `scripts/dev-local.sh`, which uses :3100 so the :3000 container is untouched).
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true, ws: true },
    },
  },
})
