import React, { useState, useEffect, useRef } from 'react';
import { SCENES, LEVELS, MODES } from './lib/prompts.js';
import { generateItem, fetchTTS, base64ToAudioUrl } from './lib/api.js';
import { scoreClozeBlank, scoreFullDictation, diagnoseFeatures, normalize } from './lib/scoring.js';
import Waveform from './components/Waveform.jsx';

const LS_KEYS = {
  anthropic: 'elt_anthropic_key',
  gas: 'elt_gas_url',
  mode: 'elt_last_mode',
  scene: 'elt_last_scene',
  level: 'elt_last_level',
};

export default function App() {
  const [stage, setStage] = useState('setup'); // setup | loading | session | review
  const [anthropicKey, setAnthropicKey] = useState(localStorage.getItem(LS_KEYS.anthropic) || '');
  const [gasUrl, setGasUrl] = useState(localStorage.getItem(LS_KEYS.gas) || '');
  const [mode, setMode] = useState(localStorage.getItem(LS_KEYS.mode) || 'cloze');
  const [scene, setScene] = useState(localStorage.getItem(LS_KEYS.scene) || 'phone');
  const [level, setLevel] = useState(Number(localStorage.getItem(LS_KEYS.level)) || 2);
  const [item, setItem] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Persist selections
  useEffect(() => { if (anthropicKey) localStorage.setItem(LS_KEYS.anthropic, anthropicKey); }, [anthropicKey]);
  useEffect(() => { if (gasUrl) localStorage.setItem(LS_KEYS.gas, gasUrl); }, [gasUrl]);
  useEffect(() => { localStorage.setItem(LS_KEYS.mode, mode); }, [mode]);
  useEffect(() => { localStorage.setItem(LS_KEYS.scene, scene); }, [scene]);
  useEffect(() => { localStorage.setItem(LS_KEYS.level, String(level)); }, [level]);

  // Lv5 forces dialogue → not compatible with minimal_pair (per-word audio probe)
  useEffect(() => {
    if (level === 5 && mode === 'minimal_pair') setMode('cloze');
  }, [level, mode]);

  async function startSession() {
    setError('');
    setStage('loading');
    setStatusMsg('Generating sentence…');
    try {
      const generated = await generateItem({ scene, level, mode, anthropicKey });
      setStatusMsg('Synthesizing audio…');
      const tts = await fetchTTS({
        gasUrl,
        lines: generated.lines,
        level,
        voice: 'nova',
        voiceB: 'onyx',
        instructions: generated.tts_instructions || '',
      });
      const url = base64ToAudioUrl(tts.audioBase64, tts.mimeType || 'audio/mpeg');
      setItem(generated);
      setAudioUrl(url);
      setStage('session');
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
      setStage('setup');
    }
  }

  function backToSetup() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setItem(null);
    setStage('setup');
  }

  return (
    <div className="shell">
      <header className="header">
        <div className="brand">English Listening Trainer</div>
        <div className="brand-sub">Layer 3 focus</div>
      </header>

      {stage === 'setup' && (
        <Setup
          anthropicKey={anthropicKey} setAnthropicKey={setAnthropicKey}
          gasUrl={gasUrl} setGasUrl={setGasUrl}
          mode={mode} setMode={setMode}
          scene={scene} setScene={setScene}
          level={level} setLevel={setLevel}
          onStart={startSession}
          error={error}
        />
      )}

      {stage === 'loading' && (
        <div className="status">{statusMsg || 'Loading…'}</div>
      )}

      {stage === 'session' && item && (
        <Session
          item={item}
          audioUrl={audioUrl}
          mode={mode}
          level={level}
          scene={scene}
          onFinish={(result) => { setItem({ ...item, _result: result }); setStage('review'); }}
          onBack={backToSetup}
        />
      )}

      {stage === 'review' && item && (
        <Review
          item={item}
          mode={mode}
          onAgain={backToSetup}
          onNext={() => { backToSetup(); setTimeout(() => startSession(), 100); }}
        />
      )}
    </div>
  );
}

