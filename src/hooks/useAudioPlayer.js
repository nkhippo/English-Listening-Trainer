import { useCallback, useEffect, useRef, useState } from 'react';

const ENDLESS_REPEAT_KEY = 'audio-endless-repeat';
const PLAYBACK_RATE_KEY = 'audio-playback-rate';
const PLAYBACK_RATES = [1, 0.75];

function readEndlessRepeat() {
  try {
    return localStorage.getItem(ENDLESS_REPEAT_KEY) === '1';
  } catch {
    return false;
  }
}

function readPlaybackRate() {
  try {
    const value = parseFloat(localStorage.getItem(PLAYBACK_RATE_KEY));
    return PLAYBACK_RATES.includes(value) ? value : 1;
  } catch {
    return 1;
  }
}

export function useAudioPlayer() {
  const audioRef = useRef(null);
  const rafRef = useRef(null);
  const scrubRef = useRef({ active: false, pointerId: null, wasPlaying: false, moved: false });
  const dismissedRef = useRef(false);
  const endlessRepeatRef = useRef(readEndlessRepeat());
  const playbackRateRef = useRef(readPlaybackRate());

  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [activeKey, setActiveKey] = useState(null);
  const [endlessRepeat, setEndlessRepeat] = useState(() => endlessRepeatRef.current);
  const [playbackRate, setPlaybackRate] = useState(() => playbackRateRef.current);
  const [holding, setHolding] = useState(false);

  const applyPlaybackRate = useCallback((audio) => {
    if (audio) audio.playbackRate = playbackRateRef.current;
  }, []);

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
    (url, key, { showProgress = true, playbackRate: rate } = {}) => {
      if (!url) {
        console.error('Audio play skipped: empty URL');
        return null;
      }
      stopLoop();
      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      if (rate) audio.playbackRate = rate;
      else applyPlaybackRate(audio);
      setActiveKey(key);
      setProgress(0);
      dismissedRef.current = false;

      const onEnded = () => {
        if (endlessRepeatRef.current) {
          audio.currentTime = 0;
          setProgress(0);
          audio.play().catch(console.error);
          startLoop(audio);
          return;
        }
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
    [applyPlaybackRate, startLoop, stopLoop],
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

  const toggleEndlessRepeat = useCallback(() => {
    const next = !endlessRepeatRef.current;
    endlessRepeatRef.current = next;
    setEndlessRepeat(next);
    try {
      localStorage.setItem(ENDLESS_REPEAT_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (next) repeat();
  }, [repeat]);

  const togglePlaybackRate = useCallback(() => {
    const idx = PLAYBACK_RATES.indexOf(playbackRateRef.current);
    const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
    playbackRateRef.current = next;
    setPlaybackRate(next);
    try {
      localStorage.setItem(PLAYBACK_RATE_KEY, String(next));
    } catch {
      /* ignore */
    }
    applyPlaybackRate(audioRef.current);
  }, [applyPlaybackRate]);

  const closeBar = useCallback(() => {
    dismissedRef.current = true;
    setVisible(false);
  }, []);

  const beginScrub = useCallback(
    (pointerId) => {
      const audio = audioRef.current;
      if (!audio) return;
      scrubRef.current = {
        active: true,
        pointerId,
        wasPlaying: !audio.paused || audio.ended,
        moved: false,
      };
      setHolding(true);
      if (!audio.paused) {
        stopLoop();
        audio.pause();
      }
    },
    [stopLoop],
  );

  const moveScrub = useCallback(
    (ratio, pointerId) => {
      if (!scrubRef.current.active || scrubRef.current.pointerId !== pointerId) return;
      scrubRef.current.moved = true;
      seek(ratio);
    },
    [seek],
  );

  const endScrub = useCallback(
    (pointerId) => {
      if (!scrubRef.current.active || scrubRef.current.pointerId !== pointerId) return;
      const audio = audioRef.current;
      const { wasPlaying } = scrubRef.current;
      scrubRef.current = { active: false, pointerId: null, wasPlaying: false, moved: false };
      setHolding(false);
      if (audio && wasPlaying) {
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
    endlessRepeat,
    playbackRate,
    holding,
    play,
    stop,
    seek,
    repeat,
    toggleEndlessRepeat,
    togglePlaybackRate,
    closeBar,
    beginScrub,
    moveScrub,
    endScrub,
  };
}
