import React, { useState, useEffect, useRef, useCallback } from 'react';
import Waveform from '../../components/Waveform.jsx';
import TranslationBlock from '../../components/TranslationBlock.jsx';

export default function PassagePlayer({
  item, audioUrl, itemId, audioPlayer, showScript = true, onEnded, playbackRate = 1,
}) {
  const lines = item?.lines || [];
  const playedRef = useRef(false);

  useEffect(() => {
    if (!audioUrl || playedRef.current) return;
    playedRef.current = true;
    const audio = audioPlayer.play(audioUrl, itemId, { showProgress: true, playbackRate });
    if (audio) {
      const handler = () => onEnded?.();
      audio.addEventListener('ended', handler);
      return () => audio.removeEventListener('ended', handler);
    }
  }, [audioUrl, itemId, audioPlayer, onEnded, playbackRate]);

  function replay() {
    audioPlayer.play(audioUrl, itemId, { showProgress: true, playbackRate });
  }

  return (
    <div className="passage-player">
      <div className="audio-stage">
        <div className="audio-controls">
          <button type="button" className="btn btn-icon" onClick={replay} aria-label="Replay">▶</button>
        </div>
        <Waveform playing={audioPlayer.playing && audioPlayer.activeKey === itemId} />
      </div>

      {showScript && (
        <div className="passage-script">
          {lines.map((line, i) => (
            <p key={i} className="dialogue-line">
              {lines.length > 1 && <span className="speaker-tag">{line.speaker}:</span>}
              {line.text}
            </p>
          ))}
          <TranslationBlock translationJa={item.translation_ja} />
        </div>
      )}
    </div>
  );
}
