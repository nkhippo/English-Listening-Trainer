import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SCENES, LEVELS, MODES } from '../../core/generation/prompts.js';
import { CEFR_LEVELS, DEFAULT_CEFR, migrateCefrFromStorage, getRecommendedLevel } from '../../core/shared/cefr.js';
import { migrateSceneId } from '../../core/shared/sceneConfig.js';
import { UI } from '../../core/shared/uiJa.js';
import { generateContent } from '../../core/generation/index.js';
import { resolveItemAudio, base64ToAudioUrl, normalizeItem } from '../../core/audio/index.js';
import { pullCloudAudio } from '../../lib/sync.js';
import { DEFAULT_GAS_URL } from '../../lib/config.js';
import { scoreFullDictation, scoreMinimalPair } from '../../core/scoring/index.js';
import {
  computeItemId,
  loadHistory,
  upsertHistoryEntry,
  touchHistoryEntry,
  removeHistoryEntry,
  getCachedAudio,
  saveCachedAudio,
  hasCachedAudio,
} from '../../lib/storage.js';
import { useAudioPlayer } from '../../hooks/useAudioPlayer.js';
import { useCloudSync } from '../../hooks/useCloudSync.js';
import Waveform from '../../components/Waveform.jsx';
import ClozeView from './ClozeView.jsx';
import ReviewView from './ReviewView.jsx';

const LS_KEYS = {
  mode: 'elt_last_mode',
  scene: 'elt_last_scene',
  level: 'elt_last_level',
  cefr: 'elt_last_cefr',
};

