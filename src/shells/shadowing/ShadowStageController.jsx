import React from 'react';
import Waveform from '../../components/Waveform.jsx';
import { UI } from '../../core/shared/uiJa.js';

const STAGES = [
  { id: 1, label: 'Sync', description: UI.shadowing.syncStage },
  { id: 2, label: 'Shadow', description: UI.shadowing.shadowStage },
  { id: 3, label: 'Prosody', description: UI.shadowing.prosodyStage },
];

export default function ShadowStageController({
  stage, onStageChange, stageProgress, item, audioUrl, itemId, audioPlayer,
}) {
  return (
    <div className="shadow-stages">
      <div className="choices">
        {STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="choice"
            aria-pressed={stage === s.id}
            onClick={() => onStageChange(s.id)}
          >
            <span className="choice-label">
              {s.label}{stageProgress[s.id] ? ' ✓' : ''}
            </span>
            <span className="choice-meta">{s.description}</span>
          </button>
        ))}
      </div>

      {stage === 1 && (
        <SyncStage item={item} audioUrl={audioUrl} itemId={itemId} audioPlayer={audioPlayer} />
      )}
      {stage === 2 && (
        <ShadowStage item={item} audioUrl={audioUrl} itemId={itemId} audioPlayer={audioPlayer} />
      )}
      {stage === 3 && (
        <ProsodyStage item={item} audioUrl={audioUrl} itemId={itemId} audioPlayer={audioPlayer} />
      )}
    </div>
  );
}

function SyncStage({ item, audioUrl, itemId, audioPlayer }) {
  const lines = item?.lines || [];
  return (
    <>
      <div className="passage-script">
        {lines.map((line, i) => (
          <p key={i} className="dialogue-line">
            {lines.length > 1 && <span className="speaker-tag">{line.speaker}:</span>}
            {line.text}
          </p>
        ))}
      </div>
      <PlayButton audioUrl={audioUrl} itemId={itemId} audioPlayer={audioPlayer} />
    </>
  );
}

function ShadowStage({ audioUrl, itemId, audioPlayer }) {
  return (
    <>
      <p className="field-hint">{UI.shadowing.shadowHint}</p>
      <PlayButton audioUrl={audioUrl} itemId={itemId} audioPlayer={audioPlayer} />
    </>
  );
}

function ProsodyStage({ item, audioUrl, itemId, audioPlayer }) {
  const lines = item?.lines || [];
  return (
    <>
      <div className="passage-script prosody-highlight">
        {lines.map((line, i) => (
          <p key={i} className="dialogue-line">
            {highlightProsody(line.text)}
          </p>
        ))}
      </div>
      <PlayButton audioUrl={audioUrl} itemId={itemId} audioPlayer={audioPlayer} />
    </>
  );
}

function highlightProsody(text) {
  return text.split(/\s+/).map((word, i) => {
    const isStress = i % 3 === 0 || /^[A-Z]/.test(word);
    return (
      <span key={i} className={isStress ? 'prosody-stress' : 'prosody-link'}>
        {word}{' '}
      </span>
    );
  });
}

function PlayButton({ audioUrl, itemId, audioPlayer }) {
  return (
    <div className="audio-stage">
      <div className="audio-controls">
        <button
          type="button"
          className="btn btn-icon"
          onClick={() => audioPlayer.play(audioUrl, itemId, { showProgress: true })}
          aria-label="Play model"
        >
          {UI.shadowing.modelPlay}
        </button>
      </div>
      <Waveform playing={audioPlayer.playing && audioPlayer.activeKey === itemId} />
    </div>
  );
}
