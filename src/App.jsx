import { useEffect, useMemo, useRef, useState } from 'react'
import { loadData } from './api.js'
import ChannelGrid from './components/ChannelGrid.jsx'
import Row from './components/Row.jsx'
import Player from './components/Player.jsx'

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'countries', label: 'Countries' },
  { id: 'all', label: 'All Channels' },
]

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h18M6 12h12M10 19h4" />
    </svg>
  )
}

function CrownIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 7l4 4 5-7 5 7 4-4-1.5 12h-15L3 7zm2.8 10h12.4l.3-2H5.5l.3 2z" />
    </svg>
  )
}

// Country codes hidden from non-VIP users (and from search).
const RESTRICTED_COUNTRIES = new Set(['BD'])

// Categories surfaced in the filter menu (by friendly name → iptv-org id).
const CATEGORY_FILTERS = [
  { id: 'sports', label: 'Sports' },
  { id: 'movies', label: 'Movies' },
  { id: 'news', label: 'News' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'music', label: 'Music' },
  { id: 'kids', label: 'Kids' },
  { id: 'documentary', label: 'Documentary' },
  { id: 'series', label: 'Series' },
  { id: 'general', label: 'General' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'religious', label: 'Religious' },
]

const PAGE_SIZE = 120
const ROW_SIZE = 24 // tiles per carousel
const MAX_CAT_ROWS = 16
const MAX_COUNTRY_ROWS = 6

// Resolution filters. `min`/`max` are stream heights in pixels; a channel
// passes if its best stream (maxHeight) falls in range.
const QUALITY_FILTERS = [
  { id: 'all', label: 'All', min: 0, max: Infinity },
  { id: '4k', label: '4K', min: 2160, max: Infinity },
  { id: 'fhd', label: 'FHD', min: 1080, max: 2159 },
  { id: 'hd', label: 'HD', min: 720, max: 1079 },
  { id: 'sd', label: 'SD', min: 1, max: 719 },
]

// Hero slideshow images (served from public/Featured Image).
const HERO_IMAGES = [
  '/Featured Image/neymar_ians-2.webp', // Neymar
  '/Featured Image/aed8f5bb6e30-gettyimages-2241045900.webp', // Ronaldo
  '/Featured Image/250905-messi-rs-45b0a9.webp', // Messi
  '/Featured Image/PSG-17601.jpg', // Mbappé
]

// Find the FIFA channel to link the hero to. Prefer a clean "FIFA TV"/"FIFA+",
// then the main World Cup feed, and avoid the "[coming]" placeholders.
function findFifa(data) {
  const fifa = Object.values(data.channelsByCountry).flat().filter((c) => /fifa/i.test(c.name))
  if (!fifa.length) return null
  const score = (c) => {
    const n = c.name.toLowerCase()
    if (/\[coming\]/.test(n)) return 0
    if (/fifa\s*\+|fifa\s*tv/.test(n)) return 3
    if (/world cup 2026/.test(n)) return 2
    return 1
  }
  return fifa.sort((a, b) => score(b) - score(a) || (b.logo ? 1 : 0) - (a.logo ? 1 : 0))[0]
}

// Order channels for the homepage carousels so the most presentable, most
// likely-to-work ones lead: those with a logo (icon) first, then more stream
// fallbacks (better odds of playing), then higher quality.
function rankHome(list) {
  return [...list].sort((a, b) => {
    const logo = (b.logo ? 1 : 0) - (a.logo ? 1 : 0)
    if (logo) return logo
    const streams = (b.streams?.length || 0) - (a.streams?.length || 0)
    if (streams) return streams
    return (b.maxHeight || 0) - (a.maxHeight || 0)
  })
}