export default function IntensiveApp({ anthropicKey, settingsOpen, gasUrl = DEFAULT_GAS_URL, cloudSync, syncRefreshKey = 0 }) {
  const audioPlayer = useAudioPlayer();
  const [stage, setStage] = useState('setup');
  const [mode, setMode] = useState(localStorage.getItem(LS_KEYS.mode) || 'cloze');
  const [scene, setScene] = useState(() => migrateSceneId(localStorage.getItem(LS_KEYS.scene)));
  const [cefr, setCefr] = useState(() => migrateCefrFromStorage(localStorage.getItem(LS_KEYS.cefr)));
  const [level, setLevel] = useState(() => {
    const stored = Number(localStorage.getItem(LS_KEYS.level));
    if (stored) return stored;
    return getRecommendedLevel(migrateCefrFromStorage(localStorage.getItem(LS_KEYS.cefr)));
  });
  const [item, setItem] = useState(null);
  const [itemId, setItemId] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [history, setHistory] = useState(() => loadHistory());
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [sessionKey, setSessionKey] = useState(0);

  const { schedulePush: scheduleCloudSync, scheduleAudioDelete, cacheAudio } = cloudSync;

  const cacheAudioLocallyAndCloud = useCallback(
    (id, base64) => cacheAudio(id, base64, saveCachedAudio),
    [cacheAudio],
  );

  useEffect(() => { localStorage.setItem(LS_KEYS.mode, mode); }, [mode]);
  useEffect(() => { localStorage.setItem(LS_KEYS.scene, scene); }, [scene]);
  useEffect(() => { localStorage.setItem(LS_KEYS.level, String(level)); }, [level]);
  useEffect(() => { localStorage.setItem(LS_KEYS.cefr, cefr); }, [cefr]);

  useEffect(() => {
    if (syncRefreshKey > 0) setHistory(loadHistory());
  }, [syncRefreshKey]);

  useEffect(() => {
    if (level === 5 && mode === 'minimal_pair') setMode('cloze');
  }, [level, mode]);

  function handleCefrChange(nextCefr) {
    setCefr(nextCefr);
    if (!localStorage.getItem(LS_KEYS.level)) {
      setLevel(getRecommendedLevel(nextCefr));
    }
  }

  function revokeAudioUrl() {
    if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
  }

  async function loadAudioForItem({ id, generated, lvl, cefrBand }) {
    if (!getCachedAudio(id)) {
      try {
        await pullCloudAudio({ gasUrl, itemId: id });
      } catch (err) {
        console.warn('Cloud audio fetch failed:', err);
      }
    }
    const cachedBase64 = getCachedAudio(id);
    const tts = await resolveItemAudio({
      itemId: id,
      cachedBase64,
      gasUrl,
      lines: generated.lines,
      level: lvl,
      instructions: generated.tts_instructions || '',
      cefr: cefrBand,
      shell: 'intensive',
      onCacheSave: cacheAudioLocallyAndCloud,
    });
    const url = tts.playableUrl;
    return { url, fromCache: tts.source === 'local' || tts.cached };
  }

  async function openSession({
    generated, id, sessionMode, sessionScene, sessionLevel, sessionCefr, fromHistory = false,
  }) {
    setError('');
    setStage('loading');
    setStatusMsg(fromHistory && hasCachedAudio(id) ? UI.intensive.loadingCached : UI.intensive.loadingAudio);
    try {
      const normalized = normalizeItem(generated);
      const { url } = await loadAudioForItem({ id, generated: normalized, lvl: sessionLevel, cefrBand: sessionCefr });
      revokeAudioUrl();
      setItem(normalized);
      setItemId(id);
      setMode(sessionMode);
      setScene(sessionScene);
      setLevel(sessionLevel);
      setCefr(sessionCefr);
      setAudioUrl(url);
      setSessionKey((k) => k + 1);
      setStage('session');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      try {
        setHistory(upsertHistoryEntry({
          id, item: normalized, mode: sessionMode, scene: sessionScene, level: sessionLevel, cefr: sessionCefr,
        }));
        scheduleCloudSync();
      } catch (histErr) {
        console.warn('History save failed:', histErr);
      }
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
      setStage('setup');
    }
  }

  async function startSession() {
    setError('');
    setStage('loading');
    setStatusMsg(UI.intensive.loadingGenerate);
    try {
      const generated = normalizeItem(await generateContent({
        shell: 'intensive', scene, level, mode, cefr, anthropicKey,
      }));
      const id = computeItemId({ item: generated, mode, scene, level, cefr });
      await openSession({
        generated,
        id,
        sessionMode: mode,
        sessionScene: scene,
        sessionLevel: level,
        sessionCefr: cefr,
      });
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
      setStage('setup');
    }
  }

  async function replayFromHistory(entry) {
    touchHistoryEntry(entry.id);
    setHistory(loadHistory());
    scheduleCloudSync();
    await openSession({
      generated: normalizeItem(entry.item),
      id: entry.id,
      sessionMode: entry.mode,
      sessionScene: entry.scene,
      sessionLevel: entry.level,
      sessionCefr: entry.cefr || DEFAULT_CEFR,
      fromHistory: true,
    });
  }

  async function listenFromHistory(entry) {
    try {
      let cached = getCachedAudio(entry.id);
      if (!cached) {
        try {
          await pullCloudAudio({ gasUrl, itemId: entry.id });
          cached = getCachedAudio(entry.id);
        } catch (err) {
          console.warn('Cloud audio fetch failed:', err);
        }
      }
      let url;
      if (cached) {
        url = base64ToAudioUrl(cached);
      } else {
        setStatusMsg(UI.intensive.fetchingAudio);
        const { url: fetched } = await loadAudioForItem({
          id: entry.id,
          generated: entry.item,
          lvl: entry.level,
          cefrBand: entry.cefr || DEFAULT_CEFR,
        });
        url = fetched;
      }
      touchHistoryEntry(entry.id);
      setHistory(loadHistory());
      scheduleCloudSync();
      audioPlayer.play(url, entry.id, { showProgress: true });
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
    }
  }

  function backToSetup() {
    audioPlayer.stop();
    revokeAudioUrl();
    setAudioUrl(null);
    setItem(null);
    setItemId(null);
    setStage('setup');
    setHistory(loadHistory());
  }

  function handleRemoveHistory(id) {
    setHistory(removeHistoryEntry(id));
    scheduleCloudSync();
    scheduleAudioDelete(id);
  }

  const isConfigured = !!anthropicKey;

  return (
    <>
      {stage === 'setup' && (
        <Setup
          isConfigured={isConfigured}
          settingsOpen={settingsOpen}
          mode={mode} setMode={setMode}
          scene={scene} setScene={setScene}
          level={level} setLevel={setLevel}
          cefr={cefr} setCefr={handleCefrChange}
          onStart={startSession}
          error={error}
          history={history}
          onReplay={replayFromHistory}
          onListen={listenFromHistory}
          onRemoveHistory={handleRemoveHistory}
          syncStatus={cloudSync.syncStatus}
        />
      )}

      {stage === 'loading' && (
        <div className="status">{statusMsg || UI.common.loading}</div>
      )}

      {stage === 'session' && item && (
        <Session
          key={sessionKey}
          item={item}
          itemId={itemId}
          audioUrl={audioUrl}
          audioPlayer={audioPlayer}
          mode={mode}
          level={level}
          scene={scene}
          onFinish={(result) => { setItem({ ...item, _result: result }); setStage('review'); }}
          onBack={backToSetup}
        />
      )}

      {stage === 'review' && item && (
        <ReviewView
          item={item}
          mode={mode}
          audioUrl={audioUrl}
          itemId={itemId}
          audioPlayer={audioPlayer}
          scene={scene}
          level={level}
          cefr={cefr}
          onAgain={backToSetup}
          onNext={() => { backToSetup(); setTimeout(() => startSession(), 100); }}
          onReplaySame={() => {
            if (!itemId) return;
            setSessionKey((k) => k + 1);
            setStage('session');
            setItem({ ...item, _result: undefined });
          }}
          onShadowQueueAdd={scheduleCloudSync}
          itemId={itemId}
        />
      )}
    </>
  );
}

