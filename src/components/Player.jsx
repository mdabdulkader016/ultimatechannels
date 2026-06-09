import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

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
  const hlsRef = useRef(null)
  const [streamIndex, setStreamIndex] = useState(0)
  const [proxied, setProxied] = useState(true)
  const [status, setStatus] = useState('loading') // loading | playing | error

  const streams = channel?.streams || []
  const current = streams[streamIndex]

  useEffect(() => {
    setStreamIndex(0)
    setProxied(true)
  }, [channel?.id])

  // When the video goes fullscreen, rotate the device to landscape (and back on
  // exit). Works in the Android WebView / mobile browsers; ignored on desktop.
  useEffect(() => {
    const onFsChange = () => {
      const fs = document.fullscreenElement || document.webkitFullscreenElement
      try {
        if (fs && screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {})
        else if (!fs && screen.orientation?.unlock) screen.orientation.unlock()
      } catch { /* orientation lock unsupported here */ }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
      try { screen.orientation?.unlock?.() } catch { /* noop */ }
    }
  }, [])

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
      <div className="player-modal" onClick={(e) => e.stopPropagation()}>
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

        <div className="player-video-wrap">
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
          {channel.website && (
            <a className="btn ghost" href={channel.website} target="_blank" rel="noreferrer">
              Channel site ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
