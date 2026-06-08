/** A single clickable channel tile (Netflix-style, hover-reveal overlay). */
export default function ChannelCard({ channel, onPlay }) {
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
