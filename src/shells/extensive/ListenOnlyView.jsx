import React, { useState } from 'react';
import Waveform from '../../components/Waveform.jsx';

export default function ListenOnlyView({ item, audioUrl, itemId, audioPlayer, onEnded, playbackRate = 1 }) {
  const [showTranslation, setShowTranslation] = useState(false);

  function play() {
    const audio = audioPlayer.play(audioUrl, itemId, { showProgress: true, playbackRate });
    if (audio) {
      audio.addEventListener('ended', () => onEnded?.(), { once: true });
    }
  }

  return (
    <div className="listen-only-view" onClick={() => setShowTranslation((v) => !v)}>
      <div className="audio-stage">
        <div className="audio-controls">
          <button type="button" className="btn btn-icon" onClick={(e) => { e.stopPropagation(); play(); }} aria-label="Play">▶</button>
        </div>
        <Waveform playing={audioPlayer.playing && audioPlayer.activeKey === itemId} />
      </div>
      <p className="field-hint">Tap to {showTranslation ? 'hide' : 'show'} translation</p>
      {showTranslation && (
        <p className="passage-translation">{item.translation_ja}</p>
      )}
    </div>
  );
}
