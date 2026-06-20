import React, { useState, useEffect, useRef, useCallback } from 'react';
import Waveform from '../../components/Waveform.jsx';
import TranslationBlock from '../../components/TranslationBlock.jsx';
import { passageMediaMetadata } from '../../core/audio/mediaSession.js';
import { UI } from '../../core/shared/uiJa.js';

export default function ListenOnlyView({ item, audioUrl, itemId, audioPlayer, onEnded, playbackRate = 1 }) {
  const [showTranslation, setShowTranslation] = useState(false);
  const playedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const attachEnded = useCallback((audio) => {
    if (!audio) return;
    audio.addEventListener('ended', () => onEndedRef.current?.(), { once: true });
  }, []);

  const play = useCallback(() => {
    const existing = audioPlayer.audioRef?.current;
    if (audioPlayer.activeKey === itemId && existing && !existing.paused && !existing.ended) {
      attachEnded(existing);
      return;
    }
    const audio = audioPlayer.play(audioUrl, itemId, {
      showProgress: true,
      playbackRate,
      metadata: passageMediaMetadata(item),
    });
    attachEnded(audio);
  }, [audioUrl, itemId, item, audioPlayer, playbackRate, attachEnded]);

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
    play();
  }, [audioUrl, play, itemId, audioPlayer, attachEnded]);

  return (
    <div className="listen-only-view" onClick={() => setShowTranslation((v) => !v)}>
      <div className="audio-stage">
        <div className="audio-controls">
          <button type="button" className="btn btn-icon" onClick={(e) => { e.stopPropagation(); playedRef.current = true; play(); }} aria-label="Play">▶</button>
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
