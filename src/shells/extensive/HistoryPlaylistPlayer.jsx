import React, { useCallback, useEffect, useRef, useState } from 'react';
import { passageMediaMetadata } from '../../core/audio/mediaSession.js';
import { UI } from '../../core/shared/uiJa.js';

const BETWEEN_TRACK_DELAY_MS = 1000;

export default function HistoryPlaylistPlayer({
  entries,
  startIdx = 0,
  audioPlayer,
  resolveAudioUrl,
  onStop,
  onItemPlayed,
  onIdxChange,
}) {
  const [idx, setIdx] = useState(startIdx);
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const advancingRef = useRef(false);
  const entry = entries[idx];

  useEffect(() => {
    onIdxChange?.(idx);
  }, [idx, onIdxChange]);

  const goToNext = useCallback((playedEntry) => {
    if (playedEntry) onItemPlayed?.(playedEntry);
    if (idx + 1 >= entries.length) {
      onStop?.();
      return;
    }
    setTimeout(() => {
      advancingRef.current = false;
      setIdx((i) => i + 1);
    }, BETWEEN_TRACK_DELAY_MS);
  }, [entries.length, idx, onItemPlayed, onStop]);

  const advanceAfterEnd = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    goToNext(entry);
  }, [entry, goToNext]);

  useEffect(() => {
    if (!entry) {
      onStop?.();
      return undefined;
    }

    let cancelled = false;
    advancingRef.current = false;
    setLoading(true);
    setError('');
    setAudioUrl(null);

    resolveAudioUrl(entry)
      .then((url) => {
        if (!cancelled) {
          setAudioUrl(url);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err.message || err));
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [entry?.id, resolveAudioUrl, onStop, entry]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => advanceAfterEnd(), BETWEEN_TRACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [error, advanceAfterEnd]);

  useEffect(() => {
    if (!audioUrl || loading || error) return undefined;

    let removeEnded = () => {};
    const timer = setTimeout(() => {
      const audio = audioPlayer.play(audioUrl, entry.id, {
        showProgress: true,
        metadata: passageMediaMetadata(entry.item),
      });
      if (!audio) {
        advanceAfterEnd();
        return;
      }
      const handler = () => advanceAfterEnd();
      audio.addEventListener('ended', handler, { once: true });
      removeEnded = () => audio.removeEventListener('ended', handler);
    }, 0);

    return () => {
      clearTimeout(timer);
      removeEnded();
    };
  }, [audioUrl, loading, error, entry, audioPlayer, advanceAfterEnd]);

  function handleStop() {
    audioPlayer.stop?.();
    onStop?.();
  }

  function handleSkip() {
    audioPlayer.stop?.();
    advancingRef.current = false;
    goToNext(entry);
  }

  return (
    <div className="history-playlist-bar" role="region" aria-label={UI.extensive.historyPlaylistNow}>
      <div className="history-playlist-bar-head">
        <span className="history-playlist-position">
          {idx + 1} / {entries.length}
        </span>
        <span className="history-playlist-status">
          {loading && UI.extensive.historyPlaylistLoading}
          {!loading && error && error}
          {!loading && !error && UI.extensive.historyPlaylistPlaying}
        </span>
      </div>
      {entry && <p className="history-playlist-preview">{entry.preview}</p>}
      <div className="history-playlist-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleSkip} disabled={loading || idx + 1 >= entries.length}>
          {UI.extensive.historyPlaylistSkip}
        </button>
        <button type="button" className="btn btn-sm" onClick={handleStop}>
          {UI.extensive.historyPlaylistStop}
        </button>
      </div>
    </div>
  );
}
