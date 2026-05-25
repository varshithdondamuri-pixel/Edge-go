import { useRef } from 'react'

const NUM_BARS = 8

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function MusicPlayer({
  media, settings = {}, onPlayPause, onNext, onPrev, onVolumeChange, onSeek,
}) {
  const {
    title = 'No media playing',
    artist = 'Start audio in any Windows media app',
    source,
    albumArt,
    isPlaying,
    volume,
    position,
    duration,
  } = media
  const progressRef = useRef(null)
  const displayTitle = title || 'No media playing'
  const displayArtist = artist || 'Start audio in any Windows media app'

  const handleProgressClick = (e) => {
    if (!progressRef.current || !duration) return
    const rect = progressRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek(Math.round(ratio * duration))
  }

  const progressPct = duration > 0 ? (position / duration) * 100 : 0

  return (
    <div className="music-player">
      {/* Album art + info */}
      <div className="mp-top">
        {settings.showAlbumArt !== false && (
          <div className="album-art">
            {albumArt
              ? <img src={albumArt} alt={`${displayTitle} album art`} />
              : <div className="album-art-placeholder"><span>🎵</span></div>
            }
          </div>
        )}

        <div className="mp-info">
          <div className="mp-title" title={displayTitle}>{displayTitle}</div>
          <div className="mp-artist" title={displayArtist}>{displayArtist}</div>
          {source && <div className="mp-source">{source}</div>}
        </div>

        {/* Visualizer */}
        {settings.showVisualizer !== false && (
          <div className={`visualizer ${isPlaying ? 'playing' : 'paused'}`} aria-hidden="true">
            {Array.from({ length: NUM_BARS }, (_, i) => (
              <div
                key={i}
                className="viz-bar"
                style={{ animationDuration: `${0.35 + (i % 4) * 0.12}s` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {settings.showProgressBar !== false && (
        <div className="mp-progress-row">
          <span className="mp-time">{formatTime(position)}</span>
          <div
            ref={progressRef}
            className="mp-progress-track"
            onClick={handleProgressClick}
            role="slider"
            aria-label="Track position"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={position}
            tabIndex={0}
          >
            <div className="mp-progress-fill" style={{ width: `${progressPct}%` }}>
              <div className="mp-progress-thumb" />
            </div>
          </div>
          <span className="mp-time">{formatTime(duration)}</span>
        </div>
      )}

      {/* Controls + volume */}
      <div className="mp-controls">
        <div className="vol-mini">
          <span className="vol-icon">
            {volume === 0 ? '🔇' : volume < 40 ? '🔈' : '🔊'}
          </span>
          <input
            type="range"
            className="vol-slider"
            min={0} max={100}
            value={volume}
            onChange={e => onVolumeChange(Number(e.target.value))}
            aria-label="Volume"
          />
        </div>

        <div className="controls-row">
          <button id="btn-prev" className="ctrl-btn" onClick={onPrev} aria-label="Previous track">
            <PrevIcon />
          </button>
          <button
            id="btn-play-pause"
            className="ctrl-btn play-pause"
            onClick={onPlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button id="btn-next" className="ctrl-btn" onClick={onNext} aria-label="Next track">
            <NextIcon />
          </button>
        </div>

        {/* Spacer to keep controls centered */}
        <div style={{ width: 80 }} />
      </div>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  )
}

function PrevIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z" />
    </svg>
  )
}
