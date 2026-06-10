import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { proxyHandler } from './server/proxy.js'
import { vipHandler } from './server/vip.js'
import { pinsHandler } from './server/pins.js'
import { adminHandler } from './server/admin.js'

// Serve the /proxy stream proxy and /api/vip check during development so they
// work with `npm run dev` out of the box (in production the Express server in
// server/index.js handles the same routes).
function hlsProxyPlugin() {
  return {
    name: 'hls-proxy',
    configureServer(server) {
      server.middlewares.use('/proxy', proxyHandler)
      server.middlewares.use('/api/vip', vipHandler)
      server.middlewares.use('/api/pins', pinsHandler)
      server.middlewares.use('/api/admin', adminHandler)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), hlsProxyPlugin()],
  server: {
    port: 5173,
    open: true,
  },
})
