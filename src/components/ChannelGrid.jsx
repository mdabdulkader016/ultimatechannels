import ChannelCard from './ChannelCard.jsx'

/** A responsive grid of channel cards, with an empty state. */
export default function ChannelGrid({ channels, onPlay }) {
  if (!channels || channels.length === 0) {
    return <p className="empty">No channels found.</p>
  }
  return (
    <div className="channel-grid">
      {channels.map((ch) => (
        <ChannelCard key={ch.id} channel={ch} onPlay={onPlay} />
      ))}
    </div>
  )
}
