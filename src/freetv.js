// Parser for the Free-TV/IPTV M3U playlist.
// Repo: https://github.com/Free-TV/IPTV
const PLAYLIST = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8'

// Group titles / channel names that imply a category. Free-TV groups are
// mostly country names, so most channels fall through to "general" and get
// their real categories from iptv-org cross-referencing (done in api.js).
export function categoriesFromText(group, name) {
  const text = `${group} ${name}`.toLowerCase()
  const cats = []
  if (/\bsport|espn|bein|dazn|sky ?sport|fox ?sport|eurosport|\bnba\b|\bnfl\b|\bnhl\b|\bmlb\b|ufc|wwe|football|soccer|tennis|golf|cricket|willow|rugby|motogp|formula ?1|\bf1\b|fifa|world cup|la ?liga|premier ?lig|\btsn\b|\btudn\b|mat\b|combat|fight/.test(text))
    cats.push('sports')
  if (/news|noticias|24h/.test(text)) cats.push('news')
  if (/music|musica|mtv|hits/.test(text)) cats.push('music')
  if (/kids|cartoon|junior|nick|baby|disney/.test(text)) cats.push('kids')
  if (/movie|cinema|\bfilm|cine|vod/.test(text)) cats.push('movies')
  if (/document|history|nat geo|discovery/.test(text)) cats.push('documentary')
  return cats.length ? cats : ['general']
}

function attr(line, key) {
  const m = line.match(new RegExp(`${key}="([^"]*)"`))
  return m ? m[1] : null
}

/**
 * Fetches and parses the Free-TV playlist into normalized entries:
 *   { id, name, logo, country, group, url, categories }
 * Only HLS (.m3u8) URLs are kept — YouTube/Twitch/embed links can't play in
 * hls.js. Country is taken from tvg-country, falling back to the iptv-org-style
 * id suffix (e.g. "Kanali7.al" -> "AL").
 */
export async function loadFreeTV(validCountryCodes = null) {
  let text
  try {
    const res = await fetch(PLAYLIST)
    if (!res.ok) throw new Error(res.status)
    text = await res.text()
  } catch {
    return [] // Free-TV is a bonus source; never let it break the dashboard.
  }

  const lines = text.split('\n')
  const entries = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('#EXTINF')) continue

    const url = (lines[i + 1] || '').trim()
    if (!url || url.startsWith('#') || !url.includes('.m3u8')) continue // HLS only

    const name = (line.split(',').pop() || '').trim()
    if (!name) continue

    const tvgId = attr(line, 'tvg-id')
    let country = attr(line, 'tvg-country')
    if (!country && tvgId && tvgId.includes('.')) {
      const suffix = tvgId.split('.').pop().toUpperCase()
      if (suffix.length === 2) country = suffix
    }
    if (country && validCountryCodes && !validCountryCodes.has(country)) country = null

    const group = attr(line, 'group-title') || ''
    const id = tvgId || `freetv:${name}.${country || 'ZZ'}`

    entries.push({
      id,
      name: name.replace(/\s+[⒮⒯ⓎⓈⓉⓖⒼ]\s*$/u, '').trim() || name, // strip source glyphs
      logo: attr(line, 'tvg-logo'),
      country: country || 'ZZ',
      group,
      url,
      categories: categoriesFromText(group, name),
    })
  }

  return entries
}
