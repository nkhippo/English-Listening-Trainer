import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
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
import { useExtensiveMediaSession } from '../../hooks/useExtensiveMediaSession.js';
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
import ExtensiveAudioBar from './ExtensiveAudioBar.jsx';
import HistoryPlaylistPlayer from './HistoryPlaylistPlayer.jsx';
import { filterHistory, hasActiveHistoryFilters } from './historyFilters.js';
import { UI } from '../../core/shared/uiJa.js';

const AUTO_PLAY_DELAY_MS = 1000;

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
  const [passageLoading, setPassageLoading] = useState(false);
  const [autoPlayPassageId, setAutoPlayPassageId] = useState(null);
  const prefetchRef = useRef(null);
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
        item: normalizeItem({
          ...entry.item,
          content_length: entry.length || entry.item?.content_length,
        }),
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

  const advanceToNextPassage = useCallback(async ({ autoPlay = false } = {}) => {
    setPassageLoading(true);
    try {
      const next = await prefetchNext();
      prefetchRef.current = null;
      saveToHistory(next);
      flushSync(() => {
        if (autoPlay) setAutoPlayPassageId(next.id);
        setPassages((prev) => [...prev, next]);
        setCurrentIdx((i) => i + 1);
      });
      prefetchRef.current = generatePassage();
    } catch (e) {
      console.warn('Prefetch failed:', e);
      setShadowToast(UI.extensive.loadingNextFailed);
      setTimeout(() => setShadowToast(''), 4000);
    } finally {
      setPassageLoading(false);
    }
  }, [saveToHistory, generatePassage]);

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
    await advanceToNextPassage({ autoPlay: true });
  }

  const goPrev = useCallback(() => {
    if (currentIdx <= 0) return;
    endedPassageRef.current = null;
    setCurrentIdx((i) => i - 1);
  }, [currentIdx]);

  const goNext = useCallback(async () => {
    if (passageLoading) return;
    if (currentIdx < passages.length - 1) {
      endedPassageRef.current = null;
      setCurrentIdx((i) => i + 1);
      return;
    }
    if (!anthropicKey) return;
    await advanceToNextPassage();
  }, [anthropicKey, currentIdx, passages.length, passageLoading, advanceToNextPassage]);

  useExtensiveMediaSession({
    enabled: stage === 'listening',
    current,
    audioPlayer,
    onNext: goNext,
    onPrev: goPrev,
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
          <div className="choices choices-cefr">
            {Object.entries(CEFR_LEVELS).map(([key, c]) => (
              <button key={key} type="button" className="choice choice-chip" aria-pressed={cefr === key} onClick={() => setCefr(key)}>{c.label}</button>
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
            audioPlayer={audioPlayer}
            resolveAudioUrl={resolveAudioUrlForEntry}
            onItemPlayed={(id) => {
              touchExtensiveHistoryEntry(id);
              setHistory(loadExtensiveHistory());
              scheduleCloudSync?.();
            }}
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
    <div className="extensive-listening">
      <div className="listening-chrome">
        <div className="listening-chrome-head">
          <button type="button" className="btn-back-link" onClick={backToSetup}>{UI.common.back}</button>
          <div className="session-meta session-meta--compact">
            <span>{CEFR_LEVELS[cefr]?.label}</span>
            <span>{getSceneLabel(current?.scene ?? scene, { randomLabel: UI.common.sceneRandom })}</span>
            <span>{passages.length > 1 ? `${currentIdx + 1}/${passages.length}` : '1'}</span>
          </div>
        </div>

        <div className="listening-chrome-transport">
          <button
            type="button"
            className="btn btn-ghost btn-sm passage-transport-nav"
            onClick={goPrev}
            disabled={currentIdx <= 0}
            aria-label={UI.extensive.prevPassage}
          >
            {UI.extensive.prevPassageShort}
          </button>
          {current && (
            <ExtensiveAudioBar
              key={current.id}
              item={current.item}
              audioUrl={current.audioUrl}
              itemId={current.id}
              audioPlayer={audioPlayer}
              playbackRate={playbackRate}
              onEnded={handlePassageEnded}
              autoPlayAfterMs={autoPlayPassageId === current.id ? AUTO_PLAY_DELAY_MS : 0}
              onAutoPlayStarted={() => setAutoPlayPassageId(null)}
            />
          )}
          <button
            type="button"
            className="btn btn-sm passage-transport-nav"
            onClick={goNext}
            disabled={passageLoading || (currentIdx >= passages.length - 1 && !anthropicKey)}
            aria-label={UI.extensive.nextPassage}
          >
            {passageLoading ? UI.extensive.loadingNextShort : UI.extensive.nextPassageShort}
          </button>
        </div>

        <div className="listening-chrome-actions" role="toolbar" aria-label={UI.extensive.listeningControls}>
          <button
            type="button"
            className="btn btn-ghost btn-sm listening-chrome-chip"
            aria-pressed={viewMode === 'listen_only'}
            onClick={() => setViewMode(viewMode === 'read_listen' ? 'listen_only' : 'read_listen')}
          >
            {viewMode === 'read_listen' ? UI.extensive.listenOnlyShort : UI.extensive.readListenShort}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm listening-chrome-chip"
            onClick={() => setPlaybackRate((r) => (r === 1 ? 1.25 : r === 1.25 ? 0.85 : 1))}
          >
            {playbackRate}x
          </button>
          <button
            type="button"
            className="btn btn-sm btn-toggle listening-chrome-chip"
            aria-pressed={autoContinue}
            aria-label={autoContinue ? UI.extensive.autoAriaOn : UI.extensive.autoAriaOff}
            onClick={() => setAutoContinue((v) => !v)}
          >
            {UI.extensive.autoShort} {autoContinue ? UI.extensive.autoOn : UI.extensive.autoOff}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm listening-chrome-chip"
            onClick={sendToShadowing}
            disabled={currentInShadowQueue}
          >
            {currentInShadowQueue ? UI.extensive.shadowDoneShort : UI.extensive.shadowShort}
          </button>
        </div>
      </div>

      {current && (
        <div className={`passage-stage${passageLoading ? ' is-loading-next' : ''}`}>
          {passageLoading && (
            <div className="extensive-loading-next" role="status" aria-live="polite">
              <span className="extensive-loading-spinner" aria-hidden="true" />
              <p>{UI.extensive.loadingNext}</p>
            </div>
          )}
          {viewMode === 'read_listen' ? (
            <PassagePlayer key={current.id} item={current.item} showScript />
          ) : (
            <ListenOnlyView key={current.id} item={current.item} />
          )}
        </div>
      )}

      {shadowToast && <p className="status shadow-toast">{shadowToast}</p>}
    </div>
  );
}

function HistoryList({
  history, onReplay, onListen, onRemove, syncStatus,
  audioPlayer, resolveAudioUrl, onItemPlayed,
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [playlist, setPlaylist] = useState(null);
  const [filterCefr, setFilterCefr] = useState(null);
  const [filterLevel, setFilterLevel] = useState(null);
  const [filterStructureFlags, setFilterStructureFlags] = useState([]);

  const filters = { cefr: filterCefr, level: filterLevel, structureFlags: filterStructureFlags };
  const filteredHistory = useMemo(
    () => filterHistory(history, filters),
    [history, filterCefr, filterLevel, filterStructureFlags],
  );
  const filtersActive = hasActiveHistoryFilters(filters);
  const filteredIdKey = useMemo(
    () => filteredHistory.map((e) => e.id).join(','),
    [filteredHistory],
  );

  const playlistCurrentId = playlist?.entries[playlist.currentIdx ?? 0]?.id ?? null;
  const playlistActive = Boolean(playlist);

  useEffect(() => {
    const visible = new Set(filteredIdKey ? filteredIdKey.split(',') : []);
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredIdKey]);

  function toggleStructureFilter(key) {
    setFilterStructureFlags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(filteredHistory.map((e) => e.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    clearSelection();
  }

  function startPlaylist(entries) {
    if (!entries.length) return;
    audioPlayer.stop?.();
    setSelectMode(false);
    setPlaylist({ entries, currentIdx: 0 });
  }

  function stopPlaylist() {
    audioPlayer.stop?.();
    setPlaylist(null);
  }

  const filterCountLabel = UI.extensive.historyFilterCount
    .replace('{shown}', String(filteredHistory.length))
    .replace('{total}', String(history.length));

  return (
    <section className="history-section">
      <div className="history-section-header">
        <h2 className="history-heading">Past items</h2>
        <div className="history-sync-actions">
          {!playlistActive && !selectMode && (
            <>
              {!filtersActive && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => startPlaylist([...history])}>
                  {UI.extensive.historyPlayAll}
                </button>
              )}
              {filtersActive && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={filteredHistory.length === 0}
                  onClick={() => startPlaylist([...filteredHistory])}
                >
                  {UI.extensive.historyPlayFiltered} ({filteredHistory.length})
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={filteredHistory.length === 0}
                onClick={() => { setSelectMode(true); selectAll(); }}
              >
                {UI.extensive.historyPlaySelect}
              </button>
            </>
          )}
          {selectMode && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={selectAll}>
                {UI.extensive.historySelectAll}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearSelection}>
                {UI.extensive.historySelectNone}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={selectedIds.size === 0}
                onClick={() => startPlaylist(filteredHistory.filter((e) => selectedIds.has(e.id)))}
              >
                {UI.extensive.historyPlaySelected} ({selectedIds.size})
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={exitSelectMode}>
                {UI.extensive.historySelectCancel}
              </button>
            </>
          )}
        </div>
      </div>
      <p className="field-hint">
        {UI.extensive.historyHint}
        {syncStatus && syncStatus !== 'disabled' ? UI.common.syncAudioFromDrive : ''}
      </p>

      <div className="history-filters">
        <div className="history-filter-field">
          <label>{UI.common.cefr}</label>
          <div className="choices choices-compact">
            <button
              type="button"
              className="choice choice-chip"
              aria-pressed={filterCefr == null}
              onClick={() => setFilterCefr(null)}
            >
              {UI.extensive.historyFilterAll}
            </button>
            {Object.entries(CEFR_LEVELS).map(([key, c]) => (
              <button
                key={key}
                type="button"
                className="choice choice-chip"
                aria-pressed={filterCefr === key}
                onClick={() => setFilterCefr(key)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="history-filter-field">
          <label>{UI.common.level}</label>
          <div className="choices choices-compact">
            <button
              type="button"
              className="choice choice-chip"
              aria-pressed={filterLevel == null}
              onClick={() => setFilterLevel(null)}
            >
              {UI.extensive.historyFilterAll}
            </button>
            {Object.entries(LEVELS).filter(([k]) => Number(k) < 5).map(([key, l]) => (
              <button
                key={key}
                type="button"
                className="choice choice-chip"
                aria-pressed={filterLevel === Number(key)}
                onClick={() => setFilterLevel(Number(key))}
              >
                {l.label.split(' — ')[0]}
              </button>
            ))}
          </div>
        </div>
        <div className="history-filter-field">
          <label>{UI.extensive.structureFocus}</label>
          <div className="choices choices-compact">
            {Object.entries(STRUCTURE_FLAGS).map(([key, f]) => (
              <button
                key={key}
                type="button"
                className="choice choice-chip"
                aria-pressed={filterStructureFlags.includes(key)}
                onClick={() => toggleStructureFilter(key)}
              >
                {f.labelJa || f.label}
              </button>
            ))}
          </div>
        </div>
        <p className="field-hint history-filter-count">{filterCountLabel}</p>
      </div>

      {playlistActive && (
        <HistoryPlaylistPlayer
          entries={playlist.entries}
          startIdx={playlist.currentIdx}
          audioPlayer={audioPlayer}
          resolveAudioUrl={resolveAudioUrl}
          onStop={stopPlaylist}
          onItemPlayed={(entry) => onItemPlayed?.(entry.id)}
          onIdxChange={(currentIdx) => setPlaylist((p) => (p ? { ...p, currentIdx } : p))}
        />
      )}

      {filteredHistory.length === 0 ? (
        <p className="field-hint">{UI.extensive.historyFilterEmpty}</p>
      ) : (
        <ul className="history-list">
          {filteredHistory.map((entry) => (
            <li
              key={entry.id}
              className={`history-item${playlistCurrentId === entry.id ? ' history-item-active' : ''}${selectMode && selectedIds.has(entry.id) ? ' history-item-selected' : ''}`}
            >
              {selectMode && (
                <label className="history-select">
                  <input
                    type="checkbox"
                    className="history-select-input"
                    checked={selectedIds.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                  />
                </label>
              )}
              <div className="history-main">
                <div className="history-preview">{entry.preview}</div>
                <div className="history-meta">
                  <span>{entry.cefr || DEFAULT_CEFR}</span>
                  <span>{SCENES[migrateSceneId(entry.scene)]?.label}</span>
                  <span>{LEVELS[entry.level]?.label?.split(' — ')[0]}</span>
                  <span>{UI.length[entry.length]?.label || entry.length}</span>
                  {(entry.structureFlags || []).map((flagKey) => (
                    <span key={flagKey} className="history-flag-badge">
                      {STRUCTURE_FLAGS[flagKey]?.labelJa || flagKey}
                    </span>
                  ))}
                  {hasCachedAudio(entry.id) && <span className="history-cache-badge">{UI.common.audioSaved}</span>}
                </div>
              </div>
              <div className="history-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onListen(entry)}
                  aria-label="Listen"
                  disabled={playlistActive}
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onReplay(entry)}
                  disabled={playlistActive}
                >
                  {UI.extensive.open}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm history-remove"
                  onClick={() => onRemove(entry.id)}
                  disabled={playlistActive}
                >
                  {UI.common.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
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
