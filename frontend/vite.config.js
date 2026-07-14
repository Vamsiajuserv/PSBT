import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend API (FastAPI). Override with VITE_API_TARGET if needed.
const API_TARGET = process.env.VITE_API_TARGET || 'http://127.0.0.1:8099'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
})
