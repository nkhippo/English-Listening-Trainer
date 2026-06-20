export function passageMediaMetadata(item, { album = '多聴' } = {}) {
  const text = item?.lines?.[0]?.text || item?.sentence?.split('\n')[0] || '';
  return {
    title: text.slice(0, 80) || 'Listening',
    artist: 'English Listening Trainer',
    album,
  };
}

export function updateMediaSession({ title, artist = 'English Listening Trainer', album = '' }) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'Listening',
      artist,
      album,
    });
  } catch {
    /* MediaMetadata unsupported */
  }
}

export function setMediaPlaybackState(playing) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  } catch {
    /* noop */
  }
}

export function setMediaSessionHandlers(handlers = {}) {
  if (!('mediaSession' in navigator)) return;
  const entries = [
    ['play', handlers.onPlay],
    ['pause', handlers.onPause],
    ['previoustrack', handlers.onPrevious],
    ['nexttrack', handlers.onNext],
  ];
  for (const [action, handler] of entries) {
    try {
      navigator.mediaSession.setActionHandler(action, handler || null);
    } catch {
      /* action unsupported */
    }
  }
}

export function clearMediaSessionHandlers() {
  setMediaSessionHandlers({});
}
