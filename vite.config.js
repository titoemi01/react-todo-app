import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development, forward any request starting with /api to the Express server.
    // The browser thinks everything comes from one origin, so no CORS trouble.
    proxy: {
      // API_URL is optional; it lets you point the page at a server on another port.
      '/api': process.env.API_URL || 'http://localhost:3001',
    },
  },
})
