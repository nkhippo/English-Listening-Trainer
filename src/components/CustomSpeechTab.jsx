import React, { useState, useEffect } from 'react';
import {
  addCustomSpeechEntry,
  loadCustomSpeechList,
  updateCustomSpeechTitle,
  removeCustomSpeechEntry,
  formatCustomSpeechDate,
  linesForTTS,
  CUSTOM_SPEECH_VOICES,
  ttsInstructionsForEntry,
  parseCustomSpeechBody,
} from '../lib/customSpeech.js';
import { resolveItemAudio, base64ToAudioUrl, generateCustomSpeechTtsInstructions } from '../lib/api.js';
import { getCachedAudio, saveCachedAudio, hasCachedAudio } from '../lib/storage.js';
import Waveform from './Waveform.jsx';

const TTS_LEVEL = 3; // 1.0x speed

export default function CustomSpeechTab({ audioPlayer, gasUrl, anthropicKey }) {
  const [stage, setStage] = useState('register');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [entries, setEntries] = useState(() => loadCustomSpeechList());
  const [activeEntry, setActiveEntry] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [replays, setReplays] = useState(0);
  const [registering, setRegistering] = useState(false);

  function revokeAudioUrl() {
    if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
  }

  useEffect(() => () => revokeAudioUrl(), []);

  async function loadAudioForEntry(entry) {
    const cachedBase64 = getCachedAudio(entry.id);
    const tts = await resolveItemAudio({
      itemId: entry.id,
      cachedBase64,
      gasUrl,
      lines: linesForTTS(entry.lines),
      level: TTS_LEVEL,
      instructions: ttsInstructionsForEntry(entry),
      voice: CUSTOM_SPEECH_VOICES.female,
      voiceB: CUSTOM_SPEECH_VOICES.male,
      onCacheSave: saveCachedAudio,
    });
    return base64ToAudioUrl(tts.audioBase64, tts.mimeType || 'audio/mpeg');
  }

  async function openEntry(entry, fromHistory = false) {
    setError('');
    setStage('loading');
    setStatusMsg(fromHistory && hasCachedAudio(entry.id) ? 'Loading cached audio…' : 'Synthesizing audio…');
    setReplays(0);
    try {
      const url = await loadAudioForEntry(entry);
      revokeAudioUrl();
      setActiveEntry(entry);
      setAudioUrl(url);
      setStage('play');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
      setStage('register');
    }
  }

  async function handleRegister() {
    setError('');
    if (!body.trim()) {
      setError('Enter body text');
      return;
    }
    setRegistering(true);
    try {
      const parsedLines = parseCustomSpeechBody(body);
      const ttsInstructions = await generateCustomSpeechTtsInstructions({
        body,
        lines: parsedLines,
        anthropicKey,
      });
      const { entry, list } = addCustomSpeechEntry({ title, body, ttsInstructions });
      setEntries(list);
      setTitle('');
      setBody('');
      await openEntry(entry);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setRegistering(false);
    }
  }

  function handleBack() {
    audioPlayer.stop();
    revokeAudioUrl();
    setAudioUrl(null);
    setActiveEntry(null);
    setStage('register');
    setEntries(loadCustomSpeechList());
  }

  function play() {
    if (!audioUrl || !activeEntry) return;
    const audio = audioPlayer.play(audioUrl, activeEntry.id, { showProgress: true });
    if (audio) {
      const onEnded = () => {
        setReplays((n) => n + 1);
        audio.removeEventListener('ended', onEnded);
      };
      audio.addEventListener('ended', onEnded);
    }
  }

  function handleRename(id, newTitle) {
    setEntries(updateCustomSpeechTitle(id, newTitle));
    if (activeEntry?.id === id) {
      setActiveEntry((prev) => ({ ...prev, title: newTitle.trim() || 'Untitled' }));
    }
  }

  function handleRemove(id) {
    setEntries(removeCustomSpeechEntry(id));
    if (activeEntry?.id === id) handleBack();
  }

  if (stage === 'loading') {
    return <div className="status">{statusMsg || 'Loading…'}</div>;
  }

  if (stage === 'play' && activeEntry) {
    const showSpeakerTags = activeEntry.lines.length > 1;
    return (
      <>
        {error && <div className="status error">{error}</div>}

        <div className="session-meta">
          <span>{activeEntry.title}</span>
          <span>{formatCustomSpeechDate(activeEntry.createdAt)}</span>
        </div>

        <div className="audio-stage">
          <div className="audio-controls">
            <button type="button" className="btn btn-icon" onClick={play} aria-label="Play audio">
              ▶
            </button>
            <span className="replay-counter">replays: {replays}</span>
          </div>
          <Waveform playing={audioPlayer.playing && audioPlayer.activeKey === activeEntry.id} />
        </div>

        <div className="review-section">
          <h3>Text</h3>
          <div className="review-sentence">
            {activeEntry.lines.map((line, i) => (
              <div key={i} className="dialogue-line">
                {showSpeakerTags && <span className="speaker-tag">{line.label}:</span>}
                {line.text}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <button type="button" className="btn btn-ghost" onClick={handleBack}>
            ← Back to register
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {error && <div className="status error">{error}</div>}

      <p className="field-hint" style={{ marginBottom: 24 }}>
        Register text to convert it to speech. Use <strong>M:</strong> for a male voice and <strong>F:</strong> for a female voice. Lines without a prefix are read in a male voice.
      </p>

      <div className="field">
        <label htmlFor="cs-title">Title</label>
        <input
          id="cs-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Cafe dialogue"
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor="cs-body">Body</label>
        <textarea
          id="cs-body"
          className="dictation-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={'M: Good morning. What can I get for you?\nF: A latte, please.\nM: Sure, coming right up.'}
          spellCheck="false"
          rows={8}
        />
      </div>

      <button type="button" className="btn" onClick={handleRegister} disabled={!body.trim() || registering}>
        {registering ? 'Creating…' : 'Create speaker'}
      </button>

      {entries.length > 0 && (
        <CustomSpeechHistory
          entries={entries}
          onOpen={(entry) => openEntry(entry, true)}
          onRename={handleRename}
          onRemove={handleRemove}
        />
      )}
    </>
  );
}

function CustomSpeechHistory({ entries, onOpen, onRename, onRemove }) {
  return (
    <section className="history-section">
      <h2 className="history-heading">Saved items</h2>
      <p className="field-hint">
        Click a title to rename it. After the first playback, audio is saved in your browser and later replays use no API calls.
      </p>
      <ul className="history-list">
        {entries.map((entry) => (
          <CustomSpeechHistoryItem
            key={entry.id}
            entry={entry}
            onOpen={() => onOpen(entry)}
            onRename={(title) => onRename(entry.id, title)}
            onRemove={() => onRemove(entry.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function CustomSpeechHistoryItem({ entry, onOpen, onRename, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.title);

  useEffect(() => {
    setDraft(entry.title);
  }, [entry.title]);

  function commitTitle() {
    setEditing(false);
    if (draft.trim() !== entry.title) onRename(draft);
  }

  return (
    <li className="history-item">
      <div className="history-main">
        {editing ? (
          <input
            type="text"
            className="history-title-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') {
                setDraft(entry.title);
                setEditing(false);
              }
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="history-title-btn"
            onClick={() => setEditing(true)}
            title="Click to rename"
          >
            {entry.title}
          </button>
        )}
        <div className="history-meta">
          <span>{formatCustomSpeechDate(entry.createdAt)}</span>
          {hasCachedAudio(entry.id) && <span className="history-cache-badge">audio saved</span>}
        </div>
      </div>
      <div className="history-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpen}>
          Play
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm history-remove"
          onClick={onRemove}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
