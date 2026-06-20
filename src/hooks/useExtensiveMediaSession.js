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
      onPlay: () => {
        const audio = audioPlayer.audioRef?.current;
        if (audio) audio.play().catch(console.error);
      },
      onPause: () => {
        audioPlayer.audioRef?.current?.pause();
      },
      onNext: onNext,
      onPrevious: onPrev,
    });

    return () => clearMediaSessionHandlers();
  }, [enabled, current?.id, current?.item, audioPlayer, onNext, onPrev]);
}
