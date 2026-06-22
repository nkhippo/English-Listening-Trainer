import React, { useRef } from 'react';

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export default function AudioProgressBar({
  visible,
  progress,
  playing,
  endlessRepeat,
  playbackRate,
  holding,
  onToggleEndlessRepeat,
  onPause,
  onPlay,
  onSetPlaybackRate,
  onSkipBack,
  onSkipForward,
  onClose,
  onSeekStart,
  onSeekMove,
  onSeekEnd,
}) {
  const trackRef = useRef(null);

  if (!visible) return null;

  function ratioFromEvent(ev) {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const clientX = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function onPointerDown(ev) {
    ev.preventDefault();
    trackRef.current?.setPointerCapture(ev.pointerId);
    onSeekStart(ev.pointerId);
    onSeekMove(ratioFromEvent(ev), ev.pointerId);
  }

  function onPointerMove(ev) {
    onSeekMove(ratioFromEvent(ev), ev.pointerId);
  }

  function onPointerUp(ev) {
    onSeekEnd(ev.pointerId);
    try {
      trackRef.current?.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  }

  const pct = `${Math.round(progress * 100)}%`;

  return (
    <div className="audio-progress-bar" aria-label="Audio playback controls">
      <div className="audio-progress-controls" role="toolbar" aria-label="Playback">
        <div className="audio-progress-controls-main">
          <button
            type="button"
            className={`audio-progress-btn audio-progress-repeat${endlessRepeat ? ' is-active' : ''}`}
            onClick={onToggleEndlessRepeat}
            aria-pressed={endlessRepeat}
            aria-label={endlessRepeat ? 'Repeat on' : 'Repeat off'}
            title="Repeat"
          >
            <RepeatIcon />
            {endlessRepeat && <span className="audio-progress-repeat-badge" aria-hidden="true">1</span>}
          </button>
          <button
            type="button"
            className="audio-progress-btn audio-progress-skip"
            onClick={onSkipBack}
            aria-label="Back 5 seconds"
            title="Back 5 seconds"
          >
            −5s
          </button>
          <button
            type="button"
            className="audio-progress-btn audio-progress-transport"
            onClick={onPause}
            disabled={!playing}
            aria-label="Pause"
            title="Pause"
          >
            <PauseIcon />
          </button>
          <button
            type="button"
            className="audio-progress-btn audio-progress-transport"
            onClick={onPlay}
            aria-label="Play"
            title="Play"
          >
            <span aria-hidden="true">▶</span>
          </button>
          <button
            type="button"
            className="audio-progress-btn audio-progress-skip"
            onClick={onSkipForward}
            aria-label="Forward 5 seconds"
            title="Forward 5 seconds"
          >
            +5s
          </button>
          <button
            type="button"
            className={`audio-progress-btn audio-progress-speed${playbackRate === 1 ? ' is-active' : ''}`}
            onClick={() => onSetPlaybackRate(1)}
            aria-pressed={playbackRate === 1}
            aria-label="Speed 1x"
            title="Speed 1x"
          >
            1x
          </button>
          <button
            type="button"
            className={`audio-progress-btn audio-progress-speed${playbackRate === 0.8 ? ' is-active' : ''}`}
            onClick={() => onSetPlaybackRate(0.8)}
            aria-pressed={playbackRate === 0.8}
            aria-label="Speed 0.8x"
            title="Speed 0.8x"
          >
            0.8x
          </button>
        </div>
        <button
          type="button"
          className="audio-progress-btn audio-progress-close"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          ×
        </button>
      </div>
      <div
        ref={trackRef}
        className={`audio-progress-track${holding ? ' is-holding' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-label="Seek"
      >
        <div className="audio-progress-rail">
          <div className="audio-progress-fill" style={{ width: pct }} />
          <div className="audio-progress-thumb" style={{ left: pct }} />
        </div>
      </div>
    </div>
  );
}
