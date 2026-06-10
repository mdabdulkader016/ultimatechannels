// Per-VIP-code pinned-channel sync, so the same code shows the same pins on
// every device. Wired into dev (vite.config.js), prod (server/index.js) and
// Vercel (api/pins.js), mirroring the VIP and proxy handlers.
//
//   GET  /api/pins?code=XXXX           -> { ok, pins: [ids], stored }
//   POST /api/pins?code=XXXX  {pins}   -> { ok, stored }
//
// `stored` reflects whether the Upstash store is configured. When it's false
// the client keeps its local-only (localStorage) behaviour and ignores the
// empty server list — nothing is lost.
import { isValidCode } from './vip.js'
import { getPins, setPins, storeReady } from './store.js'

// Read a JSON body whether or not a framework already parsed it (Express here
// has no body parser; Vercel may populate req.body). Caps the size as a guard.
async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return await new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

export async function pinsHandler(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const code = (url.searchParams.get('code') || '').trim()

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  // Pins are gated by a valid code (same check as /api/vip) so they can't be
  // read or written without one.
  if (!code || !(await isValidCode(code))) {
    res.statusCode = 200
    return res.end(JSON.stringify({ ok: false, pins: [], stored: storeReady() }))
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const body = await readJsonBody(req)
    const ok = await setPins(code, Array.isArray(body.pins) ? body.pins : [])
    res.statusCode = 200
    return res.end(JSON.stringify({ ok, stored: storeReady() }))
  }

  const pins = await getPins(code)
  res.statusCode = 200
  res.end(JSON.stringify({ ok: true, pins, stored: storeReady() }))
}