// Pick a hero channel: the FIFA channel if present, else a sports channel.
function pickFeatured(data) {
  const pool = data.sportsChannels.length
    ? data.sportsChannels
    : Object.values(data.channelsByCountry).flat()
  return findFifa(data) || pool.find((c) => c.logo) || pool[0] || null
}

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('home')
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [search, setSearch] = useState('')
  const [quality, setQuality] = useState('all')
  const [category, setCategory] = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [playing, setPlaying] = useState(null)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const filterRef = useRef(null)

  const [vip, setVip] = useState(() => localStorage.getItem('vip') === '1')
  const [vipOpen, setVipOpen] = useState(false)
  const [vipInput, setVipInput] = useState('')
  const [vipError, setVipError] = useState(false)
  const vipRef = useRef(null)

  useEffect(() => {
    loadData().then(setData).catch((e) => setError(e.message))
  }, [])

  // Reset paging whenever the active view changes.
  useEffect(() => setLimit(PAGE_SIZE), [tab, selectedCountry, search, quality, category])

  // Close the filter menu on an outside click or Escape.
  useEffect(() => {
    if (!filterOpen) return
    const onDown = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setFilterOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [filterOpen])

  // Close the VIP popover on an outside click or Escape.
  useEffect(() => {
    if (!vipOpen) return
    const onDown = (e) => { if (vipRef.current && !vipRef.current.contains(e.target)) setVipOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setVipOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [vipOpen])

  const submitVip = async (e) => {
    e.preventDefault()
    const code = vipInput.trim()
    if (!code) return
    try {
      const res = await fetch(`/api/vip?code=${encodeURIComponent(code)}`)
      const json = await res.json()
      if (json.ok) {
        setVip(true)
        localStorage.setItem('vip', '1')
        setVipOpen(false)
        setVipInput('')
        setVipError(false)
      } else {
        setVipError(true)
      }
    } catch {
      setVipError(true)
    }
  }

  const signOutVip = () => {
    setVip(false)
    localStorage.removeItem('vip')
    setVipOpen(false)
  }

  const filter = (list) => {
    const q = search.trim().toLowerCase()
    const qf = QUALITY_FILTERS.find((f) => f.id === quality)
    return list.filter((ch) => {
      if (!vip && RESTRICTED_COUNTRIES.has(ch.country)) return false
      const h = ch.maxHeight || 0
      if (h < qf.min || h > qf.max) return false
      if (category !== 'all' && !(ch.categories || []).includes(category)) return false
      if (!q) return true
      return (
        ch.name.toLowerCase().includes(q) ||
        ch.countryName.toLowerCase().includes(q) ||
        (ch.categories || []).some((c) => c.includes(q))
      )
    })
  }

  const filteredCountries = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const base = data.countries.filter((c) => vip || !RESTRICTED_COUNTRIES.has(c.code))
    if (!q) return base
    return base.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    )
  }, [data, search, vip])

  if (error) {
    return (
      <div className="state">
        <h1>Couldn’t load channels</h1>
        <p className="muted">{error}</p>
        <button className="btn" onClick={() => location.reload()}>Retry</button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="state">
        <div className="spinner" />
        <h1>Loading channels…</h1>
        <p className="muted">Fetching the latest IPTV directory. This can take a few seconds.</p>
      </div>
    )
  }

  // ---- Home: hero billboard + category & country carousels ----
  const renderHome = () => {
    const q = search.trim().toLowerCase()
    // Active search or category collapses the carousels into a focused grid.
    if (q || category !== 'all') {
      const all = Object.values(data.channelsByCountry).flat()
      const list = filter(all)
      const catName = data.categories.find((c) => c.id === category)?.name || category
      const title = q ? `Results for “${search}”` : catName
      return (
        <div className="page">
          <SectionHeader
            title={<span className="cap">{title}</span>}
            subtitle={`${list.length} channel${list.length === 1 ? '' : 's'}`}
          />
          <ChannelGrid channels={list.slice(0, limit)} onPlay={setPlaying} />
          <LoadMore shown={Math.min(limit, list.length)} total={list.length} onMore={() => setLimit((l) => l + PAGE_SIZE)} />
        </div>
      )
    }

    const featured = pickFeatured(data)
    const catRows = data.categories
      .slice(0, MAX_CAT_ROWS)
      .map((c) => ({ key: `cat:${c.id}`, title: c.name, channels: rankHome(filter(data.channelsByCategory[c.id] || [])).slice(0, ROW_SIZE) }))
      .filter((r) => r.channels.length)
    const countryRows = data.countries
      .filter((c) => c.code !== 'ZZ' && (vip || !RESTRICTED_COUNTRIES.has(c.code)))
      .slice(0, MAX_COUNTRY_ROWS)
      .map((c) => ({ key: `co:${c.code}`, country: c, channels: rankHome(filter(data.channelsByCountry[c.code] || [])).slice(0, ROW_SIZE) }))
      .filter((r) => r.channels.length)

    return (
      <>
        <Hero channel={featured} images={HERO_IMAGES} onPlay={setPlaying} />
        <div className="rows">
          {catRows.map((r) => (
            <Row key={r.key} title={r.title} channels={r.channels} onPlay={setPlaying} />
          ))}
          {countryRows.map((r) => (
            <Row
              key={r.key}
              title={
                <span className="title-with-flag">
                  <Flag code={r.country.code} flag={r.country.flag} className="row-flag" />
                  {r.country.name}
                </span>
              }
              channels={r.channels}
              onPlay={setPlaying}
            />
          ))}
        </div>
      </>
    )
  }

  // Decide what to render in the main area.
  let content
  if (tab === 'home') {
    content = renderHome()
  } else if (tab === 'countries') {
    if (selectedCountry) {
      const list = filter(data.channelsByCountry[selectedCountry.code] || [])
      content = (
        <div className="page">
          <button className="back-link" onClick={() => setSelectedCountry(null)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
            All countries
          </button>
          <SectionHeader
            title={
              <span className="title-with-flag">
                <Flag code={selectedCountry.code} flag={selectedCountry.flag} className="title-flag" />
                {selectedCountry.name}
              </span>
            }
            subtitle={`${list.length} channel${list.length === 1 ? '' : 's'}`}
          />
          <ChannelGrid channels={list.slice(0, limit)} onPlay={setPlaying} />
          <LoadMore shown={Math.min(limit, list.length)} total={list.length} onMore={() => setLimit((l) => l + PAGE_SIZE)} />
        </div>
      )
    } else {
      content = (
        <div className="page">
          <SectionHeader title="Browse by Country" subtitle={`${data.countries.length} countries available`} />
          <div className="country-grid">
            {filteredCountries.map((c) => (
              <button key={c.code} className="country-card" onClick={() => { setSelectedCountry(c); setSearch('') }}>
                <Flag code={c.code} flag={c.flag} className="country-flag" />
                <div className="country-meta">
                  <span className="country-name">{c.name}</span>
                  <span className="country-count">{c.channelCount} channels</span>
                </div>
              </button>
            ))}
            {filteredCountries.length === 0 && <p className="empty">No countries match “{search}”.</p>}
          </div>
        </div>
      )
    }
  } else {
    const all = Object.values(data.channelsByCountry).flat()
    const list = filter(all)
    content = (
      <div className="page">
        <SectionHeader
          title="All Channels"
          subtitle={search ? `${list.length} match${list.length === 1 ? '' : 'es'}` : `${data.totalChannels} channels — use search to narrow down`}
        />
        <ChannelGrid channels={list.slice(0, limit)} onPlay={setPlaying} />
        <LoadMore shown={Math.min(limit, list.length)} total={list.length} onMore={() => setLimit((l) => l + PAGE_SIZE)} />
      </div>
    )
  }

  const searchPlaceholder =
    tab === 'countries' && !selectedCountry ? 'Search countries…' : 'Search channels…'

  // The quality filter only applies to channel lists, so hide it on the
  // country grid (where only country cards are shown).
  const showQualityFilter = !(tab === 'countries' && !selectedCountry)

  return (
    <div className="app">
      <header className="navbar">
        <div className="nav-left">
          <button
            className="logo"
            onClick={() => {
              setTab('home'); setSelectedCountry(null); setSearch(''); setCategory('all'); setQuality('all')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            aria-label="Ultimate Channels — Home"
          >
            <img src="/Ulimate-Channels-Logo.png" alt="Ultimate Channels" />
          </button>
          <nav className="nav-links">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`nav-link ${tab === t.id ? 'active' : ''}`}
                onClick={() => { setTab(t.id); setSelectedCountry(null); setSearch(''); setCategory('all') }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="nav-right">
          {showQualityFilter && (
            <div className="filter" ref={filterRef}>
              <button
                className={`filter-btn ${(quality !== 'all' || category !== 'all') ? 'on' : ''}`}
                onClick={() => setFilterOpen((o) => !o)}
                aria-label="Filters"
                aria-expanded={filterOpen}
              >
                <FilterIcon />
                <span>Filter</span>
                {(quality !== 'all' || category !== 'all') && <span className="filter-dot" />}
              </button>
              {filterOpen && (
                <div className="filter-panel">
                  <div className="filter-group">
                    <span className="filter-label">Quality</span>
                    <div className="seg">
                      {QUALITY_FILTERS.map((f) => (
                        <button
                          key={f.id}
                          className={`seg-item ${quality === f.id ? 'active' : ''}`}
                          onClick={() => setQuality(f.id)}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="filter-group">
                    <span className="filter-label">Category</span>
                    <div className="chip-wrap">
                      <button className={`chip ${category === 'all' ? 'active' : ''}`} onClick={() => setCategory('all')}>
                        All
                      </button>
                      {CATEGORY_FILTERS.map((c) => (
                        <button
                          key={c.id}
                          className={`chip ${category === c.id ? 'active' : ''}`}
                          onClick={() => setCategory(c.id)}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <label className="search-wrap">
            <SearchIcon />
            <input
              className="search"
              type="search"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <div className="vip" ref={vipRef}>
            <button
              className={`vip-btn ${vip ? 'active' : ''}`}
              onClick={() => { setVipOpen((o) => !o); setVipError(false) }}
              aria-label="VIP access"
              aria-expanded={vipOpen}
            >
              <CrownIcon />
            </button>
            {vipOpen && (
              <div className="vip-panel">
                {vip ? (
                  <>
                    <span className="vip-status"><CrownIcon /> VIP active</span>
                    <button className="btn ghost" onClick={signOutVip}>Sign out</button>
                  </>
                ) : (
                  <form className="vip-form" onSubmit={submitVip}>
                    <input
                      className={`vip-input ${vipError ? 'err' : ''}`}
                      type="text"
                      placeholder="Enter VIP code"
                      value={vipInput}
                      onChange={(e) => { setVipInput(e.target.value); setVipError(false) }}
                      autoFocus
                    />
                    <button className="btn vip-submit" type="submit">Unlock</button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="content">{content}</main>

      <footer className="footer">
        <span className="muted">
          Publicly listed free-to-air streams; availability varies by region.
        </span>
      </footer>

      {playing && <Player channel={playing} onClose={() => setPlaying(null)} />}
    </div>
  )
}

// A cinematic billboard: a crossfading slideshow of featured images, with the
// featured channel's title and a Play button linked to it (FIFA).
function Hero({ channel, images, onPlay }) {
  const [idx, setIdx] = useState(0)
  const slides = images || []

  useEffect(() => {
    if (slides.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5500)
    return () => clearInterval(t)
  }, [slides.length])

  if (!channel) return null
  const category = (channel.categories || [])[0] || 'sports'

  return (
    <section className="hero">
      <div className="hero-slides">
        {slides.map((src, i) => (
          <div
            key={src}
            className={`hero-slide ${i === idx ? 'active' : ''}`}
            style={{ backgroundImage: `url("${src}")` }}
          />
        ))}
      </div>
      <div className="hero-scrim" />
      <div className="hero-content">
        <span className="hero-kicker"><span className="dot" />LIVE NOW</span>
        {channel.logo && <img className="hero-logo" src={channel.logo} alt="" />}
        <h1 className="hero-title">{channel.name}</h1>
        <p className="hero-meta">
          {channel.countryName} · <span className="cap">{category}</span>
          {channel.quality ? ` · ${channel.quality}` : ''}
        </p>
        <div className="hero-actions">
          <button className="btn-play" onClick={() => onPlay(channel)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            Play
          </button>
        </div>
      </div>
      {slides.length > 1 && (
        <div className="hero-dots">
          {slides.map((src, i) => (
            <button
              key={src}
              className={`hero-dot ${i === idx ? 'active' : ''}`}
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// Renders a country flag as an image (flagcdn.com, by ISO code). Windows/Chrome
// can't render regional-indicator flag emoji, so we use real images and fall
// back to the emoji only for the catch-all "Other" (ZZ) bucket.
function Flag({ code, flag, className }) {
  if (code && code !== 'ZZ') {
    return (
      <img
        className={className}
        src={`https://flagcdn.com/${code.toLowerCase()}.svg`}
        alt=""
        loading="lazy"
        onError={(e) => { e.currentTarget.replaceWith(document.createTextNode(flag || '🏳️')) }}
      />
    )
  }
  return <span className={className}>{flag || '🏳️'}</span>
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="section-header">
      <h1>{title}</h1>
      <p className="muted">{subtitle}</p>
    </div>
  )
}

function LoadMore({ shown, total, onMore }) {
  if (shown >= total) return null
  return (
    <div className="load-more">
      <button className="btn" onClick={onMore}>
        Show more ({shown} of {total})
      </button>
    </div>
  )
}
