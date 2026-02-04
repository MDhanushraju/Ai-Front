import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  base: '/Ai-bot/',
  server: {
    host: true,
    // Proxy API calls to backend (ai-chat-back folder, runs on port 8081)
    proxy: {
      '/nvidia': {
        target: 'https://integrate.api.nvidia.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/nvidia/, ''),
      },
      '/api': { target: 'http://localhost:8081', changeOrigin: true },
      '/health': { target: 'http://localhost:8081', changeOrigin: true },
      '/login': { target: 'http://localhost:8081', changeOrigin: true },
    },
  },
})
