import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In development, forward any request starting with /api to the Express server.
    // The browser thinks everything comes from one origin, so no CORS trouble.
    proxy: {
      '/api': {
        // API_URL is optional; it lets you point the page at a server on another port.
        target: process.env.API_URL || 'http://localhost:3001',
        // Keep the browser's own "Host" header (localhost:5173). The server's cross-site check
        // compares it with the page's address, exactly as it does behind Vercel in production.
        changeOrigin: false,
        xfwd: true, // also adds x-forwarded-host, the header proxies normally use for this
      },
    },
  },
})
