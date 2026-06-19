import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SCENES, LEVELS, MODES } from './lib/prompts.js';
import { generateItem, resolveItemAudio, base64ToAudioUrl, normalizeItem } from './lib/api.js';
import { pullCloudAudio } from './lib/sync.js';
import { DEFAULT_GAS_URL } from './lib/config.js';
import { scoreClozeBlank, scoreFullDictation, scoreMinimalPair, diagnoseFeatures } from './lib/scoring.js';
import {
  computeItemId,
  loadHistory,
  upsertHistoryEntry,
  touchHistoryEntry,
  removeHistoryEntry,
  getCachedAudio,
  saveCachedAudio,
  hasCachedAudio,
} from './lib/storage.js';
import { useAudioPlayer } from './hooks/useAudioPlayer.js';
import { useCloudSync } from './hooks/useCloudSync.js';
import Waveform from './components/Waveform.jsx';
import AudioProgressBar from './components/AudioProgressBar.jsx';
import CustomSpeechTab from './components/CustomSpeechTab.jsx';

const LS_KEYS = {
  appTab: 'elt_app_tab',
  anthropic: 'elt_anthropic_key',
  mode: 'elt_last_mode',
  scene: 'elt_last_scene',
  level: 'elt_last_level',
};

export default function App() {
  const audioPlayer = useAudioPlayer();
  const [appTab, setAppTab] = useState(() => localStorage.getItem(LS_KEYS.appTab) || 'trainer');
  const [stage, setStage] = useState('setup');
  const [settingsOpen, setSettingsOpen] = useState(() => !localStorage.getItem(LS_KEYS.anthropic));
  const [anthropicKey, setAnthropicKey] = useState(localStorage.getItem(LS_KEYS.anthropic) || '');
  const gasUrl = DEFAULT_GAS_URL;
  const [mode, setMode] = useState(localStorage.getItem(LS_KEYS.mode) || 'cloze');
  const [scene, setScene] = useState(localStorage.getItem(LS_KEYS.scene) || 'phone');
  const [level, setLevel] = useState(Number(localStorage.getItem(LS_KEYS.level)) || 2);
  const [item, setItem] = useState(null);
  const [itemId, setItemId] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [history, setHistory] = useState(() => loadHistory());
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [sessionKey, setSessionKey] = useState(0);
  const [speechRefreshKey, setSpeechRefreshKey] = useState(0);

  const handleCloudSynced = useCallback(() => {
    setHistory(loadHistory());
    setSpeechRefreshKey((k) => k + 1);
  }, []);

  const cloudSync = useCloudSync({ gasUrl, onSynced: handleCloudSynced });
  const { schedulePush: scheduleCloudSync, scheduleAudioDelete, cacheAudio } = cloudSync;

  const cacheAudioLocallyAndCloud = useCallback(
    (itemId, base64) => cacheAudio(itemId, base64, saveCachedAudio),
    [cacheAudio],
  );

  useEffect(() => { localStorage.setItem(LS_KEYS.appTab, appTab); }, [appTab]);
  useEffect(() => { if (anthropicKey) localStorage.setItem(LS_KEYS.anthropic, anthropicKey); }, [anthropicKey]);
  useEffect(() => { localStorage.setItem(LS_KEYS.mode, mode); }, [mode]);
  useEffect(() => { localStorage.setItem(LS_KEYS.scene, scene); }, [scene]);
  useEffect(() => { localStorage.setItem(LS_KEYS.level, String(level)); }, [level]);

  useEffect(() => {
    if (level === 5 && mode === 'minimal_pair') setMode('cloze');
  }, [level, mode]);

  useEffect(() => {
    document.body.classList.toggle('audio-progress-visible', audioPlayer.visible);
    return () => document.body.classList.remove('audio-progress-visible');
  }, [audioPlayer.visible]);

  function saveAnthropicKey(key) {
    const trimmed = key.trim();
    setAnthropicKey(trimmed);
    if (trimmed) {
      localStorage.setItem(LS_KEYS.anthropic, trimmed);
      setSettingsOpen(false);
    }
  }

  function clearAnthropicKey() {
    setAnthropicKey('');
    localStorage.removeItem(LS_KEYS.anthropic);
    setSettingsOpen(true);
  }

  const isConfigured = !!anthropicKey;

  function revokeAudioUrl() {
    if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
  }

  async function loadAudioForItem({ id, generated, lvl }) {
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
      onCacheSave: cacheAudioLocallyAndCloud,
    });
    return {
      url: base64ToAudioUrl(tts.audioBase64, tts.mimeType || 'audio/mpeg'),
      fromCache: tts.source === 'local',
    };
  }

  async function openSession({ generated, id, sessionMode, sessionScene, sessionLevel, fromHistory = false }) {
    setError('');
    setStage('loading');
    setStatusMsg(fromHistory && hasCachedAudio(id) ? 'Loading cached audio…' : 'Synthesizing audio…');
    try {
      const normalized = normalizeItem(generated);
      const { url } = await loadAudioForItem({ id, generated: normalized, lvl: sessionLevel });
      revokeAudioUrl();
      setItem(normalized);
      setItemId(id);
      setMode(sessionMode);
      setScene(sessionScene);
      setLevel(sessionLevel);
      setAudioUrl(url);
      setSessionKey((k) => k + 1);
      setStage('session');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      try {
        setHistory(upsertHistoryEntry({
          id, item: normalized, mode: sessionMode, scene: sessionScene, level: sessionLevel,
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
    setStatusMsg('Generating sentence…');
    try {
      const generated = normalizeItem(await generateItem({ scene, level, mode, anthropicKey }));
      const id = computeItemId({ item: generated, mode, scene, level });
      await openSession({
        generated,
        id,
        sessionMode: mode,
        sessionScene: scene,
        sessionLevel: level,
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
        setStatusMsg('Fetching audio…');
        const { url: fetched } = await loadAudioForItem({ id: entry.id, generated: entry.item, lvl: entry.level });
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

  return (
    <div className="shell">
      <header className="header">
        <div>
          <div className="brand">English Listening Trainer</div>
          <div className="brand-sub">{appTab === 'trainer' ? 'Layer 3 focus' : 'Custom speech'}</div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm settings-toggle"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
        >
          {settingsOpen ? 'Close' : 'Settings'}
        </button>
      </header>

      <nav className="app-tabs" aria-label="App mode">
        <button
          type="button"
          className="app-tab"
          aria-pressed={appTab === 'trainer'}
          onClick={() => setAppTab('trainer')}
        >
          Listening
        </button>
        <button
          type="button"
          className="app-tab"
          aria-pressed={appTab === 'speech'}
          onClick={() => setAppTab('speech')}
        >
          Speech
        </button>
      </nav>

      {settingsOpen && (
        <SettingsPanel
          anthropicKey={anthropicKey}
          isConfigured={isConfigured}
          onSave={saveAnthropicKey}
          onClear={clearAnthropicKey}
          cloudSync={cloudSync}
        />
      )}

      {appTab === 'speech' && (
        <CustomSpeechTab
          audioPlayer={audioPlayer}
          gasUrl={gasUrl}
          anthropicKey={anthropicKey}
          scheduleCloudSync={scheduleCloudSync}
          cacheAudioLocallyAndCloud={cacheAudioLocallyAndCloud}
          scheduleAudioDelete={scheduleAudioDelete}
          refreshKey={speechRefreshKey}
          syncStatus={cloudSync.syncStatus}
        />
      )}

      {appTab === 'trainer' && stage === 'setup' && (
        <Setup
          isConfigured={isConfigured}
          mode={mode} setMode={setMode}
          scene={scene} setScene={setScene}
          level={level} setLevel={setLevel}
          onStart={startSession}
          onOpenSettings={() => setSettingsOpen(true)}
          error={error}
          history={history}
          onReplay={replayFromHistory}
          onListen={listenFromHistory}
          onRemoveHistory={handleRemoveHistory}
          syncStatus={cloudSync.syncStatus}
        />
      )}

      {appTab === 'trainer' && stage === 'loading' && (
        <div className="status">{statusMsg || 'Loading…'}</div>
      )}

      {appTab === 'trainer' && stage === 'session' && item && (
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

      {appTab === 'trainer' && stage === 'review' && item && (
        <Review
          item={item}
          mode={mode}
          audioUrl={audioUrl}
          itemId={itemId}
          audioPlayer={audioPlayer}
          onAgain={backToSetup}
          onNext={() => { backToSetup(); setTimeout(() => startSession(), 100); }}
          onReplaySame={() => {
            if (!itemId) return;
            setSessionKey((k) => k + 1);
            setStage('session');
            setItem({ ...item, _result: undefined });
          }}
        />
      )}

      <AudioProgressBar
        visible={audioPlayer.visible}
        progress={audioPlayer.progress}
        endlessRepeat={audioPlayer.endlessRepeat}
        playbackRate={audioPlayer.playbackRate}
        holding={audioPlayer.holding}
        onToggleEndlessRepeat={audioPlayer.toggleEndlessRepeat}
        onTogglePlaybackRate={audioPlayer.togglePlaybackRate}
        onClose={audioPlayer.closeBar}
        onSeekStart={audioPlayer.beginScrub}
        onSeekMove={audioPlayer.moveScrub}
        onSeekEnd={audioPlayer.endScrub}
      />
    </div>
  );
}

function SettingsPanel({ anthropicKey, isConfigured, onSave, onClear, cloudSync }) {
  const [draft, setDraft] = useState(anthropicKey);
  const { syncStatus, syncError } = cloudSync;

  useEffect(() => {
    setDraft(anthropicKey);
  }, [anthropicKey]);

  const syncStatusLabel = {
    disabled: 'Unavailable',
    idle: 'Ready',
    syncing: 'Syncing…',
    synced: 'Synced',
    error: 'Error',
  }[syncStatus] || syncStatus;

  return (
    <section className="settings-panel">
      <h2 className="settings-heading">Settings</h2>

      <div className="settings-block">
        <h3 className="settings-subheading">Cloud sync</h3>
        <p className="field-hint">
          Past items, saved speech, and audio are stored in Google Drive automatically. Open the app on any device to download them into this browser.
        </p>
        <p className="field-hint sync-status-line">
          Status: {syncStatusLabel}
          {syncError ? ` — ${syncError}` : ''}
        </p>
      </div>

      <div className="settings-block">
        <h3 className="settings-subheading">Anthropic API</h3>
        <p className="field-hint">
          Your Anthropic API key is stored only in this browser. Speech synthesis uses the built-in GAS proxy.
        </p>
      <div className="field">
        <label>Anthropic API Key</label>
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-ant-..."
          autoComplete="off"
        />
        <p className="field-hint">
          <a
            href="https://github.com/nkhippo/English-Listening-Trainer/blob/main/docs/setup.md#anthropic-api-キー"
            target="_blank"
            rel="noreferrer"
          >
            How to get a key
          </a>
        </p>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={() => onSave(draft)} disabled={!draft.trim()}>
          Save
        </button>
        {isConfigured && (
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            Clear saved key
          </button>
        )}
      </div>
      </div>
    </section>
  );
}

function Setup({
  isConfigured,
  mode, setMode, scene, setScene, level, setLevel,
  onStart, onOpenSettings, error, history, onReplay, onListen, onRemoveHistory,
  syncStatus,
}) {
  const canStart = isConfigured;
  return (
    <>
      {error && <div className="status error">{error}</div>}

      {!isConfigured && (
        <div className="onboarding-banner">
          <p>Register your Anthropic API key once to generate new sentences.</p>
          <button type="button" className="btn" onClick={onOpenSettings}>
            Register API key
          </button>
        </div>
      )}

      <div className="field">
        <label>Mode</label>
        <div className="choices">
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              className="choice"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              disabled={key === 'minimal_pair' && level === 5}
            >
              <span className="choice-label">{m.label}</span>
              <span className="choice-meta">{m.description}</span>
            </button>
          ))}
        </div>
        {level === 5 && (
          <div className="field-hint">Lv5 (dialogue) supports Cloze and Full Dictation only.</div>
        )}
      </div>

      <div className="field">
        <label>Scene</label>
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
        <label>Level</label>
        <div className="choices">
          {Object.entries(LEVELS).map(([key, l]) => (
            <button key={key} className="choice" aria-pressed={level === Number(key)} onClick={() => setLevel(Number(key))}>
              <span className="choice-label">{l.label}</span>
              <span className="choice-meta">{`speed ${l.speed}x`}</span>
            </button>
          ))}
        </div>
      </div>

      <button className="btn" onClick={onStart} disabled={!canStart}>
        Start session
      </button>
      {!canStart && (
        <p className="field-hint" style={{ marginTop: 12 }}>
          An API key is required to generate new sentences. Past items can be replayed without a key.
        </p>
      )}

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
        Replay sentences you have already practiced. Audio is saved in your browser after the first play.
        {syncStatus && syncStatus !== 'disabled'
          ? ' Items and audio sync from Google Drive when you open the app.'
          : ''}
      </p>
      <ul className="history-list">
        {history.map((entry) => (
          <li key={entry.id} className="history-item">
            <div className="history-main">
              <div className="history-preview">{entry.preview}</div>
              <div className="history-meta">
                <span>{SCENES[entry.scene]?.label}</span>
                <span>{LEVELS[entry.level]?.label?.split(' — ')[0]}</span>
                <span>{MODES[entry.mode]?.label}</span>
                {hasCachedAudio(entry.id) && <span className="history-cache-badge">audio saved</span>}
              </div>
            </div>
            <div className="history-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onListen(entry)} aria-label="Listen">
                ▶
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReplay(entry)}>
                Practice
              </button>
              <button type="button" className="btn btn-ghost btn-sm history-remove" onClick={() => onRemove(entry.id)}>
                Delete
              </button>
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
        const next = replays + 1;
        setReplays(next);
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
        <span>{MODES[mode].label}</span>
      </div>

      <div className="audio-stage">
        <div className="audio-controls">
          <button className="btn btn-icon" onClick={play} aria-label="Play audio">
            ▶
          </button>
          <span className="replay-counter">replays: {replays}</span>
        </div>
        <Waveform playing={audioPlayer.playing && audioPlayer.activeKey === itemId} />
      </div>

      {mode === 'cloze' && <ClozeInput item={item} onFinish={onFinish} />}
      {mode === 'dictation' && <DictationInput item={item} onFinish={onFinish} />}
      {mode === 'minimal_pair' && <MinimalPairInput item={item} onFinish={onFinish} />}

      <div style={{ marginTop: 24 }}>
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
      </div>
    </>
  );
}

function ClozeInput({ item, onFinish }) {
  const lines = item.lines || [{ speaker: 'A', text: item.sentence }];
  const blanks = item.blanks || [];
  const [inputs, setInputs] = useState(() => blanks.map(() => ''));

  function submit() {
    const results = blanks.map((b, i) => ({
      expected: b.answer,
      user: inputs[i],
      hint: b.hint,
      correct: scoreClozeBlank(inputs[i], b.answer),
    }));
    onFinish({ kind: 'cloze', results });
  }

  const blanksRemaining = [...blanks.map((b, i) => ({ ...b, originalIdx: i }))];

  return (
    <>
      <div className="cloze-line" style={{ marginBottom: 24 }}>
        {lines.map((line, lineIdx) => (
          <div className="dialogue-line" key={lineIdx}>
            {lines.length > 1 && <span className="speaker-tag">{line.speaker}:</span>}
            {renderClozeLine(line.text, blanksRemaining, inputs, setInputs, lines.length > 1 ? lineIdx : null)}
          </div>
        ))}
      </div>
      <button className="btn" onClick={submit} disabled={inputs.some((v) => !v.trim())}>
        Check answer
      </button>
    </>
  );
}

function renderClozeLine(text, blanksRemaining, inputs, setInputs, lineKeyPrefix) {
  const tokens = [];
  let remaining = text;

  while (remaining.length > 0) {
    let matched = false;
    const lower = remaining.toLowerCase();
    for (let i = 0; i < blanksRemaining.length; i++) {
      const ans = blanksRemaining[i].answer.toLowerCase();
      const ws = lower.match(/^\s*/)[0];
      const after = lower.slice(ws.length);
      if (after.startsWith(ans)) {
        const endChar = after.charAt(ans.length);
        if (!endChar || /[\s.,!?;:'"]/.test(endChar)) {
          if (ws) tokens.push({ type: 'text', value: ws });
          tokens.push({ type: 'blank', blankIdx: blanksRemaining[i].originalIdx });
          remaining = remaining.slice(ws.length + ans.length);
          blanksRemaining.splice(i, 1);
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      const nextSpace = remaining.search(/\s/);
      if (nextSpace === -1) {
        tokens.push({ type: 'text', value: remaining });
        remaining = '';
      } else {
        tokens.push({ type: 'text', value: remaining.slice(0, nextSpace + 1) });
        remaining = remaining.slice(nextSpace + 1);
      }
    }
  }

  return tokens.map((t, idx) => {
    if (t.type === 'text') return <span key={`${lineKeyPrefix}-t${idx}`}>{t.value}</span>;
    return (
      <input
        key={`${lineKeyPrefix}-b${t.blankIdx}`}
        className="cloze-blank"
        value={inputs[t.blankIdx]}
        onChange={(e) => {
          const next = [...inputs];
          next[t.blankIdx] = e.target.value;
          setInputs(next);
        }}
        placeholder="___"
        autoComplete="off"
        spellCheck="false"
      />
    );
  });
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
        placeholder="Type what you hear..."
        spellCheck="false"
      />
      <button className="btn" onClick={submit} disabled={!text.trim()} style={{ marginTop: 16 }}>
        Check answer
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
    return <div className="status error">minimal_pair_target missing from generated item.</div>;
  }
  function submit() {
    const correct = scoreMinimalPair(choice, mp.correct);
    onFinish({ kind: 'minimal_pair', user: choice, correct, expected: mp.correct });
  }
  return (
    <>
      <div className="mp-sentence">
        {renderMpSentence(item.sentence, mp.correct, mp.distractors)}
      </div>
      <div className="mp-options">
        {options.map((opt) => (
          <button key={opt} className="mp-option" aria-pressed={choice === opt} onClick={() => setChoice(opt)}>
            {opt}
          </button>
        ))}
      </div>
      <button className="btn" onClick={submit} disabled={!choice} style={{ marginTop: 24 }}>
        Check answer
      </button>
    </>
  );
}

function renderMpSentence(sentence, correct) {
  const parts = sentence.split(new RegExp(`\\b(${correct})\\b`, 'i'));
  return parts.map((p, i) =>
    p.toLowerCase() === correct.toLowerCase()
      ? <span key={i} style={{ borderBottom: '1.5px solid var(--ink)', padding: '0 8px' }}>____</span>
      : <span key={i}>{p}</span>
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

function Review({ item, mode, audioUrl, itemId, audioPlayer, onAgain, onNext, onReplaySame }) {
  const result = item._result;
  const lines = item.lines || [{ speaker: 'A', text: item.sentence || '' }];
  const features = mode === 'cloze'
    ? diagnoseFeatures(item, result.results)
    : (item.target_features || []).map((f) => ({ feature: f, captured: null }));

  let scoreDisplay = '—';
  let scorePerfect = false;
  if (result?.kind === 'cloze') {
    const correct = result.results.filter((r) => r.correct).length;
    scoreDisplay = result.results.length ? `${correct}/${result.results.length}` : '—';
    scorePerfect = result.results.length > 0 && correct === result.results.length;
  } else if (result?.kind === 'dictation') {
    scoreDisplay = `${Math.round(result.accuracy * 100)}%`;
    scorePerfect = result.accuracy >= 1;
  } else if (result?.kind === 'minimal_pair') {
    scoreDisplay = result.correct ? '1/1' : '0/1';
    scorePerfect = result.correct;
  }

  function playReview() {
    if (audioUrl && itemId) audioPlayer.play(audioUrl, itemId, { showProgress: true });
  }

  return (
    <>
      <div className="review-section">
        <div className="score-label">Score</div>
        <div className={`score${scorePerfect ? ' is-perfect' : ''}`}>{scoreDisplay}</div>
      </div>

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
            ▶ Listen again
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
                  {r.correct ? '○' : `× ${r.user || '(blank)'}`}
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
            edits: {result.edits} / {result.totalWords} words
          </div>
        </div>
      )}

      {result.kind === 'minimal_pair' && (
        <div className="review-section">
          <h3>Your answer</h3>
          <ul className="feature-list">
            <li className="feature-item">
              <span>You chose</span>
              <span className={`feature-status ${result.correct ? 'ok' : 'miss'}`}>{result.user}</span>
            </li>
            <li className="feature-item">
              <span>Correct word</span>
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

      <div className="row" style={{ marginTop: 32 }}>
        <button className="btn" onClick={onNext}>Next item</button>
        <button className="btn btn-ghost" onClick={onReplaySame}>Same item again</button>
        <button className="btn btn-ghost" onClick={onAgain}>Back to setup</button>
      </div>
    </>
  );
}
