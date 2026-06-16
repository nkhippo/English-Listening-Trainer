import { useCallback, useEffect, useRef, useState } from 'react';

export function useAudioPlayer() {
  const audioRef = useRef(null);
  const rafRef = useRef(null);
  const scrubRef = useRef({ active: false, pointerId: null, wasPlaying: false });
  const dismissedRef = useRef(false);

  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [activeKey, setActiveKey] = useState(null);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    stopLoop();
    dismissedRef.current = false;
    setActiveKey(null);
    setPlaying(false);
    setProgress(0);
    setVisible(false);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    }
  }, [stopLoop]);

  const startLoop = useCallback((audio) => {
    stopLoop();
    const tick = () => {
      if (audioRef.current !== audio) return;
      const duration = audio.duration;
      if (duration && Number.isFinite(duration)) {
        setProgress(audio.currentTime / duration);
      }
      if (!audio.paused && !audio.ended) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopLoop]);

  const play = useCallback(
    (url, key, { showProgress = true } = {}) => {
      stopLoop();
      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      setActiveKey(key);
      setProgress(0);
      dismissedRef.current = false;

      const onEnded = () => {
        stopLoop();
        setProgress(1);
        setPlaying(false);
        if (showProgress && !dismissedRef.current) setVisible(true);
      };

      audio.addEventListener('ended', onEnded);
      audio.addEventListener('play', () => setPlaying(true));
      audio.addEventListener('pause', () => setPlaying(false));
      audio.addEventListener('loadedmetadata', () => startLoop(audio), { once: true });

      if (showProgress && !dismissedRef.current) {
        setVisible(true);
      }

      audio.play().catch((err) => {
        console.error(err);
        setPlaying(false);
      });

      return audio;
    },
    [startLoop, stopLoop],
  );

  const seek = useCallback(
    (ratio) => {
      const audio = audioRef.current;
      if (!audio || !audio.duration || !Number.isFinite(audio.duration)) return;
      const clamped = Math.max(0, Math.min(1, ratio));
      audio.currentTime = clamped * audio.duration;
      setProgress(clamped);
    },
    [],
  );

  const repeat = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    dismissedRef.current = false;
    setVisible(true);
    audio.currentTime = 0;
    setProgress(0);
    audio.play().catch(console.error);
    startLoop(audio);
  }, [startLoop]);

  const closeBar = useCallback(() => {
    dismissedRef.current = true;
    setVisible(false);
  }, []);

  const beginScrub = useCallback((pointerId) => {
    const audio = audioRef.current;
    scrubRef.current = {
      active: true,
      pointerId,
      wasPlaying: !!(audio && !audio.paused),
    };
    if (audio && !audio.paused) audio.pause();
  }, []);

  const moveScrub = useCallback(
    (ratio, pointerId) => {
      if (!scrubRef.current.active || scrubRef.current.pointerId !== pointerId) return;
      seek(ratio);
    },
    [seek],
  );

  const endScrub = useCallback(
    (pointerId) => {
      if (!scrubRef.current.active || scrubRef.current.pointerId !== pointerId) return;
      const audio = audioRef.current;
      scrubRef.current.active = false;
      scrubRef.current.pointerId = null;
      if (audio && scrubRef.current.wasPlaying) {
        audio.play().catch(console.error);
        startLoop(audio);
      }
    },
    [startLoop],
  );

  useEffect(() => () => stop(), [stop]);

  return {
    audioRef,
    visible,
    progress,
    playing,
    activeKey,
    play,
    stop,
    seek,
    repeat,
    closeBar,
    beginScrub,
    moveScrub,
    endScrub,
  };
}
