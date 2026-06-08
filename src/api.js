// Data layer. Combines three sources into one unified channel directory:
//   1. iptv-org public API  — https://github.com/iptv-org/api
//   2. Free-TV/IPTV M3U      — https://github.com/Free-TV/IPTV
//   3. iptvlist M3U          — https://github.com/chokechainirand/iptvlist
//   4. Sky pack (bundled)    — public/sky.m3u
import { loadFreeTV } from './freetv.js'
import { parseIptvList, IPTVLIST_URL } from './iptvlist.js'
import { loadSky } from './sky.js'

const BASE = 'https://iptv-org.github.io/api'

// Fetch raw text, resolving to '' on any failure (bonus sources must never
// break the dashboard).
const fetchText = (url) =>
  fetch(url).then((r) => (r.ok ? r.text() : '')).catch(() => '')

// Normalize a channel name for cross-source matching: lowercase, strip accents,
// parentheticals, and quality/filler words — but KEEP digits ("Sport 1" must
// not collapse into "Sport 2"). Used to pool same-name streams as fallbacks.
function normName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(hd|fhd|uhd|sd|4k|8k|fullhd|tv|channel|the|live|online|feed|backup|op\d+)\b/g, ' ')
    .replace(/\s+/g, '')
    .trim()
}
// Key for the name index. Country-scoped, and never for the catch-all bucket
// (too many unrelated channels share names there).
function nameKey(name, country) {
  if (!country || country === 'ZZ') return null
  const n = normName(name)
  return n.length >= 3 ? `${n}|${country}` : null
}

const ENDPOINTS = {
  channels: `${BASE}/channels.json`,
  streams: `${BASE}/streams.json`,
  countries: `${BASE}/countries.json`,
  categories: `${BASE}/categories.json`,
  logos: `${BASE}/logos.json`,
}

