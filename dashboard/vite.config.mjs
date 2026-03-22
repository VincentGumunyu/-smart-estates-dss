import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Must match the port where uvicorn runs (default 8765). Override: set AI_API_PORT before npm run dev */
const apiPort = process.env.AI_API_PORT || '8765'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
})
