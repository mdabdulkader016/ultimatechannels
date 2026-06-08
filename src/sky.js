// Parser for the user's bundled "Sky" M3U pack (public/sky.m3u).
// This list is minimal — just `#EXTINF:-1 ,Channel Name` + a stream URL, with
// no tvg-id / group-title / tvg-country. We recover the country from a flag
// emoji or a trailing country token in the name, and the category from name
// keywords (the pack is sports-heavy).
import { categoriesFromText } from './freetv.js'

const PLAYLIST = '/sky.m3u' // served as a static asset by Vite

// Country tokens that appear inside channel names → ISO code.
const NAME_COUNTRY = {
  FRANCE: 'FR', FR: 'FR', TURKEY: 'TR', TR: 'TR', GERMANY: 'DE', DE: 'DE',
  ITALY: 'IT', IT: 'IT', SPAIN: 'ES', ES: 'ES', GREECE: 'GR', GR: 'GR',
  POLAND: 'PL', PL: 'PL', ROMANIA: 'RO', RO: 'RO', CROATIA: 'HR', HR: 'HR',
  SERBIA: 'RS', RS: 'RS', BULGARIA: 'BG', BG: 'BG', CZECH: 'CZ', CZ: 'CZ',
  DENMARK: 'DK', DK: 'DK', NORWAY: 'NO', NO: 'NO', SWEDEN: 'SE', SE: 'SE',
  NETHERLANDS: 'NL', NL: 'NL', UK: 'GB', GB: 'GB', RUSSIA: 'RU', RU: 'RU',
  BRASIL: 'BR', BRAZIL: 'BR', BR: 'BR', ARG: 'AR', AR: 'AR', MEXICO: 'MX',
  NZ: 'NZ', XK: 'XK', QA: 'QA', IL: 'IL', HK: 'HK', CL: 'CL', IN: 'IN',
}

function attr(line, key) {
  const m = line.match(new RegExp(`${key}="([^"]*)"`))
  return m ? m[1] : null
}

// A flag emoji is two Regional Indicator Symbols (U+1F1E6 = 'A'). Decode the
// first one found into its ISO 3166-1 alpha-2 code.
function flagToCode(text) {
  const m = [...text.matchAll(/[\u{1F1E6}-\u{1F1FF}]/gu)]
  if (m.length >= 2) {
    const a = m[0][0].codePointAt(0) - 0x1f1e6
    const b = m[1][0].codePointAt(0) - 0x1f1e6
    return String.fromCharCode(65 + a, 65 + b)
  }
  return null
}

// Strip flag/emoji/symbol noise and bracket tags for a clean display name.
function cleanName(raw) {
  return raw
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu, '')
    .replace(/\[[^\]]*\]/g, '') // [coming] etc.
    .replace(/\s+/g, ' ')
    .trim()
}

function countryFromName(rawName, cleaned) {
  const byFlag = flagToCode(rawName)
  if (byFlag) return byFlag
  for (const tok of cleaned.toUpperCase().split(/[^A-Z]+/)) {
    if (tok.length >= 2 && NAME_COUNTRY[tok]) return NAME_COUNTRY[tok]
  }
  return 'ZZ'
}

/**
 * Parses the Sky pack text into normalized entries:
 *   { id, name, logo, country, group, url, categories }
 * Keeps any http(s) stream URL (HLS .m3u8/.ts or extension-less portal URLs).
 */
export function parseSky(text) {
  if (!text) return []
  const lines = text.split('\n')
  const entries = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('#EXTINF')) continue

    const url = (lines[i + 1] || '').trim()
    // Keep HLS-style URLs (.m3u8 / .ts) and Xtream/portal-style stream URLs
    // (e.g. http://host/user/pass/12345) that carry no file extension.
    if (!url || url.startsWith('#') || !/^https?:\/\//.test(url)) continue

    const raw = (line.split(',').slice(1).join(',') || '').trim()
    const name = cleanName(raw)
    if (!name) continue

    const country = countryFromName(raw, name)
    entries.push({
      id: `sky:${name}.${country}`,
      name,
      logo: attr(line, 'tvg-logo'),
      country,
      group: '',
      url,
      categories: categoriesFromText('', name),
    })
  }

  return entries
}

/**
 * Fetches the bundled Sky pack (served as a static asset) and parses it.
 * Resolves to [] if missing.
 */
export async function loadSky() {
  try {
    const res = await fetch(PLAYLIST)
    if (!res.ok) throw new Error(res.status)
    return parseSky(await res.text())
  } catch {
    return []
  }
}
