import React, { useState, useEffect } from 'react';
import { CEFR_LEVELS, migrateCefrFromStorage, getRecommendedLevel } from '../../core/shared/cefr.js';
import { SCENES, migrateSceneId } from '../../core/shared/sceneConfig.js';
import { LEVELS } from '../../core/shared/levels.js';
import { STRUCTURE_FLAGS } from '../../core/shared/structureFlags.js';
import { generateContent } from '../../core/generation/index.js';
import { normalizeItem, resolveItemAudio, resolveAudioUrl } from '../../core/audio/index.js';
import {
  loadShadowQueue, addToShadowQueue, updateShadowProgress, removeFromShadowQueue,
} from '../../core/shared/materialQueue.js';
import { DEFAULT_GAS_URL } from '../../lib/config.js';
import { saveCachedAudio } from '../../lib/storage.js';
import ShadowStageController from './ShadowStageController.jsx';
import RecordCompare from './RecordCompare.jsx';
import { UI } from '../../core/shared/uiJa.js';

export default function ShadowingApp({ anthropicKey, audioPlayer, gasUrl = DEFAULT_GAS_URL }) {
  const [queue, setQueue] = useState(() => loadShadowQueue());
  const [activeEntry, setActiveEntry] = useState(null);
  const [stage, setStage] = useState(1);
  const [setupMode, setSetupMode] = useState('queue');
  const [cefr, setCefr] = useState(() => migrateCefrFromStorage(localStorage.getItem('elt_shadow_cefr')));
  const [scene, setScene] = useState(() => migrateSceneId(localStorage.getItem('elt_shadow_scene')) || 'phone');
  const [level, setLevel] = useState(() => getRecommendedLevel(cefr));
  const [structureFlags, setStructureFlags] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQueue(loadShadowQueue());
  }, []);

  async function generateNewPassage() {
    if (!anthropicKey) {
      setError('Anthropic API キーが必要です');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const generated = normalizeItem(await generateContent({
        shell: 'shadowing', scene, cefr, level, length: 'short_passage', structureFlags, anthropicKey,
      }));
      const id = `sh${Date.now().toString(36)}`;
      const tts = await resolveItemAudio({
        itemId: id,
        gasUrl,
        lines: generated.lines,
        level,
        instructions: generated.tts_instructions || '',
        cefr,
        shell: 'shadowing',
        onCacheSave: (_, b64) => saveCachedAudio(id, b64),
      });
      const url = tts.url || resolveAudioUrl({ url: tts.url, audioBase64: tts.audioBase64 });
      const entry = addToShadowQueue({ item: generated, scene, level, cefr, source: 'generated' });
      setQueue(loadShadowQueue());
      setActiveEntry({ ...entry, audioUrl: url, audioId: id });
      setStage(1);
      setSetupMode('practice');
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function selectQueueEntry(entry) {
    setLoading(true);
    try {
      const audioId = entry.id;
      let url = null;
      const cached = null;
      const tts = await resolveItemAudio({
        itemId: audioId,
        cachedBase64: cached,
        gasUrl,
        lines: entry.item.lines,
        level: entry.level,
        instructions: entry.item.tts_instructions || '',
        cefr: entry.cefr,
        shell: 'shadowing',
        onCacheSave: (_, b64) => saveCachedAudio(audioId, b64),
      });
      url = tts.url || resolveAudioUrl({ url: tts.url, audioBase64: tts.audioBase64 });
      setActiveEntry({ ...entry, audioUrl: url, audioId });
      setStage(1);
      setSetupMode('practice');
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  function handleStageComplete(stageNum) {
    if (!activeEntry) return;
    updateShadowProgress(activeEntry.id, stageNum, true);
    setQueue(loadShadowQueue());
    setActiveEntry((prev) => ({
      ...prev,
      stageProgress: { ...prev.stageProgress, [stageNum]: true },
    }));
  }

  const expectedText = activeEntry?.item?.lines?.map((l) => l.text).join(' ') || activeEntry?.item?.sentence || '';

  if (setupMode === 'queue') {
    return (
      <div className="shadow-setup">
        {error && <div className="status error">{error}</div>}
        <h2>Shadowing queue</h2>
        <p className="field-hint">{UI.shadowing.queueHint}</p>
        {queue.length === 0 && <p className="status">{UI.shadowing.queueEmpty}</p>}
        <ul className="history-list">
          {queue.map((entry) => (
            <li key={entry.id} className="history-item">
              <div className="history-main">
                <div className="history-preview">
                  {(entry.item?.sentence || '').slice(0, 60)}…
                </div>
                <div className="history-meta">
                  <span>{entry.source}</span>
                  <span>{entry.cefr}</span>
                  {entry.stageProgress?.[3] && <span>✓ {UI.shadowing.complete}</span>}
                </div>
              </div>
              <div className="history-actions">
                <button type="button" className="btn btn-sm" onClick={() => selectQueueEntry(entry)}>{UI.shadowing.practice}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQueue(removeFromShadowQueue(entry.id))}>{UI.shadowing.remove}</button>
              </div>
            </li>
          ))}
        </ul>

        <h2 style={{ marginTop: 32 }}>Generate new</h2>
        <div className="field">
          <label>{UI.common.cefr}</label>
          <div className="choices">
            {Object.entries(CEFR_LEVELS).map(([key, c]) => (
              <button key={key} className="choice" aria-pressed={cefr === key} onClick={() => setCefr(key)}>{c.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{UI.common.scene}</label>
          <div className="choices">
            {Object.entries(SCENES).map(([key, s]) => (
              <button key={key} className="choice" aria-pressed={scene === key} onClick={() => setScene(key)}>{s.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{UI.shadowing.structureFlags}</label>
          <div className="choices">
            {Object.entries(STRUCTURE_FLAGS).map(([key, f]) => (
              <button
                key={key}
                className="choice"
                aria-pressed={structureFlags.includes(key)}
                onClick={() => setStructureFlags((p) => p.includes(key) ? p.filter((k) => k !== key) : [...p, key])}
              >
                {f.labelJa || f.label}
              </button>
            ))}
          </div>
        </div>
        <button className="btn" onClick={generateNewPassage} disabled={loading || !anthropicKey}>
          {loading ? UI.shadowing.generating : UI.shadowing.generatePractice}
        </button>
      </div>
    );
  }

  if (!activeEntry) return null;

  return (
    <div className="shadow-practice">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSetupMode('queue')}>{UI.shadowing.backQueue}</button>
      <ShadowStageController
        stage={stage}
        onStageChange={setStage}
        stageProgress={activeEntry.stageProgress || {}}
        item={activeEntry.item}
        audioUrl={activeEntry.audioUrl}
        itemId={activeEntry.audioId}
        audioPlayer={audioPlayer}
      />
      <RecordCompare
        expectedText={expectedText}
        entryId={activeEntry.id}
        modelAudioUrl={activeEntry.audioUrl}
        stage={stage}
        onStageComplete={handleStageComplete}
      />
    </div>
  );
}
