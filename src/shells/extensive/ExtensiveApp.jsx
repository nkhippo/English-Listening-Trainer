import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SCENES, migrateSceneId } from '../../core/shared/sceneConfig.js';
import { LEVELS } from '../../core/shared/levels.js';
import { CEFR_LEVELS, DEFAULT_CEFR, migrateCefrFromStorage, getRecommendedLevel } from '../../core/shared/cefr.js';
import { STRUCTURE_FLAGS } from '../../core/shared/structureFlags.js';
import { generateContent } from '../../core/generation/index.js';
import { normalizeItem, resolveItemAudio, base64ToAudioUrl } from '../../core/audio/index.js';
import { loadExtensiveStats, recordPassageComplete } from '../../core/shared/extensiveStats.js';
import { addToShadowQueue } from '../../core/shared/materialQueue.js';
import { DEFAULT_GAS_URL } from '../../lib/config.js';
import { pullCloudAudio } from '../../lib/sync.js';
import {
  computeExtensiveItemId,
  loadExtensiveHistory,
  upsertExtensiveHistoryEntry,
  touchExtensiveHistoryEntry,
  removeExtensiveHistoryEntry,
  getCachedAudio,
  saveCachedAudio,
  hasCachedAudio,
} from '../../lib/storage.js';
import PassagePlayer from './PassagePlayer.jsx';
import ListenOnlyView from './ListenOnlyView.jsx';
import { UI } from '../../core/shared/uiJa.js';

const LS_KEYS = {
  cefr: 'elt_extensive_cefr',
  scene: 'elt_extensive_scene',
  level: 'elt_extensive_level',
  length: 'elt_extensive_length',
};

