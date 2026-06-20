import React, { useEffect, useState } from 'react';
import { diagnoseFeatures } from '../../core/scoring/cloze.js';
import {
  addToShadowQueue,
  addUnderstoodShadowCandidate,
  hasShadowQueueEntryForSource,
} from '../../core/shared/materialQueue.js';
import { isShadowCandidateScore } from '../../core/shared/shadowThresholds.js';
import { UI } from '../../core/shared/uiJa.js';

export default function ReviewView({
  item, mode, audioUrl, itemId, audioPlayer, scene, level, cefr, onAgain, onNext, onReplaySame,
  onShadowQueueAdd,
}) {
  const result = item._result;
  const lines = item.lines || [{ speaker: 'A', text: item.sentence || '' }];
  const features = mode === 'cloze'
    ? diagnoseFeatures(item, result.results)
    : (item.target_features || []).map((f) => ({ feature: f, captured: null }));

  let scoreDisplay = '—';
  let scorePerfect = false;
  let clozeRatio = 0;
  if (result?.kind === 'cloze') {
    const correct = result.results.filter((r) => r.correct).length;
    scoreDisplay = result.results.length ? `${correct}/${result.results.length}` : '—';
    scorePerfect = result.results.length > 0 && correct === result.results.length;
    clozeRatio = result.results.length ? correct / result.results.length : 0;
  } else if (result?.kind === 'dictation') {
    scoreDisplay = `${Math.round(result.accuracy * 100)}%`;
    scorePerfect = result.accuracy >= 1;
  } else if (result?.kind === 'minimal_pair') {
    scoreDisplay = result.correct ? '1/1' : '0/1';
    scorePerfect = result.correct;
  }

  const isShadowCandidate = result?.kind === 'cloze' && isShadowCandidateScore(clozeRatio);
  const [shadowQueued, setShadowQueued] = useState(() =>
    isShadowCandidate && itemId ? hasShadowQueueEntryForSource(itemId) : false,
  );

  useEffect(() => {
    if (!isShadowCandidate || !itemId) return;
    if (hasShadowQueueEntryForSource(itemId)) {
      setShadowQueued(true);
      return;
    }
    const added = addUnderstoodShadowCandidate({
      item,
      itemId,
      scene,
      level,
      cefr,
      score: clozeRatio,
    });
    if (added) {
      setShadowQueued(true);
      onShadowQueueAdd?.();
    }
  }, [isShadowCandidate, itemId, item, scene, level, cefr, clozeRatio, onShadowQueueAdd]);

  function playReview() {
    if (audioUrl && itemId) audioPlayer.play(audioUrl, itemId, { showProgress: true });
  }

  function sendToShadowing() {
    if (shadowQueued) return;
    addToShadowQueue({
      item,
      scene,
      level,
      cefr,
      source: 'intensive',
      score: clozeRatio,
      sourceItemId: itemId,
      understood: isShadowCandidate,
    });
    onShadowQueueAdd?.();
    setShadowQueued(true);
  }

  return (
    <>
      <div className="review-section">
        <div className="score-label">{UI.intensive.score}</div>
        <div className={`score${scorePerfect ? ' is-perfect' : ''}`}>{scoreDisplay}</div>
      </div>

      {isShadowCandidate && (
        <div className="review-section">
          <p className="field-hint">
            {shadowQueued ? UI.intensive.shadowCandidateAdded : UI.intensive.shadowCandidateHint}
          </p>
        </div>
      )}

      <div className="review-section">
        <h3>Sentence</h3>
        <div className="review-sentence">
          {lines.map((l, i) => (
            <div key={i} className="dialogue-line">
              {lines.length > 1 && <span className="speaker-tag">{l.speaker}:</span>}
              {l.text}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-mute)' }}>
          {item.translation_ja}
        </div>
        {audioUrl && (
          <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={playReview}>
            {UI.intensive.listenAgain}
          </button>
        )}
      </div>

      {result.kind === 'cloze' && (
        <div className="review-section">
          <h3>Blanks</h3>
          <ul className="feature-list">
            {result.results.map((r, i) => (
              <li key={i} className="feature-item">
                <span>
                  <strong>{r.expected}</strong>
                  {r.hint && <span style={{ color: 'var(--ink-mute)', marginLeft: 8 }}>({r.hint})</span>}
                </span>
                <span className={`feature-status ${r.correct ? 'ok' : 'miss'}`}>
                  {r.correct ? '○' : `× ${r.user || UI.intensive.blank}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.kind === 'dictation' && (
        <div className="review-section">
          <h3>Your transcription</h3>
          <div className="review-sentence" style={{ background: 'transparent', border: '1px dashed var(--line-strong)' }}>
            {result.user}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>
            {UI.intensive.edits}: {result.edits} / {result.totalWords} {UI.intensive.words}
          </div>
        </div>
      )}

      {result.kind === 'minimal_pair' && (
        <div className="review-section">
          <h3>Your answer</h3>
          <ul className="feature-list">
            <li className="feature-item">
              <span>{UI.intensive.youChose}</span>
              <span className={`feature-status ${result.correct ? 'ok' : 'miss'}`}>{result.user}</span>
            </li>
            <li className="feature-item">
              <span>{UI.intensive.correctWord}</span>
              <span className="feature-status ok">{result.expected}</span>
            </li>
          </ul>
        </div>
      )}

      <div className="review-section">
        <h3>Target features</h3>
        <ul className="feature-list">
          {features.map((f, i) => (
            <li key={i} className="feature-item">
              <span>{f.feature}</span>
              <span className={`feature-status ${f.captured === true ? 'ok' : f.captured === false ? 'miss' : ''}`}>
                {f.captured === true ? '○' : f.captured === false ? '×' : '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {isShadowCandidate && !shadowQueued && (
        <div className="review-section">
          <button type="button" className="btn btn-ghost" onClick={sendToShadowing}>
            {UI.intensive.addToShadowing}
          </button>
        </div>
      )}

      <div className="row" style={{ marginTop: 32 }}>
        <button className="btn" onClick={onNext}>{UI.intensive.nextItem}</button>
        <button className="btn btn-ghost" onClick={onReplaySame}>{UI.intensive.sameAgain}</button>
        <button className="btn btn-ghost" onClick={onAgain}>{UI.intensive.backToSetup}</button>
      </div>
    </>
  );
}
