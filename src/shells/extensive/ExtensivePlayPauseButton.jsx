import React from 'react';
import { UI } from '../../core/shared/uiJa.js';

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export default function ExtensivePlayPauseButton({
  itemId, audioPlayer, onPlayStart, stopPropagation = false,
}) {
  const isActive = audioPlayer.activeKey === itemId;
  const audio = audioPlayer.audioRef?.current;
  const isPlaying = isActive && audioPlayer.playing;
  const isPaused = isActive && audio && audio.paused && !audio.ended;

  const label = isPlaying
    ? UI.extensive.audioPause
    : isPaused
      ? UI.extensive.audioResume
      : UI.extensive.audioReplay;

  function handleClick(e) {
    if (stopPropagation) e.stopPropagation();
    if (isPlaying) {
      audioPlayer.pause?.();
      return;
    }
    if (isPaused) {
      audioPlayer.resume?.();
      return;
    }
    onPlayStart?.();
  }

  return (
    <button
      type="button"
      className={`btn btn-icon${isPlaying ? ' btn-icon-pause' : ''}`}
      onClick={handleClick}
      aria-label={label}
    >
      {isPlaying ? <PauseIcon /> : <span aria-hidden="true">▶</span>}
    </button>
  );
}