export default function ExtensiveApp({
  anthropicKey,
  audioPlayer,
  gasUrl = DEFAULT_GAS_URL,
  cloudSync,
  syncRefreshKey = 0,
}) {
  const [stage, setStage] = useState('setup');
  const [cefr, setCefr] = useState(() => migrateCefrFromStorage(localStorage.getItem(LS_KEYS.cefr)));
  const [scene, setScene] = useState(() => migrateSceneId(localStorage.getItem(LS_KEYS.scene)));
  const [length, setLength] = useState(() => localStorage.getItem(LS_KEYS.length) || 'short_passage');
  const [level, setLevel] = useState(() => Number(localStorage.getItem(LS_KEYS.level)) || getRecommendedLevel(cefr));
  const [structureFlags, setStructureFlags] = useState([]);
  const [viewMode, setViewMode] = useState('read_listen');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [autoContinue, setAutoContinue] = useState(true);
  const [passages, setPassages] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [history, setHistory] = useState(() => loadExtensiveHistory());
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [stats, setStats] = useState(() => loadExtensiveStats());
  const prefetchRef = useRef(null);
  const touchStartY = useRef(null);

  const { schedulePush: scheduleCloudSync, scheduleAudioDelete, cacheAudio } = cloudSync || {};

  const cacheAudioLocallyAndCloud = useCallback(
    (id, base64) => cacheAudio?.(id, base64, saveCachedAudio) ?? saveCachedAudio(id, base64),
    [cacheAudio],
  );

  useEffect(() => { localStorage.setItem(LS_KEYS.cefr, cefr); }, [cefr]);
  useEffect(() => { localStorage.setItem(LS_KEYS.scene, scene); }, [scene]);
  useEffect(() => { localStorage.setItem(LS_KEYS.level, String(level)); }, [level]);
  useEffect(() => { localStorage.setItem(LS_KEYS.length, length); }, [length]);

  useEffect(() => {
    if (syncRefreshKey > 0) {
      setHistory(loadExtensiveHistory());
      setStats(loadExtensiveStats());
    }
  }, [syncRefreshKey]);

  const current = passages[currentIdx];

  const resolveAudioUrlForEntry = useCallback(async (entry) => {
    if (!getCachedAudio(entry.id)) {
      try {
        await pullCloudAudio({ gasUrl, itemId: entry.id });
      } catch (err) {
        console.warn('Cloud audio fetch failed:', err);
      }
    }
    const cached = getCachedAudio(entry.id);
    if (cached) return base64ToAudioUrl(cached);

    const tts = await resolveItemAudio({
      itemId: entry.id,
      gasUrl,
      lines: entry.item.lines,
      level: entry.level,
      instructions: entry.item.tts_instructions || '',
      cefr: entry.cefr || DEFAULT_CEFR,
      shell: 'extensive',
      onCacheSave: cacheAudioLocallyAndCloud,
    });
    return tts.playableUrl;
  }, [gasUrl, cacheAudioLocallyAndCloud]);

  const saveToHistory = useCallback((passage) => {
    setHistory(upsertExtensiveHistoryEntry({
      id: passage.id,
      item: passage.item,
      scene,
      level,
      cefr,
      length,
      structureFlags,
      viewMode,
    }));
    scheduleCloudSync?.();
  }, [scene, level, cefr, length, structureFlags, viewMode, scheduleCloudSync]);

  const generatePassage = useCallback(async () => {
    const generated = normalizeItem(await generateContent({
      shell: 'extensive',
      scene,
      cefr,
      level,
      length,
      structureFlags,
      anthropicKey,
    }));
    const id = computeExtensiveItemId({
      item: generated,
      scene,
      level,
      cefr,
      length,
      structureFlags,
    });
    const tts = await resolveItemAudio({
      itemId: id,
      gasUrl,
      lines: generated.lines,
      level,
      instructions: generated.tts_instructions || '',
      cefr,
      shell: 'extensive',
      onCacheSave: cacheAudioLocallyAndCloud,
    });
    const url = tts.playableUrl;
    return { id, item: generated, audioUrl: url, cached: tts.cached, startedAt: Date.now() };
  }, [anthropicKey, scene, cefr, level, length, structureFlags, gasUrl, cacheAudioLocallyAndCloud]);

  async function startListening() {
    if (!anthropicKey) {
      setError('Anthropic API キーが必要です');
      return;
    }
    setError('');
    setStage('loading');
    setStatusMsg(UI.extensive.loadingFirst);
    try {
      const first = await generatePassage();
      saveToHistory(first);
      setPassages([first]);
      setCurrentIdx(0);
      setStage('listening');
      prefetchRef.current = generatePassage();
    } catch (e) {
      setError(String(e.message || e));
      setStage('setup');
    }
  }

  async function openPassageFromHistory(entry, { listenOnly = false } = {}) {
    setError('');
    setStage('loading');
    setStatusMsg(hasCachedAudio(entry.id) ? UI.extensive.loadingCached : UI.extensive.loadingAudio);
    try {
      const audioUrl = await resolveAudioUrlForEntry(entry);
      const passage = {
        id: entry.id,
        item: normalizeItem(entry.item),
        audioUrl,
        startedAt: Date.now(),
      };
      setCefr(entry.cefr || DEFAULT_CEFR);
      setScene(migrateSceneId(entry.scene));
      setLevel(entry.level);
      setLength(entry.length || 'short_passage');
      setStructureFlags(entry.structureFlags || []);
      setViewMode(entry.viewMode || 'read_listen');
      setPassages([passage]);
      setCurrentIdx(0);
      touchExtensiveHistoryEntry(entry.id);
      setHistory(loadExtensiveHistory());
      scheduleCloudSync?.();

      if (listenOnly) {
        setStage('setup');
        audioPlayer.play(audioUrl, entry.id, { showProgress: true });
      } else {
        setStage('listening');
      }
    } catch (e) {
      setError(String(e.message || e));
      setStage('setup');
    }
  }

  async function listenFromHistory(entry) {
    await openPassageFromHistory(entry, { listenOnly: true });
  }

  async function replayFromHistory(entry) {
    await openPassageFromHistory(entry);
  }

  function handleRemoveHistory(id) {
    setHistory(removeExtensiveHistoryEntry(id));
    scheduleCloudSync?.();
    scheduleAudioDelete?.(id);
  }

  async function prefetchNext() {
    if (prefetchRef.current) return prefetchRef.current;
    prefetchRef.current = generatePassage();
    return prefetchRef.current;
  }

  async function handlePassageEnded() {
    if (current) {
      const durationSec = (Date.now() - current.startedAt) / 1000;
      setStats(recordPassageComplete({ durationSec, structureFlags, item: current.item }));
      scheduleCloudSync?.();
    }
    if (!autoContinue) return;
    try {
      const next = await prefetchNext();
      prefetchRef.current = null;
      saveToHistory(next);
      setPassages((prev) => [...prev, next]);
      setCurrentIdx((i) => i + 1);
      prefetchRef.current = generatePassage();
    } catch (e) {
      console.warn('Prefetch failed:', e);
    }
  }

  function goPrev() {
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  }

  function goNext() {
    if (currentIdx < passages.length - 1) setCurrentIdx((i) => i + 1);
  }

  function handleTouchStart(e) {
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (touchStartY.current == null) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta < -50) goNext();
    if (delta > 50) goPrev();
    touchStartY.current = null;
  }

  function toggleStructureFlag(key) {
    setStructureFlags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function sendToShadowing() {
    if (!current) return;
    addToShadowQueue({ item: current.item, scene, level, cefr, source: 'extensive' });
    scheduleCloudSync?.();
  }

  function backToSetup() {
    setPassages([]);
    setCurrentIdx(0);
    prefetchRef.current = null;
    setStage('setup');
    setHistory(loadExtensiveHistory());
  }

  if (stage === 'setup') {
    return (
      <div className="extensive-setup">
        {error && <div className="status error">{error}</div>}

        {!anthropicKey && (
          <div className="onboarding-banner">
            <p>{UI.extensive.needKeyHint}</p>
          </div>
        )}

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
          <label>{UI.common.level}</label>
          <div className="choices">
            {Object.entries(LEVELS).filter(([k]) => Number(k) < 5).map(([key, l]) => (
              <button key={key} className="choice" aria-pressed={level === Number(key)} onClick={() => setLevel(Number(key))}>{l.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{UI.extensive.contentLength}</label>
          <div className="choices">
            {Object.entries(UI.length).map(([key, opt]) => (
              <button key={key} className="choice" aria-pressed={length === key} onClick={() => setLength(key)}>
                <span className="choice-label">{opt.label}</span>
                <span className="choice-meta">{opt.description}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{UI.extensive.structureFocus}</label>
          <p className="field-hint">{UI.extensive.structureFocusHint}</p>
          <div className="choices">
            {Object.entries(STRUCTURE_FLAGS).map(([key, f]) => (
              <button key={key} className="choice" aria-pressed={structureFlags.includes(key)} onClick={() => toggleStructureFlag(key)}>{f.labelJa || f.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{UI.extensive.viewMode}</label>
          <div className="choices">
            <button className="choice" aria-pressed={viewMode === 'read_listen'} onClick={() => setViewMode('read_listen')}>{UI.extensive.readListen}</button>
            <button className="choice" aria-pressed={viewMode === 'listen_only'} onClick={() => setViewMode('listen_only')}>{UI.extensive.listenOnly}</button>
          </div>
        </div>
        <button className="btn" onClick={startListening} disabled={!anthropicKey}>{UI.extensive.start}</button>

        {history.length > 0 && (
          <HistoryList
            history={history}
            onReplay={replayFromHistory}
            onListen={listenFromHistory}
            onRemove={handleRemoveHistory}
            syncStatus={cloudSync?.syncStatus}
          />
        )}

        <StatsPanel stats={stats} />
      </div>
    );
  }

  if (stage === 'loading') {
    return <div className="status">{statusMsg}</div>;
  }

  return (
    <div
      className="extensive-listening"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="session-meta">
        <span>{CEFR_LEVELS[cefr]?.label}</span>
        <span>{SCENES[scene]?.label}</span>
        <span>{UI.length[length]?.label || length}</span>
        <span>{passages.length > 1 ? `${currentIdx + 1} / ${passages.length}` : '1'}</span>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewMode(viewMode === 'read_listen' ? 'listen_only' : 'read_listen')}>
          {viewMode === 'read_listen' ? UI.extensive.listenOnly : UI.extensive.readListen}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlaybackRate((r) => (r === 1 ? 1.25 : r === 1.25 ? 0.85 : 1))}>
          {UI.extensive.speed} {playbackRate}x
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-pressed={autoContinue} onClick={() => setAutoContinue((v) => !v)}>
          {UI.extensive.auto} {autoContinue ? 'ON' : 'OFF'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={sendToShadowing}>{UI.extensive.addToShadowing}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={backToSetup}>{UI.extensive.setup}</button>
      </div>

      {current && (
        viewMode === 'read_listen' ? (
          <PassagePlayer
            key={current.id}
            item={current.item}
            audioUrl={current.audioUrl}
            itemId={current.id}
            audioPlayer={audioPlayer}
            showScript
            onEnded={handlePassageEnded}
            playbackRate={playbackRate}
          />
        ) : (
          <ListenOnlyView
            key={current.id}
            item={current.item}
            audioUrl={current.audioUrl}
            itemId={current.id}
            audioPlayer={audioPlayer}
            onEnded={handlePassageEnded}
            playbackRate={playbackRate}
          />
        )
      )}

      <p className="field-hint">{UI.extensive.swipeHint}</p>
      <StatsPanel stats={stats} compact />
    </div>
  );
}

function HistoryList({ history, onReplay, onListen, onRemove, syncStatus }) {
  return (
    <section className="history-section">
      <h2 className="history-heading">Past items</h2>
      <p className="field-hint">
        {UI.extensive.historyHint}
        {syncStatus && syncStatus !== 'disabled' ? UI.common.syncAudioFromDrive : ''}
      </p>
      <ul className="history-list">
        {history.map((entry) => (
          <li key={entry.id} className="history-item">
            <div className="history-main">
              <div className="history-preview">{entry.preview}</div>
              <div className="history-meta">
                <span>{entry.cefr || DEFAULT_CEFR}</span>
                <span>{SCENES[migrateSceneId(entry.scene)]?.label}</span>
                <span>{LEVELS[entry.level]?.label?.split(' — ')[0]}</span>
                <span>{UI.length[entry.length]?.label || entry.length}</span>
                {hasCachedAudio(entry.id) && <span className="history-cache-badge">{UI.common.audioSaved}</span>}
              </div>
            </div>
            <div className="history-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onListen(entry)} aria-label="Listen">▶</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReplay(entry)}>{UI.extensive.open}</button>
              <button type="button" className="btn btn-ghost btn-sm history-remove" onClick={() => onRemove(entry.id)}>{UI.common.delete}</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatsPanel({ stats, compact }) {
  const structureEntries = Object.entries(stats.structureCounts || {});
  if (compact && !structureEntries.length) return null;
  return (
    <section className="history-section" style={{ marginTop: 24 }}>
      <h2 className="history-heading">Listening stats</h2>
      <p className="field-hint">
        {UI.extensive.statsTotal}: {Math.round(stats.totalMinutes)} {UI.extensive.statsMin} · {UI.extensive.statsPassages}: {stats.passagesCompleted}
        {(stats.structureValidation?.checked || 0) > 0 && (
          <> · {UI.extensive.statsStructureCompliance}: {Math.round((stats.structureValidation.compliant / stats.structureValidation.checked) * 100)}%</>
        )}
      </p>
      {structureEntries.length > 0 && (
        <ul className="feature-list">
          {structureEntries.map(([k, v]) => (
            <li key={k} className="feature-item">
              <span>{STRUCTURE_FLAGS[k]?.labelJa || STRUCTURE_FLAGS[k]?.label || k}</span>
              <span>{v}×</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
