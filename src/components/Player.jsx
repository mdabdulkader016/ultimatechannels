import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { ScreenOrientation } from '@capacitor/screen-orientation'

// Running inside the APK (Capacitor WebView), tagged via user-agent.
const IN_APP = typeof navigator !== 'undefined' && /UltimateChannelsApp/.test(navigator.userAgent)

// Route a stream through the local proxy, carrying any header hints the source
// provided (iptv-org streams sometimes specify a referrer / user_agent).
function proxiedUrl(stream, base = '/proxy') {
  const params = new URLSearchParams({ url: stream.url })
  if (stream.referrer) params.set('referer', stream.referrer)
  if (stream.user_agent) params.set('ua', stream.user_agent)
  return `${base}?${params.toString()}`
}

// EU/European channels proxy via the Frankfurt edge (/proxy-eu); everything
// else uses the default Mumbai edge (/proxy).
const EU_COUNTRIES = new Set([
  'AL', 'AT', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
  'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV', 'LT', 'LU', 'MT', 'MD', 'ME', 'NL',
  'MK', 'NO', 'PL', 'PT', 'RO', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB',
])
function proxyBaseFor(channel) {
  return EU_COUNTRIES.has(channel?.country) ? '/proxy-eu' : '/proxy'
}

// CDNs known to send CORS headers → play these DIRECTLY (fast, no proxy).
// These cover the Bangladeshi + sports/FIFA feeds. Everything else (Indian and
// other channels that usually lack CORS) starts via the proxy for reliability.
const DIRECT_HOSTS = /(^|\.)(gpcdn\.net|aynaott\.com|sunplex\.live|ottplus\.bd|amagi\.tv|shahid\.net|mangomolo\.com|kwikmotion\.com)$/i

// Decide whether a source should START on the proxy. http must (mixed-content);
// known CORS hosts go direct; everything else proxies first. The player still
// falls back to the other transport on failure either way.
function startProxied(stream) {
  const url = stream?.url || ''
  if (!/^https:/i.test(url)) return true // http → must use proxy
  try {
    if (DIRECT_HOSTS.test(new URL(url).hostname)) return false // CORS-friendly → direct
  } catch { /* fall through */ }
  return true // default: proxy-first (more reliable for no-CORS streams)
}

/**
 * Plays an HLS (.m3u8) stream. Uses native playback on Safari/iOS and hls.js
 * everywhere else.
 *
 * Each source is attempted twice: first through the local /proxy (which fixes
 * the common browser blockers — no CORS header, http mixed-content, required
 * Referer/User-Agent), then directly as a fallback if the proxy is unavailable.
 * Only after both fail do we fall through to the channel's next source.
 */
