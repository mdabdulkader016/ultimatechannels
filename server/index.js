// Production server: serves the built SPA (dist/) and the stream proxy from a
// single process. Run with `npm run build && npm start`.
import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { proxyHandler } from './proxy.js'
import { vipHandler } from './vip.js'
import { adminHandler } from './admin.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = join(__dirname, '..', 'dist')
const PORT = process.env.PORT || 8080

const app = express()

// Stream proxy (same route as in dev).
app.use('/proxy', proxyHandler)

// VIP code verification (same route as in dev).
app.use('/api/vip', vipHandler)

// Admin API (same route as in dev).
app.use('/api/admin', adminHandler)

// Static assets + SPA fallback.
app.use(express.static(dist))
app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')))

app.listen(PORT, () => {
  console.log(`IPTV Dashboard running on http://localhost:${PORT}`)
})
