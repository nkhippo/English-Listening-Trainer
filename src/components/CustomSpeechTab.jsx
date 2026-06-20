import React, { useState, useEffect, useRef } from 'react';
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
  exportCustomSpeechData,
  importCustomSpeechData,
} from '../lib/customSpeech.js';
import { resolveItemAudio, base64ToAudioUrl, generateCustomSpeechTtsInstructions } from '../lib/api.js';
import { pullCloudAudio } from '../lib/sync.js';
import { getCachedAudio, hasCachedAudio } from '../lib/storage.js';
import Waveform from './Waveform.jsx';

const TTS_LEVEL = 3; // 1.0x speed

export default function CustomSpeechTab({
  audioPlayer, gasUrl, anthropicKey, scheduleCloudSync, cacheAudioLocallyAndCloud, scheduleAudioDelete, refreshKey, syncStatus, homeNonce = 0,
}) {
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
  const savedItemsRef = useRef(null);
  const importInputRef = useRef(null);

  function revokeAudioUrl() {
    if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
  }

  function refreshEntries() {
    setEntries(loadCustomSpeechList());
  }

  function scrollToSavedItems() {
    requestAnimationFrame(() => {
      savedItemsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  useEffect(() => () => revokeAudioUrl(), []);

  useEffect(() => {
    refreshEntries();
  }, [refreshKey]);

  function notifyCloudChange() {
    scheduleCloudSync?.();
  }

  async function loadAudioForEntry(entry) {
    if (!hasCachedAudio(entry.id)) {
      try {
        await pullCloudAudio({ gasUrl, itemId: entry.id });
      } catch (err) {
        console.warn('Cloud audio fetch failed:', err);
      }
    }
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
      onCacheSave: cacheAudioLocallyAndCloud,
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
      notifyCloudChange();
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
    refreshEntries();
    scrollToSavedItems();
  }

  useEffect(() => {
    if (!homeNonce) return;
    if (stage === 'register' && !activeEntry) return;
    handleBack();
  }, [homeNonce]);

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
    notifyCloudChange();
    if (activeEntry?.id === id) {
      setActiveEntry((prev) => ({ ...prev, title: newTitle.trim() || 'Untitled' }));
    }
  }

  function handleRemove(id) {
    setEntries(removeCustomSpeechEntry(id));
    notifyCloudChange();
    scheduleAudioDelete?.(id);
    if (activeEntry?.id === id) handleBack();
  }

  function handleExport() {
    setError('');
    const blob = new Blob([exportCustomSpeechData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `elt-speech-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError('');
    try {
      const text = await file.text();
      const { list, added, skipped } = importCustomSpeechData(text);
      setEntries(list);
      notifyCloudChange();
      setStatusMsg(
        added > 0
          ? `Imported ${added} item${added === 1 ? '' : 's'}${skipped > added ? ` (${skipped - added} already on this device)` : ''}.`
          : 'All items in the file are already on this device.',
      );
      scrollToSavedItems();
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  const historyProps = {
    entries,
    activeId: activeEntry?.id,
    sectionRef: savedItemsRef,
    importInputRef,
    onOpen: (entry) => openEntry(entry, true),
    onRename: handleRename,
    onRemove: handleRemove,
    onExport: handleExport,
    onImportClick: () => importInputRef.current?.click(),
    onImportFile: handleImportFile,
    syncStatus,
  };

  if (stage === 'loading') {
    return <div className="status">{statusMsg || 'Loading…'}</div>;
  }

  if (stage === 'play' && activeEntry) {
    const showSpeakerTags = activeEntry.lines.length > 1;
    return (
      <>
        {error && <div className="status error">{error}</div>}
        {statusMsg && <div className="status">{statusMsg}</div>}

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

        <CustomSpeechHistory {...historyProps} />
      </>
    );
  }

  return (
    <>
      {error && <div className="status error">{error}</div>}
      {statusMsg && <div className="status">{statusMsg}</div>}

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

      <CustomSpeechHistory {...historyProps} />
    </>
  );
}

function CustomSpeechHistory({ entries, activeId, sectionRef, importInputRef, onOpen, onRename, onRemove, onExport, onImportClick, onImportFile, syncStatus }) {
  const cloudEnabled = syncStatus && syncStatus !== 'disabled';
  return (
    <section className="history-section" ref={sectionRef}>
      <div className="history-section-header">
        <h2 className="history-heading">Saved items</h2>
        <div className="history-sync-actions">
          {cloudEnabled && (
            <span className="sync-badge">{syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'synced' ? 'Synced' : 'Cloud'}</span>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onExport} disabled={entries.length === 0}>
            Backup
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onImportClick}>
            Restore
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={onImportFile}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="field-hint">
          No saved items yet. Create one above.
          {cloudEnabled
            ? ' Cloud sync is active — items and audio download from Google Drive automatically.'
            : ''}
        </p>
      ) : (
        <>
          <p className="field-hint">
            Tap a title to rename it. After the first playback, audio is saved in your browser.
            {cloudEnabled ? ' Items and audio sync from Google Drive.' : ''}
          </p>
          <ul className="history-list">
            {entries.map((entry) => (
              <CustomSpeechHistoryItem
                key={entry.id}
                entry={entry}
                active={entry.id === activeId}
                onOpen={() => onOpen(entry)}
                onRename={(title) => onRename(entry.id, title)}
                onRemove={() => onRemove(entry.id)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function CustomSpeechHistoryItem({ entry, active, onOpen, onRename, onRemove }) {
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
    <li className={`history-item${active ? ' history-item-active' : ''}`}>
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
            title="Tap to rename"
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
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpen} disabled={active}>
          {active ? 'Playing' : 'Play'}
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