export default function Player({ channel, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const videoRef = useRef(null)
  const wrapRef = useRef(null)
  const hlsRef = useRef(null)
  const [streamIndex, setStreamIndex] = useState(0)
  const [proxied, setProxied] = useState(true)
  const [status, setStatus] = useState('loading') // loading | playing | error
  const [isFs, setIsFs] = useState(false)
  const [controlsOn, setControlsOn] = useState(true)
  const hideTimer = useRef(null)
  const [levels, setLevels] = useState([]) // available quality renditions
  const [selLevel, setSelLevel] = useState(-1) // -1 = Auto
  const [qOpen, setQOpen] = useState(false)

  const pickQuality = (i) => {
    setSelLevel(i)
    setQOpen(false)
    if (hlsRef.current) hlsRef.current.currentLevel = i // -1 → Auto (ABR)
  }

  const streams = channel?.streams || []
  const current = streams[streamIndex]

  // Fullscreen is a CSS overlay (works in the WebView, which lacks the HTML5
  // Fullscreen API) plus a native landscape lock via the Capacitor plugin.
  const lockLandscape = () => { try { ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {}) } catch { /* noop */ } }
  const unlockOrient = () => { try { ScreenOrientation.unlock().catch(() => {}) } catch { /* noop */ } }

  const enterFs = async (lock = true) => {
    setIsFs(true)
    // In a real browser, also use the native Fullscreen API (hides chrome).
    const el = wrapRef.current
    if (!IN_APP && el?.requestFullscreen) { try { await el.requestFullscreen() } catch { /* noop */ } }
    if (lock) lockLandscape()
  }
  const exitFs = () => {
    setIsFs(false)
    unlockOrient()
    if (!IN_APP && (document.fullscreenElement || document.webkitFullscreenElement)) {
      try { (document.exitFullscreen || document.webkitExitFullscreen).call(document) } catch { /* noop */ }
    }
  }
  const toggleFullscreen = () => { isFs ? exitFs() : enterFs(true) }

  useEffect(() => {
    setStreamIndex(0)
    setProxied(startProxied(streams[0]))
    setLevels([])
    setSelLevel(-1)
    setQOpen(false)
  }, [channel?.id])

  // Open straight into fullscreen on TVs / already-landscape screens (a TV is
  // always landscape, so the "orientationchange" listener below never fires —
  // and the windowed modal overflows a TV's viewport). Runs once on open.
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(orientation: landscape)').matches) setIsFs(true)
  }, [])

  // Rotate the device to landscape → show fullscreen; back to portrait → exit.
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)')
    const onChange = (e) => {
      if (e.matches) setIsFs(true)
      else { setIsFs(false); unlockOrient() }
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  // Always release any orientation lock when the player closes.
  useEffect(() => () => { unlockOrient() }, [])

  // Auto-hide the controls after 5s of no activity; any input brings them back.
  useEffect(() => {
    const show = () => {
      setControlsOn(true)
      clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setControlsOn(false), 5000)
    }
    show()
    const events = ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'click']
    events.forEach((e) => document.addEventListener(e, show))
    return () => {
      clearTimeout(hideTimer.current)
      events.forEach((e) => document.removeEventListener(e, show))
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !current) return

    setStatus('loading')
    const url = proxied ? proxiedUrl(current, proxyBaseFor(channel)) : current.url

    // On a fatal failure: try the OTHER transport once (direct↔proxy) for this
    // source, then advance to the next pooled source, erroring only when spent.
    const onFail = () => {
      if (!proxied && /^https:/i.test(current.url)) {
        setProxied(true) // direct attempt failed → retry via proxy
      } else if (streamIndex < streams.length - 1) {
        const next = streams[streamIndex + 1]
        setProxied(startProxied(next))
        setStreamIndex((i) => i + 1)
      } else {
        setStatus('error')
      }
    }

    // Native HLS (Safari).
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      const onLoaded = () => {
        setStatus('playing')
        video.play().catch(() => {})
      }
      video.addEventListener('loadedmetadata', onLoaded)
      video.addEventListener('error', onFail)
      return () => {
        video.removeEventListener('loadedmetadata', onLoaded)
        video.removeEventListener('error', onFail)
        video.src = ''
      }
    }

    // hls.js everywhere else. Generous timeouts/retries so a working-but-slow
    // proxy stream isn't dropped to the (usually doomed) direct attempt early.
    if (Hls.isSupported()) {
      const hls = new Hls({
        // ---- Fast channel start (RoarZone-style live tuning) ----
        // Start playback ~3 segments back from the live edge so only a couple
        // of segments must download before the first frame, instead of filling
        // a deep buffer first. lowLatencyMode stays OFF — these public streams
        // aren't LL-HLS, so it would only add partial-segment churn.
        lowLatencyMode: false,
        liveSyncDurationCount: 3,        // begin ~3 segments behind the live edge
        maxLiveSyncPlaybackRate: 1.5,    // catch up to live by speeding up slightly, not a jarring seek
        // Shallower forward buffer → reaches "enough to play" sooner and stays
        // near the live edge. Kept well above RoarZone's aggressive 6s, though,
        // because our sources are public/flaky and need cushion to ride out
        // hiccups without stalling.
        maxBufferLength: 12,
        backBufferLength: 30,            // evict stale back-buffer (frees memory; we never seek back on live)
        // Cap the rendition to the on-screen player size: a small windowed
        // player decodes a lighter (lower-res) variant → smooth on weak
        // devices/TVs; fullscreen gets the full-quality rendition.
        capLevelToPlayerSize: true,
        // Faster, sharper start: assume a healthy connection and skip the
        // bandwidth "probe" so ABR begins on a good rendition instead of
        // ramping up from the lowest (blurry) one.
        abrEwmaDefaultEstimate: 3_000_000, // assume ~3 Mbps available
        testBandwidth: false,
        startFragPrefetch: true,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 800,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 30000,
        fragLoadingMaxRetry: 4,
      })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus('playing')
        video.play().catch(() => {})
        // Expose selectable quality levels (YouTube-style menu).
        setLevels((hls.levels || []).map((l, i) => ({ i, height: l.height || 0, bitrate: l.bitrate || 0 })))
        setSelLevel(-1) // start on Auto
      })
      // hls.js can often recover from a fatal network/media error in place; give
      // it one chance before we abandon this attempt.
      let recovered = false
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return
        if (!recovered && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          recovered = true
          hls.recoverMediaError()
          return
        }
        onFail()
      })
      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    }

    setStatus('error')
  }, [current, proxied])

  const tryNextStream = () => {
    if (streamIndex < streams.length - 1) {
      setProxied(true)
      setStreamIndex((i) => i + 1)
    }
  }

  if (!channel) return null

  return (
    <div className="player-overlay" onClick={onClose}>
      <div className={`player-modal${isFs ? ' fs' : ''}${controlsOn ? '' : ' hide-controls'}`} onClick={(e) => e.stopPropagation()}>
        {isFs && (
          <button className="fs-exit" onClick={exitFs} aria-label="Exit fullscreen">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        )}
        <div className="player-header">
          <div className="player-title">
            {channel.logo && (
              <img className="player-logo" src={channel.logo} alt="" loading="lazy" />
            )}
            <div>
              <h2>{channel.name}</h2>
              <span className="player-sub">
                {channel.countryFlag} {channel.countryName}
                {current?.quality ? ` · ${current.quality}` : ''}
              </span>
            </div>
          </div>
          <button className="player-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="player-video-wrap" ref={wrapRef}>
          <video ref={videoRef} controls autoPlay playsInline className="player-video" />
          {status === 'loading' && (
            <div className="player-status">
              <div className="spinner" />
              <p className="muted">Connecting…</p>
            </div>
          )}
          {status === 'error' && (
            <div className="player-status error">
              <p>This source didn’t load.</p>
              {streamIndex < streams.length - 1 ? (
                <button className="btn" onClick={tryNextStream}>
                  Try next source ({streamIndex + 2}/{streams.length})
                </button>
              ) : (
                <p className="muted">
                  No more sources. The stream may be offline or geo-restricted.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="player-footer">
          <span className="muted">
            Source {streamIndex + 1} of {streams.length}
            {proxied ? ' · via proxy' : ' · direct'}
          </span>
          {onPrev && (
            <button className="btn ghost" onClick={onPrev} disabled={!hasPrev} aria-label="Previous channel"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zM20 6v12l-9-6z" /></svg>
              Prev
            </button>
          )}
          {onNext && (
            <button className="btn ghost" onClick={onNext} disabled={!hasNext} aria-label="Next channel"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM4 6l9 6-9 6z" /></svg>
              Next
            </button>
          )}
          {streams.length > 1 && (
            <button className="btn ghost" onClick={tryNextStream} disabled={streamIndex >= streams.length - 1}>
              Switch source
            </button>
          )}
          {levels.length > 1 && (
            <div className="qmenu">
              <button className="btn ghost" onClick={() => setQOpen((o) => !o)} aria-label="Quality">
                {selLevel === -1 ? 'Auto' : `${levels.find((l) => l.i === selLevel)?.height}p`} ▾
              </button>
              {qOpen && (
                <div className="qmenu-panel">
                  <button className={`qmenu-item ${selLevel === -1 ? 'active' : ''}`} onClick={() => pickQuality(-1)}>Auto</button>
                  {[...levels].sort((a, b) => b.height - a.height).map((l) => (
                    <button key={l.i} className={`qmenu-item ${selLevel === l.i ? 'active' : ''}`} onClick={() => pickQuality(l.i)}>
                      {l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}k`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="btn ghost" onClick={toggleFullscreen} aria-label="Fullscreen"
            style={{ display: 'inline-flex', alignItems: 'center' }}>
            {isFs ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
              </svg>
            )}
            <span style={{ marginLeft: 6 }}>{isFs ? 'Exit' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
