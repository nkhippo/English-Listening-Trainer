import React, { useState, useEffect } from 'react';
import {
  addCustomSpeechEntry,
  loadCustomSpeechList,
  updateCustomSpeechTitle,
  removeCustomSpeechEntry,
  formatCustomSpeechDate,
  linesForTTS,
} from '../lib/customSpeech.js';
import { resolveItemAudio, base64ToAudioUrl } from '../lib/api.js';
import { getCachedAudio, saveCachedAudio, hasCachedAudio } from '../lib/storage.js';
import Waveform from './Waveform.jsx';

const TTS_LEVEL = 3; // 1.0x speed

export default function CustomSpeechTab({ audioPlayer, gasUrl }) {
  const [stage, setStage] = useState('register');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [entries, setEntries] = useState(() => loadCustomSpeechList());
  const [activeEntry, setActiveEntry] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [replays, setReplays] = useState(0);

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
      instructions: '',
      onCacheSave: saveCachedAudio,
    });
    return base64ToAudioUrl(tts.audioBase64, tts.mimeType || 'audio/mpeg');
  }

  async function openEntry(entry, fromHistory = false) {
    setError('');
    setStage('loading');
    setStatusMsg(fromHistory && hasCachedAudio(entry.id) ? 'キャッシュから読み込み中…' : '音声を生成中…');
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
      setError('本文を入力してください');
      return;
    }
    try {
      const { entry, list } = addCustomSpeechEntry({ title, body });
      setEntries(list);
      setTitle('');
      setBody('');
      await openEntry(entry);
    } catch (e) {
      setError(String(e.message || e));
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
            ← 登録画面に戻る
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {error && <div className="status error">{error}</div>}

      <p className="field-hint" style={{ marginBottom: 24 }}>
        文章を登録して音声化します。話者は「M:」（男性）と「F:」（女性）で指定できます。指定がない行は男性の声で読み上げます。
      </p>

      <div className="field">
        <label htmlFor="cs-title">タイトル</label>
        <input
          id="cs-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: Cafe dialogue"
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor="cs-body">本文</label>
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

      <button type="button" className="btn" onClick={handleRegister} disabled={!body.trim()}>
        スピーカー作成
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
      <h2 className="history-heading">登録済み</h2>
      <p className="field-hint">
        タイトルをクリックして名称を変更できます。初回再生後はブラウザに音声が保存され、以降は API を呼びません。
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
            title="クリックして名称を変更"
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
          再生
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm history-remove"
          onClick={onRemove}
          aria-label="Remove"
        >
          ×
        </button>
      </div>
    </li>
  );
}
