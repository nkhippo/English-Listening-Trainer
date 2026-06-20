import { useEffect } from 'react';
import {
  updateMediaSession,
  setMediaSessionHandlers,
  clearMediaSessionHandlers,
  passageMediaMetadata,
} from '../core/audio/mediaSession.js';

export function useExtensiveMediaSession({
  enabled,
  current,
  audioPlayer,
  onNext,
  onPrev,
}) {
  useEffect(() => {
    if (!enabled || !current?.item) {
      clearMediaSessionHandlers();
      return undefined;
    }

    updateMediaSession(passageMediaMetadata(current.item));

    setMediaSessionHandlers({
      onPlay: () => audioPlayer.resume?.(),
      onPause: () => audioPlayer.pause?.(),
      onNext: onNext,
      onPrevious: onPrev,
    });

    return () => clearMediaSessionHandlers();
  }, [enabled, current?.id, current?.item, audioPlayer, onNext, onPrev]);
}
