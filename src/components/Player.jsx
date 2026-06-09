import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { ScreenOrientation } from '@capacitor/screen-orientation'

// Running inside the APK (Capacitor WebView), tagged via user-agent.
const IN_APP = typeof navigator !== 'undefined' && /UltimateChannelsApp/.test(navigator.userAgent)

// Route a stream through the local proxy, carrying any header hints the source
// provided (iptv-org streams sometimes specify a referrer / user_agent).
function proxiedUrl(stream) {
  const params = new URLSearchParams({ url: stream.url })
  if (stream.referrer) params.set('referer', stream.referrer)
  if (stream.user_agent) params.set('ua', stream.user_agent)
  return `/proxy?${params.toString()}`
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
export default function Player({ channel, onClose }) {
  const videoRef = useRef(null)
  const wrapRef = useRef(null)
  const hlsRef = useRef(null)
  const [streamIndex, setStreamIndex] = useState(0)
  const [proxied, setProxied] = useState(true)
  const [status, setStatus] = useState('loading') // loading | playing | error
  const [isFs, setIsFs] = useState(false)

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
    setProxied(true)
  }, [channel?.id])

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

  useEffect(() => {
    const video = videoRef.current
    if (!video || !current) return

    setStatus('loading')
    const url = proxied ? proxiedUrl(current) : current.url

    // On a fatal failure: try the same source directly, then auto-advance to
    // the next pooled source (proxy again), and only error once all are spent.
    const onFail = () => {
      if (proxied) {
        setProxied(false)
      } else if (streamIndex < streams.length - 1) {
        setProxied(true)
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
        maxBufferLength: 30,
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
      <div className={`player-modal${isFs ? ' fs' : ''}`} onClick={(e) => e.stopPropagation()}>
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
          {streams.length > 1 && (
            <button className="btn ghost" onClick={tryNextStream} disabled={streamIndex >= streams.length - 1}>
              Switch source
            </button>
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
