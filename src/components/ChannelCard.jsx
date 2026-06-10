import { usePins } from '../pins.js'

// Pushpin glyph — outlined when unpinned, solid-filled when pinned.
function PinIcon({ filled }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5a4 4 0 0 1-2 3.5V14h5v7l1 1 1-1v-7h5v-1.5A4 4 0 0 1 16 9z" />
    </svg>
  )
}

/** A single clickable channel tile (Netflix-style, hover-reveal overlay). */
export default function ChannelCard({ channel, onPlay }) {
  const { pinned, togglePin } = usePins()
  const isPinned = pinned.has(channel.id)

  const initials = channel.name
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  const category = (channel.categories || [])[0] || 'general'

  return (
    <button className="channel-card" onClick={() => onPlay(channel)} title={channel.name}>
      <div className="card-thumb">
        {channel.quality && (
          <span className={`quality-badge q-${channel.quality.toLowerCase()}`}>
            {channel.quality}
          </span>
        )}

        {/* Pin toggle. A <span role=button> rather than a <button> because the
            whole tile is already a <button> (nested buttons are invalid HTML).
            stopPropagation keeps a pin tap from also opening the player. */}
        <span
          className={`card-pin ${isPinned ? 'on' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={isPinned ? `Unpin ${channel.name}` : `Pin ${channel.name}`}
          aria-pressed={isPinned}
          title={isPinned ? 'Unpin' : 'Pin'}
          onClick={(e) => { e.stopPropagation(); togglePin(channel.id) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault(); e.stopPropagation(); togglePin(channel.id)
            }
          }}
        >
          <PinIcon filled={isPinned} />
        </span>
        {channel.logo ? (
          <img
            className="card-logo"
            src={channel.logo}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              e.currentTarget.nextElementSibling.style.display = 'flex'
            }}
          />
        ) : null}
        <span className="channel-fallback" style={{ display: channel.logo ? 'none' : 'flex' }}>
          {initials || 'TV'}
        </span>

        <div className="card-overlay">
          <span className="card-play" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <div className="card-info">
            <span className="card-name">{channel.name}</span>
            <span className="card-sub">{category}</span>
          </div>
        </div>
      </div>
    </button>
  )
}
