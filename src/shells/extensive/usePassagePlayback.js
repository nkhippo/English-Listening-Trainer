import { useEffect, useRef, useCallback } from 'react';
import { passageMediaMetadata } from '../../core/audio/mediaSession.js';

export function usePassagePlayback({
  audioUrl,
  itemId,
  item,
  audioPlayer,
  playbackRate = 1,
  onEnded,
  autoPlayAfterMs = 0,
  onAutoPlayStarted,
}) {
  const playedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const prevItemIdRef = useRef(itemId);
  if (prevItemIdRef.current !== itemId) {
    prevItemIdRef.current = itemId;
    playedRef.current = false;
  }

  const attachEndedHandler = useCallback((audio) => {
    if (!audio) return undefined;
    const handler = () => onEndedRef.current?.();
    audio.addEventListener('ended', handler);
    return () => audio.removeEventListener('ended', handler);
  }, []);

  const startPlayback = useCallback(() => {
    playedRef.current = true;
    const audio = audioPlayer.play(audioUrl, itemId, {
      showProgress: true,
      playbackRate,
      metadata: passageMediaMetadata(item),
    });
    onAutoPlayStarted?.();
    return attachEndedHandler(audio);
  }, [audioUrl, itemId, item, audioPlayer, playbackRate, attachEndedHandler, onAutoPlayStarted]);

  useEffect(() => {
    if (!audioUrl) return undefined;
    const existing = audioPlayer.audioRef?.current;
    if (audioPlayer.activeKey === itemId && existing && !existing.paused && !existing.ended) {
      playedRef.current = true;
      return attachEndedHandler(existing);
    }
    if (playedRef.current) return undefined;

    const delay = autoPlayAfterMs > 0 ? autoPlayAfterMs : 0;
    let cleanupEnded;
    const timer = setTimeout(() => {
      cleanupEnded = startPlayback();
    }, delay);

    return () => {
      clearTimeout(timer);
      cleanupEnded?.();
    };
  }, [audioUrl, itemId, audioPlayer, autoPlayAfterMs, attachEndedHandler, startPlayback]);

  return { startPlayback, playedRef };
}
