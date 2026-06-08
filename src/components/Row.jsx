import { useRef } from 'react'
import ChannelCard from './ChannelCard.jsx'

/** A Netflix-style horizontal carousel of channel tiles with arrow controls. */
export default function Row({ title, channels, onPlay }) {
  const trackRef = useRef(null)
  if (!channels || channels.length === 0) return null

  const scroll = (dir) => {
    const el = trackRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.88, behavior: 'smooth' })
  }

  return (
    <section className="row">
      <h2 className="row-title">{title}</h2>
      <div className="row-wrap">
        <button className="row-arrow left" onClick={() => scroll(-1)} aria-label="Scroll left">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div className="row-track" ref={trackRef}>
          {channels.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} onPlay={onPlay} />
          ))}
        </div>
        <button className="row-arrow right" onClick={() => scroll(1)} aria-label="Scroll right">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>
    </section>
  )
}
