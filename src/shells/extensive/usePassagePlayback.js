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

  const audioPlayerRef = useRef(audioPlayer);
  audioPlayerRef.current = audioPlayer;

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
    audioPlayerRef.current.play(audioUrl, itemId, {
      showProgress: true,
      playbackRate,
      metadata: passageMediaMetadata(item),
    });
    onAutoPlayStarted?.();
  }, [audioUrl, itemId, item, playbackRate, onAutoPlayStarted]);

  useEffect(() => {
    if (!audioUrl) return undefined;

    const player = audioPlayerRef.current;
    const existing = player.audioRef?.current;
    if (player.activeKey === itemId && existing && !existing.paused && !existing.ended) {
      playedRef.current = true;
      return undefined;
    }
    if (playedRef.current) return undefined;

    const delay = autoPlayAfterMs > 0 ? autoPlayAfterMs : 0;
    const timer = setTimeout(() => {
      startPlayback();
    }, delay);

    return () => clearTimeout(timer);
  }, [audioUrl, itemId, autoPlayAfterMs, startPlayback]);

  useEffect(() => {
    if (!audioUrl) return undefined;
    const player = audioPlayerRef.current;
    const existing = player.audioRef?.current;
    if (player.activeKey !== itemId || !existing) return undefined;
    return attachEndedHandler(existing);
  }, [audioUrl, itemId, attachEndedHandler, audioPlayer.activeKey]);

  return { startPlayback, playedRef };
}