async function getJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`)
  return res.json()
}

// iptv-org reports quality as a resolution height like "1080p", "576i",
// "2160p" (or null when unknown). Parse the numeric height...
function qualityHeight(quality) {
  if (!quality) return 0
  const m = String(quality).match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

// ...and bucket it into a viewer-friendly badge.
function qualityLabel(height) {
  if (height >= 2160) return '4K'
  if (height >= 1080) return 'FHD'
  if (height >= 720) return 'HD'
  if (height > 0) return 'SD'
  return null // unknown — no badge
}

/**
 * Fetches both sources and stitches them into a structure the UI can render:
 *  - countries: [{ code, name, flag, channelCount }] sorted by channel count
 *  - channelsByCountry: { [code]: Channel[] }
 *  - sportsChannels: Channel[]
 *  - categories: [{ id, name, count }]
 *  - channelsByCategory: { [categoryId]: Channel[] }
 *
 * A "Channel" is augmented with `streams` (playable URLs, best quality first),
 * `logo`, `quality`/`maxHeight`, and `providers` (which sources it came from).
 * Channels that appear in both sources are merged into one card whose stream
 * list pools every source — so the player has more fallbacks. Only channels
 * with at least one playable stream are included.
 */
export async function loadData() {
  const [channels, streams, countries, categories, logos, freetv, iptvListText, sky] =
    await Promise.all([
      getJSON(ENDPOINTS.channels),
      getJSON(ENDPOINTS.streams),
      getJSON(ENDPOINTS.countries),
      getJSON(ENDPOINTS.categories),
      getJSON(ENDPOINTS.logos).catch(() => []), // logos is optional
      loadFreeTV(), // bonus source; resolves to [] if unreachable
      fetchText(IPTVLIST_URL), // parsed below (needs country names first)
      loadSky(), // bundled pack; resolves to [] if missing
    ])

  // Index iptv-org streams by the channel id they belong to.
  const streamsByChannel = new Map()
  for (const s of streams) {
    if (!s.channel || !s.url) continue
    if (!streamsByChannel.has(s.channel)) streamsByChannel.set(s.channel, [])
    streamsByChannel.get(s.channel).push({ ...s, provider: 'iptv-org' })
  }

  // Pick the best logo per channel (prefer PNG/SVG, any works).
  const logoByChannel = new Map()
  for (const l of logos) {
    if (!l.channel || !l.url) continue
    if (!logoByChannel.has(l.channel)) logoByChannel.set(l.channel, l.url)
  }

  const countryByCode = new Map(countries.map((c) => [c.code, c]))
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const validCountryCodes = new Set(countryByCode.keys())
  const countryNameToCode = new Map(countries.map((c) => [c.name.toLowerCase(), c.code]))
  // Categories for EVERY iptv-org channel id (even ones without streams), so we
  // can classify an M3U channel that shares the same id (e.g. sports).
  const categoriesById = new Map(channels.map((c) => [c.id, c.categories || []]))

  // iptvlist groups by country name, so it needs the name->code map to parse.
  const iptvlist = parseIptvList(iptvListText, countryNameToCode)

  const enrich = (code) => ({
    countryName: countryByCode.get(code)?.name || code || 'Unknown',
    countryFlag: countryByCode.get(code)?.flag || '🏳️',
  })

  // Unified channel directory keyed by id.
  const byId = new Map()

  // 1) iptv-org channels (the larger, quality-annotated source).
  for (const ch of channels) {
    const chStreams = streamsByChannel.get(ch.id)
    if (!chStreams || chStreams.length === 0) continue // skip unwatchable
    if (ch.is_nsfw) continue // keep the dashboard family-safe

    const code = ch.country || 'ZZ'
    byId.set(ch.id, {
      id: ch.id,
      name: ch.name,
      categories: [...(ch.categories || [])],
      country: code,
      website: ch.website || null,
      logo: logoByChannel.get(ch.id) || null,
      streams: chStreams,
      providers: new Set(['iptv-org']),
      ...enrich(code),
    })
  }

  // Name index over the channels so far, so M3U entries can attach to an
  // existing same-name channel (pooling streams as cross-source fallbacks)
  // even when their ids differ.
  const byNameKey = new Map()
  for (const ch of byId.values()) {
    const k = nameKey(ch.name, ch.country)
    if (k && !byNameKey.has(k)) byNameKey.set(k, ch)
  }

  // 2) Merge each M3U source: fold into an existing channel — matched first by
  //    id, then by normalized name+country — or add it as a new channel.
  const mergeSource = (entries, provider) => {
    for (const e of entries) {
      const code = validCountryCodes.has(e.country) ? e.country : 'ZZ'
      const stream = { url: e.url, quality: null, title: e.name, provider }
      const key = nameKey(e.name, code)
      const target = byId.get(e.id) || (key ? byNameKey.get(key) : null)

      if (target) {
        if (!target.streams.some((s) => s.url === e.url)) target.streams.push(stream)
        target.providers.add(provider)
        if (!target.logo && e.logo) target.logo = e.logo
      } else {
        // Prefer iptv-org's real categories for this id if we know them.
        const known = categoriesById.get(e.id)
        const cats = known && known.length ? known : e.categories
        const ch = {
          id: e.id,
          name: e.name,
          categories: [...cats],
          country: code,
          website: null,
          logo: e.logo || null,
          streams: [stream],
          providers: new Set([provider]),
          ...enrich(code),
        }
        byId.set(e.id, ch)
        if (key && !byNameKey.has(key)) byNameKey.set(key, ch)
      }
    }
  }
  mergeSource(freetv, 'Free-TV')
  mergeSource(iptvlist, 'iptvlist')
  mergeSource(sky, 'Sky')

  // 3) Finalize each channel and build the groupings.
  const channelsByCountry = {}
  const channelsByCategory = {}
  const sportsChannels = []
  const playable = []

  for (const ch of byId.values()) {
    // Highest-resolution stream first, so both the badge and the player's
    // default source reflect the best available quality.
    ch.streams.sort((a, b) => qualityHeight(b.quality) - qualityHeight(a.quality))
    ch.maxHeight = qualityHeight(ch.streams[0].quality)
    ch.quality = qualityLabel(ch.maxHeight) // '4K' | 'FHD' | 'HD' | 'SD' | null
    ch.providers = [...ch.providers]
    playable.push(ch)

    const code = ch.country || 'ZZ'
    ;(channelsByCountry[code] ||= []).push(ch)
    for (const cat of ch.categories) (channelsByCategory[cat] ||= []).push(ch)
    if (ch.categories.includes('sports')) sportsChannels.push(ch)
  }

  // Sort channels alphabetically within each bucket.
  const byName = (a, b) => a.name.localeCompare(b.name)
  for (const code in channelsByCountry) channelsByCountry[code].sort(byName)
  for (const cat in channelsByCategory) channelsByCategory[cat].sort(byName)
  sportsChannels.sort(byName)

  // Country list, richest first — but keep the catch-all "Other" bucket last.
  const countryList = Object.keys(channelsByCountry)
    .map((code) => ({
      code,
      name: code === 'ZZ' ? 'Other' : countryByCode.get(code)?.name || code,
      flag: countryByCode.get(code)?.flag || '🏳️',
      channelCount: channelsByCountry[code].length,
    }))
    .sort((a, b) => {
      if (a.code === 'ZZ') return 1
      if (b.code === 'ZZ') return -1
      return b.channelCount - a.channelCount || a.name.localeCompare(b.name)
    })

  // Category list with counts (excluding empty ones), nicest first.
  const categoryList = Object.keys(channelsByCategory)
    .map((id) => ({
      id,
      name: categoryById.get(id)?.name || id,
      count: channelsByCategory[id].length,
    }))
    .sort((a, b) => b.count - a.count)

  return {
    totalChannels: playable.length,
    countries: countryList,
    channelsByCountry,
    categories: categoryList,
    channelsByCategory,
    sportsChannels,
  }
}
