// HLS-aware stream proxy (framework-agnostic Node handler).
//
// Many IPTV streams can't play in a browser directly because the stream server
// sends no CORS header (so the browser blocks hls.js from reading it), serves
// over http (mixed-content on an https page), or requires a Referer/User-Agent
// the browser won't set for media. This proxy fetches the stream server-side —
// where none of those rules apply — and re-serves it with `Access-Control-
// Allow-Origin: *`, rewriting the playlist so segments/keys route back through
// the proxy too.
import { Readable } from 'node:stream'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function absolute(uri, base) {
  try { return new URL(uri, base).href } catch { return uri }
}

// Build a /proxy URL for a nested resource, carrying header hints forward.
// Nested requests (segments, keys, sub-playlists) inherit the parent manifest's
// origin as Referer unless an explicit one was given — most CDNs check it.
function proxied(uri, base, q) {
  const params = new URLSearchParams({ url: absolute(uri, base) })
  let referer = q.get('referer')
  if (!referer) {
    try { referer = new URL(base).origin + '/' } catch { /* leave unset */ }
  }
  if (referer) params.set('referer', referer)
  if (q.get('ua')) params.set('ua', q.get('ua'))
  return `/proxy?${params.toString()}`
}

// Rewrite every URI in an m3u8 (segments, sub-playlists, #EXT-X-KEY/MEDIA/MAP)
// so the browser keeps talking to the proxy instead of the origin.
function rewriteManifest(text, base, q) {
  return text
    .split('\n')
    .map((line) => {
      const t = line.trim()
      if (!t) return line
      if (t.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxied(u, base, q)}"`)
      }
      return proxied(t, base, q) // segment or variant playlist
    })
    .join('\n')
}

export async function proxyHandler(req, res) {
  const q = new URL(req.url, 'http://local').searchParams

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  const target = q.get('url')
  if (!target) {
    res.statusCode = 400
    return res.end('missing ?url')
  }

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
    res.statusCode = 502
    return res.end('upstream fetch failed')
  }

  const finalUrl = upstream.url || target
  const ct = upstream.headers.get('content-type') || ''
  const isManifest = /mpegurl|m3u8/i.test(ct) || /\.m3u8(\?|$)/i.test(finalUrl)

  if (isManifest) {
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    res.setHeader('Cache-Control', 'no-store')
    return res.end(rewriteManifest(text, finalUrl, q))
  }

  // Binary segment / key / other — stream the bytes through unchanged.
  res.statusCode = upstream.status
  if (ct) res.setHeader('Content-Type', ct)
  const len = upstream.headers.get('content-length')
  if (len) res.setHeader('Content-Length', len)

  if (upstream.body) Readable.fromWeb(upstream.body).pipe(res)
  else res.end()
}
