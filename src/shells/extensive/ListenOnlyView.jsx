import React, { useState, useEffect, useRef, useCallback } from 'react';
import Waveform from '../../components/Waveform.jsx';
import TranslationBlock from '../../components/TranslationBlock.jsx';
import { UI } from '../../core/shared/uiJa.js';

export default function ListenOnlyView({ item, audioUrl, itemId, audioPlayer, onEnded, playbackRate = 1 }) {
  const [showTranslation, setShowTranslation] = useState(false);
  const playedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const play = useCallback(() => {
    const audio = audioPlayer.play(audioUrl, itemId, { showProgress: true, playbackRate });
    if (audio) {
      audio.addEventListener('ended', () => onEndedRef.current?.(), { once: true });
    }
  }, [audioUrl, itemId, audioPlayer, playbackRate]);

  useEffect(() => {
    if (!audioUrl || playedRef.current) return;
    playedRef.current = true;
    play();
  }, [audioUrl, play]);

  return (
    <div className="listen-only-view" onClick={() => setShowTranslation((v) => !v)}>
      <div className="audio-stage">
        <div className="audio-controls">
          <button type="button" className="btn btn-icon" onClick={(e) => { e.stopPropagation(); play(); }} aria-label="Play">▶</button>
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
