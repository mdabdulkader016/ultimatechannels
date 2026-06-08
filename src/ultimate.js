// Parser for the bundled "Ultimate" M3U pack (public/ultimate.m3u).
// Channels carry a group-title (Sports, Movies, News, Bangladeshi, …) which we
// map to a category. The "Bangladeshi" group is assigned country code BD so the
// existing VIP gate hides it from normal users (see RESTRICTED_COUNTRIES in
// App.jsx) — VIP unlock reveals it.
import { categoriesFromText } from './freetv.js'

const PLAYLIST = '/ultimate.m3u' // served as a static asset

// group-title (lowercased) -> iptv-org category id(s).
const GROUP_CATEGORY = {
  'sports': ['sports'], 'sports 2': ['sports'],
  'movies': ['movies'],
  'music': ['music'], 'radio': ['music'], 'online radio': ['music'],
  'kids': ['kids'],
  'news': ['news'], 'english news': ['news'], 'indian bangla news': ['news'],
  'business news': ['business'], 'business': ['business'],
  'documentary': ['documentary'],
  'drama': ['series'], 'series': ['series'],
  'religious': ['religious'],
  'entertainment': ['entertainment'],
  'comedy': ['comedy'],
  'lifestyle': ['lifestyle'], 'cooking': ['lifestyle'], 'travel': ['lifestyle'],
  'culture': ['culture'],
  'family': ['family'],
  'shop': ['shop'],
  'auto': ['auto'],
  'kids;religious': ['kids'], 'animation;kids;religious': ['kids'],
  'music;religious': ['music'],
}

function attr(line, key) {
  const m = line.match(new RegExp(`${key}="([^"]*)"`))
  return m ? m[1] : null
}

// Strip emoji / flag / symbol noise and bracket tags for a clean display name.
function cleanName(raw) {
  return raw
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Parses the Ultimate pack into normalized entries:
 *   { id, name, logo, country, group, url, categories }
 * Keeps any http(s) stream URL. Internal duplicates (same name+country) pool
 * their streams as fallbacks during the merge in api.js — they don't show twice.
 */
export function parseUltimate(text) {
  if (!text) return []
  const lines = text.split('\n')
  const entries = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('#EXTINF')) continue

    const url = (lines[i + 1] || '').trim()
    if (!url || url.startsWith('#') || !/^https?:\/\//.test(url)) continue

    // Some source rows are corrupted (a scraped User-Agent / image path was
    // spliced in, sometimes with a doubled group-title). The real channel name
    // is the last comma-segment, so take that and drop anything still junk.
    const raw = (line.split(',').pop() || '').trim()
    const name = cleanName(raw)
    if (!name || /like gecko|chrome\/[0-9]|safari\/[0-9]|mozilla\/|^https?:\/\//i.test(name)) continue

    const group = attr(line, 'group-title') || ''
    const g = group.toLowerCase().trim()
    const isBangladeshi = g === 'bangladeshi'
    const country = isBangladeshi ? 'BD' : 'ZZ'
    const categories = GROUP_CATEGORY[g] || categoriesFromText(group, name)

    entries.push({
      id: `ultimate:${name}.${country}`,
      name,
      logo: attr(line, 'tvg-logo'),
      country,
      group,
      url,
      categories,
    })
  }

  return entries
}

/**
 * Fetches the bundled Ultimate pack (served as a static asset) and parses it.
 * Resolves to [] if missing.
 */
export async function loadUltimate() {
  try {
    const res = await fetch(PLAYLIST)
    if (!res.ok) throw new Error(res.status)
    return parseUltimate(await res.text())
  } catch {
    return []
  }
}
