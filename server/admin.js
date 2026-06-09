// Admin API — single endpoint at /api/admin. Every request is a POST with a
// JSON body { action, ... }. Auth is a signed token obtained via the `login`
// action; all other actions require it in the body as `token`.
//
// Required env var:  ADMIN_PASSWORD   (the dashboard login password)
// Optional env var:  ADMIN_SECRET     (token signing key; defaults to the password)
// VIP codes/stats live in Upstash (see server/store.js).
import crypto from 'node:crypto'
import { storeReady, addCode, getCode, setCode, deleteCode, listCodes, getNum } from './store.js'

const PASSWORD = process.env.ADMIN_PASSWORD || ''
const SECRET = process.env.ADMIN_SECRET || PASSWORD || 'insecure-dev-secret'
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

const b64 = (s) => Buffer.from(s).toString('base64url')
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8')
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url')

function makeToken() {
  const payload = b64(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS }))
  return `${payload}.${hmac(payload)}`
}

function validToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false
  const [payload, sig] = token.split('.')
  if (hmac(payload) !== sig) return false
  try {
    const { exp } = JSON.parse(unb64(payload))
    return typeof exp === 'number' && Date.now() < exp
  } catch {
    return false
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body // Vercel pre-parses
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

function send(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(obj))
}

// Generate a readable random code like "UC-7F3K9Q".
function genCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no confusing chars
  let s = ''
  const bytes = crypto.randomBytes(6)
  for (let i = 0; i < 6; i++) s += alphabet[bytes[i] % alphabet.length]
  return `UC-${s}`
}

export async function adminHandler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })

  const body = await readBody(req)
  const { action } = body

  // ---- login: password -> token ----
  if (action === 'login') {
    if (!PASSWORD) return send(res, 500, { error: 'ADMIN_PASSWORD not set on the server' })
    if ((body.password || '') !== PASSWORD) return send(res, 401, { error: 'Wrong password' })
    return send(res, 200, { ok: true, token: makeToken() })
  }

  // ---- everything below requires a valid token ----
  if (!validToken(body.token)) return send(res, 401, { error: 'Not authorized' })

  if (action === 'stats') {
    const codes = await listCodes()
    const active = codes.filter((c) => c.active).length
    const redeemedTotal = codes.reduce((n, c) => n + (c.redeemed || 0), 0)
    return send(res, 200, {
      storeReady: storeReady(),
      stats: {
        totalCodes: codes.length,
        activeCodes: active,
        revokedCodes: codes.length - active,
        redemptionsByCodes: redeemedTotal,
        checks: await getNum('stat:checks'),
        unlocksOk: await getNum('stat:redeem_ok'),
        unlocksFailed: await getNum('stat:redeem_fail'),
      },
    })
  }

  if (action === 'codes') {
    return send(res, 200, { codes: await listCodes() })
  }

  if (action === 'generate') {
    if (!storeReady()) return send(res, 500, { error: 'Storage not configured (set Upstash env vars)' })
    const count = Math.min(Math.max(parseInt(body.count, 10) || 1, 1), 100)
    const label = (body.label || '').toString().slice(0, 80)
    const created = []
    for (let i = 0; i < count; i++) {
      let code = genCode()
      // avoid the rare collision
      if (await getCode(code)) code = genCode()
      await addCode(code, { label, createdAt: Date.now(), active: true, code })
      created.push(code)
    }
    return send(res, 200, { ok: true, created })
  }

  // Create a custom code chosen by the admin (their own word).
  if (action === 'custom') {
    if (!storeReady()) return send(res, 500, { error: 'Storage not configured (set Upstash env vars)' })
    const code = (body.code || '').toString().trim()
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(code)) {
      return send(res, 400, { error: 'Use 3–40 letters, digits, - or _ (no spaces)' })
    }
    if (await getCode(code)) return send(res, 409, { error: 'That code already exists' })
    const label = (body.label || '').toString().slice(0, 80)
    await addCode(code, { label, createdAt: Date.now(), active: true, code })
    return send(res, 200, { ok: true, created: [code] })
  }

  if (action === 'revoke' || action === 'activate') {
    const meta = await getCode(body.code || '')
    if (!meta) return send(res, 404, { error: 'Code not found' })
    meta.active = action === 'activate'
    await setCode(body.code, meta)
    return send(res, 200, { ok: true })
  }

  if (action === 'delete') {
    await deleteCode(body.code || '')
    return send(res, 200, { ok: true })
  }

  return send(res, 400, { error: 'Unknown action' })
}
