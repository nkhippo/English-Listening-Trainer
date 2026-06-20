import React, { useState, useEffect, useCallback } from 'react';
import { CEFR_LEVELS, migrateCefrFromStorage, getRecommendedLevel } from '../../core/shared/cefr.js';
import { SCENES, migrateSceneId } from '../../core/shared/sceneConfig.js';
import { LEVELS } from '../../core/shared/levels.js';
import { STRUCTURE_FLAGS } from '../../core/shared/structureFlags.js';
import { generateContent } from '../../core/generation/index.js';
import { normalizeItem, resolveItemAudio } from '../../core/audio/index.js';
import {
  loadShadowQueue, addToShadowQueue, updateShadowProgress, removeFromShadowQueue,
} from '../../core/shared/materialQueue.js';
import { DEFAULT_GAS_URL } from '../../lib/config.js';
import { pullCloudAudio } from '../../lib/sync.js';
import {
  getCachedAudio,
  saveCachedAudio,
  hasCachedAudio,
} from '../../lib/storage.js';
import ShadowStageController from './ShadowStageController.jsx';
import RecordCompare from './RecordCompare.jsx';
import { UI } from '../../core/shared/uiJa.js';

export default function ShadowingApp({
  anthropicKey,
  audioPlayer,
  gasUrl = DEFAULT_GAS_URL,
  cloudSync,
  syncRefreshKey = 0,
}) {
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

  const {
    schedulePush: scheduleCloudSync,
    scheduleAudioPush,
    scheduleAudioDelete,
    cacheAudio,
    syncStatus,
  } = cloudSync || {};

  const cacheAudioLocallyAndCloud = useCallback(
    (id, base64) => cacheAudio?.(id, base64, saveCachedAudio) ?? saveCachedAudio(id, base64),
    [cacheAudio],
  );

  useEffect(() => {
    if (syncRefreshKey > 0) setQueue(loadShadowQueue());
  }, [syncRefreshKey]);

  function syncQueue(nextQueue) {
    setQueue(nextQueue);
    scheduleCloudSync?.();
  }

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
      const entry = addToShadowQueue({ item: generated, scene, level, cefr, source: 'generated' });
      syncQueue(loadShadowQueue());
      const tts = await resolveItemAudio({
        itemId: entry.id,
        gasUrl,
        lines: generated.lines,
        level,
        instructions: generated.tts_instructions || '',
        cefr,
        shell: 'shadowing',
        onCacheSave: cacheAudioLocallyAndCloud,
      });
      const url = tts.playableUrl;
      setActiveEntry({ ...entry, audioUrl: url, audioId: entry.id });
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
      if (!getCachedAudio(entry.id)) {
        try {
          await pullCloudAudio({ gasUrl, itemId: entry.id });
        } catch (err) {
          console.warn('Cloud audio fetch failed:', err);
        }
      }
      const tts = await resolveItemAudio({
        itemId: entry.id,
        cachedBase64: getCachedAudio(entry.id),
        gasUrl,
        lines: entry.item.lines,
        level: entry.level,
        instructions: entry.item.tts_instructions || '',
        cefr: entry.cefr,
        shell: 'shadowing',
        onCacheSave: cacheAudioLocallyAndCloud,
      });
      const url = tts.playableUrl;
      setActiveEntry({ ...entry, audioUrl: url, audioId: entry.id });
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
    syncQueue(loadShadowQueue());
    setActiveEntry((prev) => ({
      ...prev,
      stageProgress: { ...prev.stageProgress, [stageNum]: true },
    }));
  }

  function handleRemoveQueueEntry(id) {
    syncQueue(removeFromShadowQueue(id));
    scheduleAudioDelete?.(id);
  }

  function handleRecordingSaved(recordingId) {
    scheduleCloudSync?.();
    scheduleAudioPush?.(recordingId);
  }

  const expectedText = activeEntry?.item?.lines?.map((l) => l.text).join(' ') || activeEntry?.item?.sentence || '';

  if (setupMode === 'queue') {
    return (
      <div className="shadow-setup">
        {error && <div className="status error">{error}</div>}
        <h2>Shadowing queue</h2>
        <p className="field-hint">
          {UI.shadowing.queueHint}
          {syncStatus && syncStatus !== 'disabled' ? UI.common.syncAudioFromDrive : ''}
        </p>
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
                  {entry.understood && <span>{UI.shadowing.understoodBadge}</span>}
                  {entry.score != null && entry.source === 'intensive' && (
                    <span>{Math.round(entry.score * 100)}%</span>
                  )}
                  {hasCachedAudio(entry.id) && <span className="history-cache-badge">{UI.common.audioSaved}</span>}
                  {entry.stageProgress?.[3] && <span>✓ {UI.shadowing.complete}</span>}
                </div>
              </div>
              <div className="history-actions">
                <button type="button" className="btn btn-sm" onClick={() => selectQueueEntry(entry)}>{UI.shadowing.practice}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleRemoveQueueEntry(entry.id)}>{UI.shadowing.remove}</button>
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
        gasUrl={gasUrl}
        syncRefreshKey={syncRefreshKey}
        onRecordingSaved={handleRecordingSaved}
      />
    </div>
  );
}
