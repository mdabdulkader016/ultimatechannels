// VIP access verification — runs ONLY on the server so the codes never ship in
// the client bundle. Wired into both dev (vite.config.js) and prod
// (server/index.js), mirroring the stream proxy.
//
// A code is valid if it is either:
//   1. A static code (VIP_CODES env var, comma-separated, or the CODES list), or
//   2. An active code generated from the admin dashboard (stored in Upstash).
// Matching is case-insensitive and trims surrounding whitespace.
import { getCode, incr, recordIp } from './store.js'

// Best-effort client IP (Vercel sets x-forwarded-for; fall back to socket).
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || ''
  if (xff) return String(xff).split(',')[0].trim()
  return (req.socket && req.socket.remoteAddress) || 'unknown'
}

const STATIC = new Set(
  [
    ...(process.env.VIP_CODES || '').split(','),
    // ---- Add static VIP codes here (one per line, quoted) ----
    'Ultimatechodu',
  ]
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean),
)

// Is this code currently valid? (static OR an active admin-generated code)
export async function isValidCode(code) {
  const c = (code || '').trim().toLowerCase()
  if (!c) return false
  if (STATIC.has(c)) return true
  const meta = await getCode(c)
  return Boolean(meta && meta.active)
}

// GET /api/vip?code=XXXX  ->  { ok: true | false }
export async function vipHandler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const code = (url.searchParams.get('code') || '').trim()

  incr('stat:checks') // fire-and-forget metrics
  const ok = await isValidCode(code)
  if (ok) {
    incr('stat:redeem_ok')
    const c = code.toLowerCase()
    if (!STATIC.has(c)) {
      incr(`vip:rc:${c}`)
      recordIp(c, clientIp(req), Date.now()) // track which IPs use this code
    }
  } else {
    incr('stat:redeem_fail')
  }

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.statusCode = 200
  res.end(JSON.stringify({ ok }))
}
