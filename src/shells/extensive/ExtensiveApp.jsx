import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SCENES, migrateSceneId } from '../../core/shared/sceneConfig.js';
import { LEVELS } from '../../core/shared/levels.js';
import { CEFR_LEVELS, migrateCefrFromStorage, getRecommendedLevel } from '../../core/shared/cefr.js';
import { STRUCTURE_FLAGS } from '../../core/shared/structureFlags.js';
import { generateContent } from '../../core/generation/index.js';
import { normalizeItem, resolveItemAudio, resolveAudioUrl } from '../../core/audio/index.js';
import { loadExtensiveStats, recordPassageComplete } from '../../core/shared/extensiveStats.js';
import { addToShadowQueue } from '../../core/shared/materialQueue.js';
import { DEFAULT_GAS_URL } from '../../lib/config.js';
import { saveCachedAudio } from '../../lib/storage.js';
import PassagePlayer from './PassagePlayer.jsx';
import ListenOnlyView from './ListenOnlyView.jsx';

const LS_KEYS = {
  cefr: 'elt_extensive_cefr',
  scene: 'elt_extensive_scene',
  level: 'elt_extensive_level',
  length: 'elt_extensive_length',
};

const LENGTH_OPTIONS = {
  short_passage: { label: 'Short passage', description: '3–6 sentences' },
  long_passage: { label: 'Long passage', description: '5–8 sentences' },
  dialogue: { label: 'Dialogue', description: '4–8 turns' },
};

export default function ExtensiveApp({ anthropicKey, audioPlayer, gasUrl = DEFAULT_GAS_URL }) {
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
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [stats, setStats] = useState(() => loadExtensiveStats());
  const prefetchRef = useRef(null);
  const touchStartY = useRef(null);

  useEffect(() => { localStorage.setItem(LS_KEYS.cefr, cefr); }, [cefr]);
  useEffect(() => { localStorage.setItem(LS_KEYS.scene, scene); }, [scene]);
  useEffect(() => { localStorage.setItem(LS_KEYS.level, String(level)); }, [level]);
  useEffect(() => { localStorage.setItem(LS_KEYS.length, length); }, [length]);

  const current = passages[currentIdx];

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
    const id = `ex${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const tts = await resolveItemAudio({
      itemId: id,
      gasUrl,
      lines: generated.lines,
      level,
      instructions: generated.tts_instructions || '',
      cefr,
      shell: 'extensive',
      onCacheSave: (_, b64) => saveCachedAudio(id, b64),
    });
    const url = tts.url || resolveAudioUrl({ url: tts.url, audioBase64: tts.audioBase64 });
    return { id, item: generated, audioUrl: url, cached: tts.cached, startedAt: Date.now() };
  }, [anthropicKey, scene, cefr, level, length, structureFlags, gasUrl]);

  async function startListening() {
    if (!anthropicKey) {
      setError('Anthropic API key required');
      return;
    }
    setError('');
    setStage('loading');
    setStatusMsg('Generating first passage…');
    try {
      const first = await generatePassage();
      setPassages([first]);
      setCurrentIdx(0);
      setStage('listening');
      prefetchRef.current = generatePassage();
    } catch (e) {
      setError(String(e.message || e));
      setStage('setup');
    }
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
    }
    if (!autoContinue) return;
    try {
      const next = await prefetchNext();
      prefetchRef.current = null;
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
    alert('Added to shadowing queue.');
  }

  if (stage === 'setup') {
    return (
      <div className="extensive-setup">
        {error && <div className="status error">{error}</div>}
        <div className="field">
          <label>CEFR</label>
          <div className="choices">
            {Object.entries(CEFR_LEVELS).map(([key, c]) => (
              <button key={key} className="choice" aria-pressed={cefr === key} onClick={() => setCefr(key)}>{c.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Scene</label>
          <div className="choices">
            {Object.entries(SCENES).map(([key, s]) => (
              <button key={key} className="choice" aria-pressed={scene === key} onClick={() => setScene(key)}>{s.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Level</label>
          <div className="choices">
            {Object.entries(LEVELS).filter(([k]) => Number(k) < 5).map(([key, l]) => (
              <button key={key} className="choice" aria-pressed={level === Number(key)} onClick={() => setLevel(Number(key))}>{l.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Content length</label>
          <div className="choices">
            {Object.entries(LENGTH_OPTIONS).map(([key, opt]) => (
              <button key={key} className="choice" aria-pressed={length === key} onClick={() => setLength(key)}>
                <span className="choice-label">{opt.label}</span>
                <span className="choice-meta">{opt.description}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Structure focus (input flooding)</label>
          <div className="choices">
            {Object.entries(STRUCTURE_FLAGS).map(([key, f]) => (
              <button key={key} className="choice" aria-pressed={structureFlags.includes(key)} onClick={() => toggleStructureFlag(key)}>{f.label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>View mode</label>
          <div className="choices">
            <button className="choice" aria-pressed={viewMode === 'read_listen'} onClick={() => setViewMode('read_listen')}>Read + Listen</button>
            <button className="choice" aria-pressed={viewMode === 'listen_only'} onClick={() => setViewMode('listen_only')}>Listen only</button>
          </div>
        </div>
        <button className="btn" onClick={startListening} disabled={!anthropicKey}>Start listening</button>
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
        <span>{passages.length > 1 ? `${currentIdx + 1} / ${passages.length}` : '1'}</span>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setViewMode(viewMode === 'read_listen' ? 'listen_only' : 'read_listen')}>
          {viewMode === 'read_listen' ? 'Listen only' : 'Read + Listen'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlaybackRate((r) => (r === 1 ? 1.25 : r === 1.25 ? 0.85 : 1))}>
          Speed {playbackRate}x
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-pressed={autoContinue} onClick={() => setAutoContinue((v) => !v)}>
          Auto {autoContinue ? 'ON' : 'OFF'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={sendToShadowing}>→ Shadow</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStage('setup')}>Setup</button>
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

      <p className="field-hint">Swipe up/down for prev/next passage</p>
      <StatsPanel stats={stats} compact />
    </div>
  );
}

function StatsPanel({ stats, compact }) {
  const structureEntries = Object.entries(stats.structureCounts || {});
  if (compact && !structureEntries.length) return null;
  return (
    <section className="history-section" style={{ marginTop: 24 }}>
      <h2 className="history-heading">Listening stats</h2>
      <p className="field-hint">
        Total: {Math.round(stats.totalMinutes)} min · Passages: {stats.passagesCompleted}
      </p>
      {structureEntries.length > 0 && (
        <ul className="feature-list">
          {structureEntries.map(([k, v]) => (
            <li key={k} className="feature-item">
              <span>{STRUCTURE_FLAGS[k]?.label || k}</span>
              <span>{v}×</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
