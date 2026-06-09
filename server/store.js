// Tiny Upstash Redis client over its REST API (no dependencies).
// Configure with two Vercel env vars (from the Upstash console):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
// If they're absent, every call resolves to null/0 so the app still runs
// (VIP still works via the static codes in vip.js; admin code-gen is disabled).

const URL = process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

export function storeReady() {
  return Boolean(URL && TOKEN)
}

// Run one Redis command, e.g. cmd('SET', 'k', 'v'). Returns the `result`, or
// null on any failure / when unconfigured.
export async function cmd(...args) {
  if (!storeReady()) return null
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data && 'result' in data ? data.result : null
  } catch {
    return null
  }
}

export async function incr(key) {
  const v = await cmd('INCR', key)
  return typeof v === 'number' ? v : 0
}

export async function getNum(key) {
  const v = await cmd('GET', key)
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : 0
}

// ---- VIP code helpers (codes are stored lowercased in a hash) ----
const CODES_HASH = 'vip:codes'

export async function addCode(code, meta) {
  const key = code.trim().toLowerCase()
  if (!key) return false
  const ok = await cmd('HSET', CODES_HASH, key, JSON.stringify(meta))
  return ok !== null
}

export async function getCode(code) {
  const key = code.trim().toLowerCase()
  const raw = await cmd('HGET', CODES_HASH, key)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export async function setCode(code, meta) {
  return addCode(code, meta)
}

export async function deleteCode(code) {
  const key = code.trim().toLowerCase()
  const n = await cmd('HDEL', CODES_HASH, key)
  return n > 0
}

// Returns [{ code, label, createdAt, active, redeemed }] newest first.
export async function listCodes() {
  const flat = await cmd('HGETALL', CODES_HASH) // [field, value, field, value, ...]
  if (!Array.isArray(flat)) return []
  const out = []
  for (let i = 0; i < flat.length; i += 2) {
    const code = flat[i]
    let meta = {}
    try { meta = JSON.parse(flat[i + 1]) || {} } catch { meta = {} }
    const redeemed = await getNum(`vip:rc:${code}`)
    out.push({ code, redeemed, ...meta })
  }
  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  return out
}
