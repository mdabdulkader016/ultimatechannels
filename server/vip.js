// VIP access verification — runs ONLY on the server so the codes never ship in
// the client bundle. Wired into both dev (vite.config.js) and prod
// (server/index.js), mirroring the stream proxy.
//
// Codes can be supplied two ways (both are accepted):
//   1. The VIP_CODES environment variable, comma-separated.
//   2. The CODES array below.
// Matching is case-insensitive and trims surrounding whitespace.

const CODES = new Set(
  [
    ...(process.env.VIP_CODES || '').split(','),
    // ---- Add VIP codes here (one per line, quoted) ----
    'Ultimatechodu',
  ]
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean),
)

// GET /api/vip?code=XXXX  ->  { ok: true | false }
export function vipHandler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const code = (url.searchParams.get('code') || '').trim().toLowerCase()
  const ok = code.length > 0 && CODES.has(code)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.statusCode = 200
  res.end(JSON.stringify({ ok }))
}
