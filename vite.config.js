import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development, forward any request starting with /api to the Express server.
    // The browser thinks everything comes from one origin, so no CORS trouble.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
