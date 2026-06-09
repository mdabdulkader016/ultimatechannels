// EU-region Edge proxy (Frankfurt) — same logic as api/proxy.js, used for
// channels whose origin is in Europe so the proxy↔origin hop is short. The
// player routes EU-country channels to `/proxy-eu`; nested segments/keys are
// rewritten to stay on this same endpoint.
export const config = { runtime: 'edge', regions: ['fra1'] }

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function absolute(uri, base) {
  try { return new URL(uri, base).href } catch { return uri }
}

function proxied(uri, base, q) {
  const params = new URLSearchParams({ url: absolute(uri, base) })
  let referer = q.get('referer')
  if (!referer) { try { referer = new URL(base).origin + '/' } catch { /* leave unset */ } }
  if (referer) params.set('referer', referer)
  if (q.get('ua')) params.set('ua', q.get('ua'))
  return `/proxy-eu?${params.toString()}`
}

function rewriteManifest(text, base, q) {
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim()
      if (!t) return line
      if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxied(u, base, q)}"`)
      return proxied(t, base, q)
    })
    .join('\n')
}

export default async function handler(req) {
  const q = new URL(req.url).searchParams
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  const target = q.get('url')
  if (!target) return new Response('missing ?url', { status: 400, headers: cors })

  let upstream
  try {
    upstream = await fetch(target, {
      redirect: 'follow',
      headers: {
        'User-Agent': q.get('ua') || BROWSER_UA,
        Referer: q.get('referer') || new URL(target).origin + '/',
        Accept: '*/*',
      },
    })
  } catch {
    return new Response('upstream fetch failed', { status: 502, headers: cors })
  }

  const finalUrl = upstream.url || target
  const ct = upstream.headers.get('content-type') || ''
  const isManifest = /mpegurl|m3u8/i.test(ct) || /\.m3u8(\?|$)/i.test(finalUrl)

  if (isManifest) {
    const text = await upstream.text()
    return new Response(rewriteManifest(text, finalUrl, q), {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' },
    })
  }

  const headers = { ...cors }
  if (ct) headers['Content-Type'] = ct
  const len = upstream.headers.get('content-length')
  if (len) headers['Content-Length'] = len
  return new Response(upstream.body, { status: upstream.status, headers })
}
