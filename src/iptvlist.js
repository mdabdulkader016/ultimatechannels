// Parser for the chokechainirand/iptvlist playlist (a Free-IPTV mirror).
// Repo: https://github.com/chokechainirand/iptvlist
// Its master file groups channels by COUNTRY NAME (often with a provider
// suffix, e.g. "USA PLUTO", "GERMANY LOCAL") and has no tvg-country, so we
// resolve the country from the group title.
import { categoriesFromText } from './freetv.js'

export const IPTVLIST_URL =
  'https://raw.githubusercontent.com/chokechainirand/iptvlist/master/ZZ_PLAYLIST_ALL_TV.m3u'

// Group-title spellings that don't match iptv-org's country names.
const COUNTRY_ALIASES = {
  USA: 'US', UK: 'GB', KOREA: 'KR', 'CZECH REPUBLIC': 'CZ', NEWZEALAND: 'NZ',
  'EX-YUG': 'RS', RUSSIA: 'RU', VIETNAM: 'VN', UAE: 'AE', TURKEY: 'TR',
}

function attr(line, key) {
  const m = line.match(new RegExp(`${key}="([^"]*)"`))
  return m ? m[1] : null
}

const isIptvOrgId = (id) => !!id && /^\S+\.[a-z]{2}$/i.test(id)

/**
 * Parses the iptvlist master M3U text into normalized entries:
 *   { id, name, logo, country, group, url, categories }
 * Only HLS (.m3u8) URLs are kept. `countryNameToCode` maps lower-cased
 * iptv-org country names -> ISO codes; we build a prefix matcher on top of it
 * so "GERMANY PLUTO" still resolves to DE.
 */
export function parseIptvList(text, countryNameToCode = new Map()) {
  if (!text) return []

  // Resolution dictionary: UPPER-CASE name -> code (iptv-org names + aliases).
  const dict = new Map()
  for (const [name, code] of countryNameToCode) dict.set(name.toUpperCase(), code)
  for (const k in COUNTRY_ALIASES) dict.set(k, COUNTRY_ALIASES[k])
  // Longest names first so multi-word names win over short prefixes.
  const names = [...dict.keys()].sort((a, b) => b.length - a.length)

  const resolveCountry = (group, id) => {
    const G = group.toUpperCase().trim()
    for (const n of names) {
      if (G === n || G.startsWith(n + ' ')) return dict.get(n)
    }
    if (isIptvOrgId(id)) {
      const suffix = id.split('.').pop().toUpperCase()
      if (dict.size && [...dict.values()].includes(suffix)) return suffix
    }
    return 'ZZ'
  }

  const lines = text.split('\n')
  const entries = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('#EXTINF')) continue

    const url = (lines[i + 1] || '').trim()
    if (!url || url.startsWith('#') || !url.includes('.m3u8')) continue // HLS only

    const name = ((line.split(',').pop() || '').trim()) || attr(line, 'tvg-name')
    if (!name) continue

    const group = attr(line, 'group-title') || ''
    const tvgId = attr(line, 'tvg-id')
    const country = resolveCountry(group, tvgId)
    const id = isIptvOrgId(tvgId) ? tvgId : `iptvlist:${name}.${country}`

    entries.push({
      id,
      name,
      logo: attr(line, 'tvg-logo'),
      country,
      group,
      url,
      categories: categoriesFromText(group, name),
    })
  }

  return entries
}