// ===== Setup screen =====
function Setup({ anthropicKey, setAnthropicKey, gasUrl, setGasUrl, mode, setMode, scene, setScene, level, setLevel, onStart, error }) {
  const canStart = anthropicKey && gasUrl;
  return (
    <>
      {error && <div className="status error">{error}</div>}

      <div className="field">
        <label>Anthropic API Key</label>
        <input
          type="password"
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
          placeholder="sk-ant-..."
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label>GAS Endpoint URL（TTSプロキシ）</label>
        <input
          type="text"
          value={gasUrl}
          onChange={(e) => setGasUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/.../exec"
          autoComplete="off"
        />
      </div>

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
          <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 8 }}>
            ※ Lv5（対話）は Cloze と Full Dictation のみ対応
          </div>
        )}
      </div>

      <div className="field">
        <label>Scene</label>
        <div className="choices">
          {Object.entries(SCENES).map(([key, s]) => (
            <button
              key={key}
              className="choice"
              aria-pressed={scene === key}
              onClick={() => setScene(key)}
            >
              <span className="choice-label">{s.label}</span>
              <span className="choice-meta">{s.en}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Level（難易度）</label>
        <div className="choices">
          {Object.entries(LEVELS).map(([key, l]) => (
            <button
              key={key}
              className="choice"
              aria-pressed={level === Number(key)}
              onClick={() => setLevel(Number(key))}
            >
              <span className="choice-label">{l.label}</span>
              <span className="choice-meta">{`speed ${l.speed}x`}</span>
            </button>
          ))}
        </div>
      </div>

      <button className="btn" onClick={onStart} disabled={!canStart}>
        Start session
      </button>
    </>
  );
}

// ===== Session screen =====
function Session({ item, audioUrl, mode, level, scene, onFinish, onBack }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [replays, setReplays] = useState(0);
  const [slowAllowed, setSlowAllowed] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  function play() {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.playbackRate = playbackRate;
    audioRef.current.play();
  }

  function onAudioEnd() {
    setPlaying(false);
    const next = replays + 1;
    setReplays(next);
    if (next >= 2 && !slowAllowed) setSlowAllowed(true);
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
          {slowAllowed && (
            <button
              className="btn btn-ghost"
              onClick={() => setPlaybackRate(playbackRate === 1.0 ? 0.75 : 1.0)}
            >
              {playbackRate === 1.0 ? '0.75x' : '1.0x'}
            </button>
          )}
        </div>
        <Waveform playing={playing} />
        <audio
          ref={audioRef}
          src={audioUrl}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={onAudioEnd}
          style={{ display: 'none' }}
        />
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

// ===== Cloze input =====
function ClozeInput({ item, onFinish }) {
  const lines = item.lines || [{ speaker: 'A', text: item.sentence }];
  const blanks = item.blanks || [];

  // Build a render plan: for each line, mark which spans are blanks.
  // Strategy: find the first occurrence of each blank's "answer" in the line text and substitute.
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

  // Track which blanks have been "consumed" across line rendering
  const blanksRemaining = [...blanks.map((b, i) => ({ ...b, originalIdx: i }))];

  return (
    <>
      <div className="cloze-line" style={{ marginBottom: 24 }}>
        {lines.map((line, lineIdx) => (
          <div className="dialogue-line" key={lineIdx}>
            {item.lines.length > 1 && <span className="speaker-tag">{line.speaker}:</span>}
            {renderClozeLine(line.text, blanksRemaining, inputs, setInputs, item.lines.length > 1 ? lineIdx : null)}
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
  // Tokenize by words & punctuation, then for each token check if it matches the next remaining blank.
  // Simple approach: try to substitute the longest matching blank phrase first.
  const tokens = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Try to match a blank answer at the start of remaining (case-insensitive, allowing leading space)
    let matched = false;
    const lower = remaining.toLowerCase();
    // Find which blank matches at current position
    for (let i = 0; i < blanksRemaining.length; i++) {
      const ans = blanksRemaining[i].answer.toLowerCase();
      // Check if remaining starts with the answer (allowing word boundary)
      const ws = lower.match(/^\s*/)[0];
      const after = lower.slice(ws.length);
      if (after.startsWith(ans)) {
        // Confirm word boundary at end
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
      // consume one character (or up to next blank candidate boundary)
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

// ===== Full dictation input =====
function DictationInput({ item, onFinish }) {
  const [text, setText] = useState('');
  function submit() {
    const result = scoreFullDictation(text, item.sentence);
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

// ===== Minimal pair input =====
function MinimalPairInput({ item, onFinish }) {
  const mp = item.minimal_pair_target;
  const [choice, setChoice] = useState('');
  if (!mp) {
    return <div className="status error">minimal_pair_target missing from generated item.</div>;
  }
  const options = shuffle([mp.correct, ...(mp.distractors || [])]);
  function submit() {
    onFinish({ kind: 'minimal_pair', user: choice, correct: choice === mp.correct, expected: mp.correct });
  }
  return (
    <>
      <div className="mp-sentence">
        {renderMpSentence(item.sentence, mp.correct, mp.distractors)}
      </div>
      <div className="mp-options">
        {options.map((opt) => (
          <button
            key={opt}
            className="mp-option"
            aria-pressed={choice === opt}
            onClick={() => setChoice(opt)}
          >
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

function renderMpSentence(sentence, correct, distractors) {
  // Replace the correct word with [_____] visually
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

// ===== Review screen =====
function Review({ item, mode, onAgain, onNext }) {
  const result = item._result;
  const features = mode === 'cloze' ? diagnoseFeatures(item, result.results) : (item.target_features || []).map(f => ({ feature: f, captured: null }));

  let scoreDisplay = '—';
  if (result.kind === 'cloze') {
    const correct = result.results.filter(r => r.correct).length;
    scoreDisplay = `${correct}/${result.results.length}`;
  } else if (result.kind === 'dictation') {
    scoreDisplay = `${Math.round(result.accuracy * 100)}%`;
  } else if (result.kind === 'minimal_pair') {
    scoreDisplay = result.correct ? '○' : '×';
  }

  return (
    <>
      <div className="review-section">
        <div className="score-label">Score</div>
        <div className="score">{scoreDisplay}</div>
      </div>

      <div className="review-section">
        <h3>Sentence</h3>
        <div className="review-sentence">
          {item.lines.map((l, i) => (
            <div key={i} className="dialogue-line">
              {item.lines.length > 1 && <span className="speaker-tag">{l.speaker}:</span>}
              {l.text}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-mute)' }}>
          {item.translation_ja}
        </div>
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
        <button className="btn btn-ghost" onClick={onAgain}>Back to setup</button>
      </div>
    </>
  );
}
