import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SCENES, migrateSceneId, migrateExtensiveScene, SCENE_RANDOM, resolveSceneForGeneration, getSceneLabel } from '../../core/shared/sceneConfig.js';
import { LEVELS } from '../../core/shared/levels.js';
import { CEFR_LEVELS, DEFAULT_CEFR, migrateCefrFromStorage, getRecommendedLevel } from '../../core/shared/cefr.js';
import { STRUCTURE_FLAGS } from '../../core/shared/structureFlags.js';
import { generateContent } from '../../core/generation/index.js';
import { normalizeItem, resolveItemAudio, base64ToAudioUrl } from '../../core/audio/index.js';
import { loadExtensiveStats, recordPassageComplete, getChunkEncounterRows, isExtensiveDebugMode } from '../../core/shared/extensiveStats.js';
import { tryAddToShadowQueue, hasShadowQueueEntryForSource } from '../../core/shared/materialQueue.js';
import { DEFAULT_GAS_URL } from '../../lib/config.js';
import { pullCloudAudio } from '../../lib/sync.js';
import { useVerticalSwipe } from '../../hooks/useVerticalSwipe.js';
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
  homeNonce = 0,
}) {
  const [stage, setStage] = useState('setup');
  const [cefr, setCefr] = useState(() => migrateCefrFromStorage(localStorage.getItem(LS_KEYS.cefr)));
  const [scene, setScene] = useState(() => migrateExtensiveScene(localStorage.getItem(LS_KEYS.scene)));
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
  const [shadowToast, setShadowToast] = useState('');
  const [shadowQueuedIds, setShadowQueuedIds] = useState(() => new Set());
  const prefetchRef = useRef(null);
  const swipeLoadingRef = useRef(false);
  const endedPassageRef = useRef(null);

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

  useEffect(() => {
    endedPassageRef.current = null;
  }, [current?.id]);

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
      scene: passage.scene ?? resolveSceneForGeneration(scene),
      level,
      cefr,
      length,
      structureFlags,
      viewMode,
    }));
    scheduleCloudSync?.();
  }, [scene, level, cefr, length, structureFlags, viewMode, scheduleCloudSync]);

  const generatePassage = useCallback(async () => {
    const resolvedScene = resolveSceneForGeneration(scene);
    const generated = normalizeItem(await generateContent({
      shell: 'extensive',
      scene: resolvedScene,
      cefr,
      level,
      length,
      structureFlags,
      anthropicKey,
    }));
    const id = computeExtensiveItemId({
      item: generated,
      scene: resolvedScene,
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
    return {
      id,
      item: generated,
      audioUrl: url,
      cached: tts.cached,
      scene: resolvedScene,
      startedAt: Date.now(),
    };
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

  async function openPassageFromHistory(entry) {
    setError('');
    setStage('loading');
    setStatusMsg(hasCachedAudio(entry.id) ? UI.extensive.loadingCached : UI.extensive.loadingAudio);
    try {
      const audioUrl = await resolveAudioUrlForEntry(entry);
      const passage = {
        id: entry.id,
        item: normalizeItem(entry.item),
        audioUrl,
        scene: migrateSceneId(entry.scene),
        startedAt: Date.now(),
      };
      setCefr(entry.cefr || DEFAULT_CEFR);
      setLevel(entry.level);
      setLength(entry.length || 'short_passage');
      setStructureFlags(entry.structureFlags || []);
      setViewMode(entry.viewMode || 'read_listen');
      setPassages([passage]);
      setCurrentIdx(0);
      touchExtensiveHistoryEntry(entry.id);
      setHistory(loadExtensiveHistory());
      scheduleCloudSync?.();
      setStage('listening');
      if (anthropicKey) prefetchRef.current = generatePassage();
    } catch (e) {
      setError(String(e.message || e));
      setStage('setup');
    }
  }

  async function listenFromHistory(entry) {
    await openPassageFromHistory(entry);
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
    if (!current || endedPassageRef.current === current.id) return;
    endedPassageRef.current = current.id;

    const durationSec = (Date.now() - current.startedAt) / 1000;
    setStats(recordPassageComplete({
      durationSec,
      structureFlags,
      item: current.item,
      passageId: current.id,
      cefr,
    }));
    scheduleCloudSync?.();

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

  const goPrev = useCallback(() => {
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  }, [currentIdx]);

  const goNext = useCallback(async () => {
    if (currentIdx < passages.length - 1) {
      setCurrentIdx((i) => i + 1);
      return;
    }
    if (!anthropicKey || swipeLoadingRef.current) return;
    swipeLoadingRef.current = true;
    try {
      const next = await prefetchNext();
      prefetchRef.current = null;
      saveToHistory(next);
      setPassages((prev) => [...prev, next]);
      setCurrentIdx((i) => i + 1);
      prefetchRef.current = generatePassage();
    } catch (e) {
      console.warn('Prefetch on swipe failed:', e);
    } finally {
      swipeLoadingRef.current = false;
    }
  }, [anthropicKey, currentIdx, passages.length, saveToHistory, generatePassage]);

  const swipeRef = useVerticalSwipe({
    onSwipeUp: goNext,
    onSwipeDown: goPrev,
    enabled: stage === 'listening',
  });

  function toggleStructureFlag(key) {
    setStructureFlags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function sendToShadowing() {
    if (!current) return;
    const result = tryAddToShadowQueue({
      item: current.item,
      scene: current.scene ?? resolveSceneForGeneration(scene),
      level,
      cefr,
      source: 'extensive',
      sourceItemId: current.id,
    });
    if (!result.ok) {
      if (result.reason === 'full') {
        setShadowToast(UI.extensive.shadowQueueFull);
        setTimeout(() => setShadowToast(''), 3000);
      }
      return;
    }
    setShadowQueuedIds((prev) => new Set(prev).add(current.id));
    scheduleCloudSync?.();
    setShadowToast(UI.extensive.addToShadowingAdded);
    setTimeout(() => setShadowToast(''), 2500);
  }

  const currentInShadowQueue = current
    ? shadowQueuedIds.has(current.id) || hasShadowQueueEntryForSource(current.id)
    : false;

  function backToSetup() {
    setPassages([]);
    setCurrentIdx(0);
    prefetchRef.current = null;
    setStage('setup');
    setHistory(loadExtensiveHistory());
    setStats(loadExtensiveStats());
  }

  useEffect(() => {
    if (!homeNonce) return;
    backToSetup();
  }, [homeNonce]);

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
          {scene === SCENE_RANDOM && (
            <p className="field-hint">{UI.extensive.sceneRandomHint}</p>
          )}
          <div className="choices choices-scene">
            <button
              type="button"
              className="choice choice-chip"
              aria-pressed={scene === SCENE_RANDOM}
              onClick={() => setScene(SCENE_RANDOM)}
            >
              {UI.common.sceneRandom}
            </button>
            {Object.entries(SCENES).map(([key, s]) => (
              <button
                key={key}
                type="button"
                className="choice choice-chip"
                aria-pressed={scene === key}
                onClick={() => setScene(key)}
              >
                {s.label}
              </button>
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

        <StatsPanel stats={stats} cefr={cefr} />
      </div>
    );
  }

  if (stage === 'loading') {
    return <div className="status">{statusMsg}</div>;
  }

  return (
    <div
      ref={swipeRef}
      className="extensive-listening"
    >
      <div className="session-meta">
        <span>{CEFR_LEVELS[cefr]?.label}</span>
        <span>{getSceneLabel(current?.scene ?? scene, { randomLabel: UI.common.sceneRandom })}</span>
        <span>{UI.length[length]?.label || length}</span>
        <span>{passages.length > 1 ? `${currentIdx + 1} / ${passages.length}` : '1'}</span>
      </div>

      <button type="button" className="btn-back-link" onClick={backToSetup}>{UI.common.back}</button>

      <div className="row listening-controls">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewMode(viewMode === 'read_listen' ? 'listen_only' : 'read_listen')}>
          {viewMode === 'read_listen' ? UI.extensive.listenOnly : UI.extensive.readListen}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlaybackRate((r) => (r === 1 ? 1.25 : r === 1.25 ? 0.85 : 1))}>
          {UI.extensive.speed} {playbackRate}x
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-pressed={autoContinue} onClick={() => setAutoContinue((v) => !v)}>
          {UI.extensive.auto} {autoContinue ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={sendToShadowing}
          disabled={currentInShadowQueue}
        >
          {currentInShadowQueue ? UI.extensive.addToShadowingDone : UI.extensive.addToShadowing}
        </button>
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
      {shadowToast && <p className="status shadow-toast">{shadowToast}</p>}
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

function StatsPanel({ stats, cefr }) {
  const [showAllChunks, setShowAllChunks] = useState(false);
  const debug = isExtensiveDebugMode();
  const structureEntries = Object.entries(stats.structureEncounters || {})
    .filter(([, v]) => (v?.occurrences || 0) > 0);
  const { top, recent, all } = getChunkEncounterRows(stats, { cefr });

  return (
    <>
      <section className="history-section" style={{ marginTop: 24 }}>
        <h2 className="history-heading">Listening stats</h2>
        <p className="field-hint">
          {UI.extensive.statsTotal}: {Math.round(stats.totalMinutes)} {UI.extensive.statsMin}
          {' · '}
          {UI.extensive.statsPassages}: {stats.passagesCompleted}
          {debug && (stats.structureValidation?.checked || 0) > 0 && (
            <>
              {' · '}
              {UI.extensive.statsStructureCompliance}:{' '}
              {Math.round((stats.structureValidation.compliant / stats.structureValidation.checked) * 100)}%
            </>
          )}
        </p>

        {structureEntries.length > 0 && (
          <>
            <h3 className="history-subheading">{UI.extensive.structureFocus}</h3>
            <ul className="feature-list">
              {structureEntries.map(([k, v]) => (
                <li key={k} className="feature-item">
                  <span>{STRUCTURE_FLAGS[k]?.labelJa || STRUCTURE_FLAGS[k]?.label || k}</span>
                  <span>
                    {UI.extensive.statsStructureEncounter} {v.occurrences} {UI.extensive.statsStructureTimes}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h3 className="history-subheading">{UI.extensive.statsChunksHeading}</h3>
        {top.length === 0 && recent.length === 0 ? (
          <p className="field-hint">{UI.extensive.statsChunksEmpty}</p>
        ) : (
          <>
            {top.length > 0 && (
              <>
                <p className="field-hint">{UI.extensive.statsChunksTop}</p>
                <ChunkList rows={top} />
              </>
            )}
            {recent.length > 0 && (
              <>
                <p className="field-hint" style={{ marginTop: 12 }}>{UI.extensive.statsChunksRecent}</p>
                <ChunkList rows={recent} />
              </>
            )}
            {all.length > 10 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => setShowAllChunks(true)}
              >
                {UI.extensive.statsChunksViewAll}
              </button>
            )}
          </>
        )}
      </section>

      {showAllChunks && (
        <div className="modal-overlay" onClick={() => setShowAllChunks(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2 className="history-heading">{UI.extensive.statsChunksHeading}</h2>
            <ChunkList rows={all} />
            <button type="button" className="btn btn-ghost" onClick={() => setShowAllChunks(false)}>
              {UI.common.close}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ChunkList({ rows }) {
  return (
    <ul className="feature-list">
      {rows.map((row) => (
        <li key={row.chunk} className="feature-item">
          <span className="chunk-label">{row.chunk}</span>
          <span>
            {UI.extensive.statsStructureEncounter} {row.count} {UI.extensive.statsStructureTimes}
            {' / '}
            {row.distinct_passages} {UI.extensive.statsChunksContexts}
          </span>
        </li>
      ))}
    </ul>
  );
}
