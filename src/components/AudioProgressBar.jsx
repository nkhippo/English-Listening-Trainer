import React, { useRef } from 'react';

export default function AudioProgressBar({
  visible,
  progress,
  endlessRepeat,
  playbackRate,
  holding,
  onToggleEndlessRepeat,
  onTogglePlaybackRate,
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
  const speedLabel = playbackRate === 1 ? '1.0x' : `${playbackRate}x`;

  return (
    <div className="audio-progress-bar" aria-label="Audio playback position">
      <button
        type="button"
        className={`audio-progress-repeat${endlessRepeat ? ' is-active' : ''}`}
        onClick={onToggleEndlessRepeat}
        aria-pressed={endlessRepeat}
        aria-label={endlessRepeat ? 'Endless repeat on' : 'Endless repeat off'}
        title={endlessRepeat ? 'Endless repeat on (click to turn off)' : 'Endless repeat off (click to turn on)'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M17 1l4 4-4 4" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <path d="M7 23l-4-4 4-4" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
        {endlessRepeat && <span className="audio-progress-repeat-badge" aria-hidden="true">1</span>}
      </button>
      <button
        type="button"
        className={`audio-progress-speed${playbackRate < 1 ? ' is-active' : ''}`}
        onClick={onTogglePlaybackRate}
        aria-label={`Playback speed ${speedLabel}`}
        title={`Playback speed: ${speedLabel} (click to change)`}
      >
        {speedLabel}
      </button>
      <div
        ref={trackRef}
        className={`audio-progress-track${holding ? ' is-holding' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Hold to pause, release to resume"
      >
        <div className="audio-progress-rail">
          <div className="audio-progress-fill" style={{ width: pct }} />
          <div className="audio-progress-thumb" style={{ left: pct }} />
        </div>
      </div>
      <button type="button" className="audio-progress-close" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
  );
}
