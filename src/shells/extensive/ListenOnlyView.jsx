import React, { useState, useEffect, useRef, useCallback } from 'react';
import Waveform from '../../components/Waveform.jsx';
import TranslationBlock from '../../components/TranslationBlock.jsx';
import ExtensivePlayPauseButton from './ExtensivePlayPauseButton.jsx';
import { passageMediaMetadata } from '../../core/audio/mediaSession.js';
import { UI } from '../../core/shared/uiJa.js';

export default function ListenOnlyView({
  item, audioUrl, itemId, audioPlayer, onEnded, playbackRate = 1,
  autoPlayAfterMs = 0, onAutoPlayStarted,
}) {
  const [showTranslation, setShowTranslation] = useState(false);
  const playedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const attachEnded = useCallback((audio) => {
    if (!audio) return;
    audio.addEventListener('ended', () => onEndedRef.current?.(), { once: true });
  }, []);

  const startPlayback = useCallback(() => {
    const existing = audioPlayer.audioRef?.current;
    if (audioPlayer.activeKey === itemId && existing && !existing.paused && !existing.ended) {
      attachEnded(existing);
      onAutoPlayStarted?.();
      return;
    }
    const audio = audioPlayer.play(audioUrl, itemId, {
      showProgress: true,
      playbackRate,
      metadata: passageMediaMetadata(item),
    });
    attachEnded(audio);
    onAutoPlayStarted?.();
  }, [audioUrl, itemId, item, audioPlayer, playbackRate, attachEnded, onAutoPlayStarted]);

  useEffect(() => {
    if (!audioUrl) return;
    const existing = audioPlayer.audioRef?.current;
    if (audioPlayer.activeKey === itemId && existing && !existing.paused && !existing.ended) {
      playedRef.current = true;
      attachEnded(existing);
      return;
    }
    if (playedRef.current) return;
    playedRef.current = true;

    const delay = autoPlayAfterMs > 0 ? autoPlayAfterMs : 0;
    const timer = setTimeout(() => startPlayback(), delay);
    return () => clearTimeout(timer);
  }, [audioUrl, itemId, audioPlayer, autoPlayAfterMs, attachEnded, startPlayback]);

  return (
    <div className="listen-only-view" onClick={() => setShowTranslation((v) => !v)}>
      <div className="audio-stage">
        <div className="audio-controls">
          <ExtensivePlayPauseButton
            itemId={itemId}
            audioPlayer={audioPlayer}
            stopPropagation
            onPlayStart={() => {
              playedRef.current = true;
              startPlayback();
            }}
          />
        </div>
        <Waveform playing={audioPlayer.playing && audioPlayer.activeKey === itemId} />
      </div>
      <p className="field-hint">{UI.extensive.tapTranslation}{showTranslation ? UI.extensive.hide : UI.extensive.show}</p>
      {showTranslation && (
        <TranslationBlock translationJa={item.translation_ja} />
      )}
    </div>
  );
}