function Setup({
  isConfigured, settingsOpen, mode, setMode, scene, setScene, level, setLevel, cefr, setCefr,
  onStart, error, history, onReplay, onListen, onRemoveHistory, syncStatus,
}) {
  const canStart = isConfigured;
  return (
    <>
      {error && <div className="status error">{error}</div>}

      {!isConfigured && !settingsOpen && (
        <div className="onboarding-banner">
          <p>{UI.settings.registerKeyHint}</p>
        </div>
      )}

      <div className="field">
        <label>{UI.common.cefr}</label>
        <div className="choices">
          {Object.entries(CEFR_LEVELS).map(([key, c]) => (
            <button key={key} className="choice" aria-pressed={cefr === key} onClick={() => setCefr(key)}>
              <span className="choice-label">{c.label}</span>
              <span className="choice-meta">{c.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{UI.common.mode}</label>
        <div className="choices">
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              className="choice"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              disabled={key === 'minimal_pair' && level === 5}
            >
              <span className="choice-label">{m.labelJa || m.label}</span>
              <span className="choice-meta">{m.description}</span>
            </button>
          ))}
        </div>
        {level === 5 && (
          <div className="field-hint">{UI.intensive.lv5Hint}</div>
        )}
      </div>

      <div className="field">
        <label>{UI.common.scene}</label>
        <div className="choices">
          {Object.entries(SCENES).map(([key, s]) => (
            <button key={key} className="choice" aria-pressed={scene === key} onClick={() => setScene(key)}>
              <span className="choice-label">{s.label}</span>
              <span className="choice-meta">{s.en}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{UI.common.level}</label>
        <div className="choices">
          {Object.entries(LEVELS).map(([key, l]) => {
            const recommended = CEFR_LEVELS[cefr]?.recommendedLevels?.includes(Number(key));
            return (
              <button key={key} className="choice" aria-pressed={level === Number(key)} onClick={() => setLevel(Number(key))}>
                <span className="choice-label">{l.label}{recommended ? ' ★' : ''}</span>
                <span className="choice-meta">{`speed ${l.speed}x`}</span>
              </button>
            );
          })}
        </div>
        <div className="field-hint">{UI.common.recommendedHint}</div>
      </div>

      <button className="btn" onClick={onStart} disabled={!canStart}>
        {UI.intensive.start}
      </button>

      {history.length > 0 && (
        <HistoryList
          history={history}
          onReplay={onReplay}
          onListen={onListen}
          onRemove={onRemoveHistory}
          syncStatus={syncStatus}
        />
      )}
    </>
  );
}

function HistoryList({ history, onReplay, onListen, onRemove, syncStatus }) {
  return (
    <section className="history-section">
      <h2 className="history-heading">Past items</h2>
      <p className="field-hint">
        {UI.intensive.historyHint}
        {syncStatus && syncStatus !== 'disabled' ? UI.common.syncFromDrive : ''}
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
                <span>{MODES[entry.mode]?.labelJa || MODES[entry.mode]?.label}</span>
                {hasCachedAudio(entry.id) && <span className="history-cache-badge">{UI.common.audioSaved}</span>}
              </div>
            </div>
            <div className="history-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onListen(entry)} aria-label="Listen">▶</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReplay(entry)}>{UI.intensive.practice}</button>
              <button type="button" className="btn btn-ghost btn-sm history-remove" onClick={() => onRemove(entry.id)}>{UI.common.delete}</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Session({ item, itemId, audioUrl, audioPlayer, mode, level, scene, onFinish, onBack }) {
  const [replays, setReplays] = useState(0);

  function play() {
    const audio = audioPlayer.play(audioUrl, itemId, { showProgress: true });
    if (audio) {
      const onEnded = () => {
        setReplays((r) => r + 1);
        audio.removeEventListener('ended', onEnded);
      };
      audio.addEventListener('ended', onEnded);
    }
  }

  return (
    <>
      <div className="session-meta">
        <span>{SCENES[scene].label}</span>
        <span>{LEVELS[level].label}</span>
        <span>{MODES[mode].labelJa || MODES[mode].label}</span>
      </div>

      <div className="audio-stage">
        <div className="audio-controls">
          <button className="btn btn-icon" onClick={play} aria-label="Play audio">▶</button>
          <span className="replay-counter">{UI.intensive.replayCount}: {replays}</span>
        </div>
        <Waveform playing={audioPlayer.playing && audioPlayer.activeKey === itemId} />
      </div>

      {mode === 'cloze' && <ClozeView item={item} onFinish={onFinish} />}
      {mode === 'dictation' && <DictationInput item={item} onFinish={onFinish} />}
      {mode === 'minimal_pair' && <MinimalPairInput item={item} onFinish={onFinish} />}

      <div style={{ marginTop: 24 }}>
        <button className="btn btn-ghost" onClick={onBack}>{UI.common.back}</button>
      </div>
    </>
  );
}

function DictationInput({ item, onFinish }) {
  const [text, setText] = useState('');
  const expectedText = (item.lines || []).map((l) => l.text).join('\n') || item.sentence || '';
  function submit() {
    const result = scoreFullDictation(text, expectedText);
    onFinish({ kind: 'dictation', user: text, ...result });
  }
  return (
    <>
      <textarea
        className="dictation-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={UI.intensive.typeWhatYouHear}
        spellCheck="false"
      />
      <button className="btn" onClick={submit} disabled={!text.trim()} style={{ marginTop: 16 }}>
        {UI.intensive.checkAnswer}
      </button>
    </>
  );
}

function MinimalPairInput({ item, onFinish }) {
  const mp = item.minimal_pair_target;
  const [choice, setChoice] = useState('');
  const distractorKey = mp?.distractors?.join('\0') ?? '';
  const options = useMemo(() => {
    if (!mp) return [];
    return shuffle([mp.correct, ...(mp.distractors || [])]);
  }, [mp, mp?.correct, distractorKey]);

  if (!mp) {
    return <div className="status error">{UI.intensive.mpMissing}</div>;
  }
  function submit() {
    const correct = scoreMinimalPair(choice, mp.correct);
    onFinish({ kind: 'minimal_pair', user: choice, correct, expected: mp.correct });
  }
  return (
    <>
      <div className="mp-sentence">{renderMpSentence(item.sentence, mp.correct)}</div>
      <div className="mp-options">
        {options.map((opt) => (
          <button key={opt} className="mp-option" aria-pressed={choice === opt} onClick={() => setChoice(opt)}>{opt}</button>
        ))}
      </div>
      <button className="btn" onClick={submit} disabled={!choice} style={{ marginTop: 24 }}>Check answer</button>
    </>
  );
}

function renderMpSentence(sentence, correct) {
  const parts = sentence.split(new RegExp(`\\b(${correct})\\b`, 'i'));
  return parts.map((p, i) =>
    p.toLowerCase() === correct.toLowerCase()
      ? <span key={i} style={{ borderBottom: '1.5px solid var(--ink)', padding: '0 8px' }}>____</span>
      : <span key={i}>{p}</span>,
  );
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
