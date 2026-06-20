import React, { useState, useRef, useEffect } from 'react';
import {
  compareWithScript,
  compareWithScriptFromBlob,
  createSpeechRecognizer,
  isStageComplete,
  STAGE_THRESHOLD,
} from '../../core/scoring/stt.js';
import { saveShadowRecording, loadShadowRecordings, recordingToObjectUrl } from '../../core/shared/shadowRecordings.js';

export default function RecordCompare({
  expectedText,
  entryId,
  modelAudioUrl,
  onResult,
  stage,
  onStageComplete,
}) {
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [playingModel, setPlayingModel] = useState(true);
  const [sttResult, setSttResult] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [sttBusy, setSttBusy] = useState(false);
  const [history, setHistory] = useState(() => (entryId ? loadShadowRecordings(entryId) : []));
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recognizerRef = useRef(null);
  const modelAudioRef = useRef(null);
  const userAudioRef = useRef(null);

  useEffect(() => () => {
    if (recordedUrl?.startsWith('blob:')) URL.revokeObjectURL(recordedUrl);
    try { recognizerRef.current?.recognition?.stop(); } catch { /* noop */ }
  }, [recordedUrl]);

  function refreshHistory() {
    if (entryId) setHistory(loadShadowRecordings(entryId));
  }

  async function startRecording() {
    if (recordedUrl?.startsWith('blob:')) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedBlob(null);
    setSttResult(null);
    setTranscript('');

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];

    const recognizer = createSpeechRecognizer({
      onResult: ({ text }) => setTranscript(text),
      onError: (err) => console.warn('Live STT:', err),
    });
    recognizerRef.current = recognizer;
    if (recognizer) {
      try { recognizer.recognition.start(); } catch { /* noop */ }
    }

    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      try { recognizerRef.current?.recognition?.stop(); } catch { /* noop */ }
      const liveText = recognizerRef.current?.getTranscript?.() || transcript;
      if (liveText) setTranscript(liveText);

      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setRecordedBlob(blob);
      setRecordedUrl(URL.createObjectURL(blob));
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function runSttCompare() {
    setSttBusy(true);
    try {
      let result;
      if (recordedBlob) {
        try {
          result = await compareWithScriptFromBlob(recordedBlob, expectedText);
        } catch {
          result = compareWithScript(transcript, expectedText);
        }
      } else {
        result = compareWithScript(transcript, expectedText);
      }

      setSttResult(result);
      setTranscript(result.recognized_text);
      onResult?.(result);

      if (recordedBlob && entryId) {
        await saveShadowRecording({
          entryId,
          stage,
          audioBlob: recordedBlob,
          matchScore: result.match_score,
          transcript: result.recognized_text,
        });
        refreshHistory();
      }

      if (isStageComplete(result.match_score)) {
        onStageComplete?.(stage);
      }
    } finally {
      setSttBusy(false);
    }
  }

  function playToggle() {
    if (playingModel && modelAudioUrl) {
      modelAudioRef.current?.play();
    } else if (recordedUrl) {
      userAudioRef.current?.play();
    }
  }

  return (
    <div className="record-compare">
      <h3>Record & compare</h3>
      <div className="row">
        {!recording ? (
          <button type="button" className="btn" onClick={startRecording}>Start recording</button>
        ) : (
          <button type="button" className="btn" onClick={stopRecording}>Stop</button>
        )}
      </div>

      {(modelAudioUrl || recordedUrl) && (
        <div className="row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-pressed={playingModel}
            onClick={() => setPlayingModel(true)}
          >
            Model
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-pressed={!playingModel}
            onClick={() => setPlayingModel(false)}
            disabled={!recordedUrl}
          >
            You
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={playToggle}>▶ Play</button>
        </div>
      )}

      {modelAudioUrl && (
        <audio ref={modelAudioRef} src={modelAudioUrl} style={{ display: 'none' }} />
      )}
      {recordedUrl && (
        <>
          <audio ref={userAudioRef} src={recordedUrl} style={{ display: 'none' }} />
          <audio controls src={recordedUrl} style={{ width: '100%', marginTop: 8 }} />
        </>
      )}

      <div className="field" style={{ marginTop: 16 }}>
        <label>STT transcript</label>
        <textarea
          className="dictation-input"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Speak while recording, or edit transcript…"
          spellCheck="false"
        />
        <button
          type="button"
          className="btn"
          style={{ marginTop: 8 }}
          onClick={runSttCompare}
          disabled={sttBusy || (!transcript.trim() && !recordedBlob)}
        >
          {sttBusy ? 'Analyzing…' : 'Compare with script'}
        </button>
      </div>

      {sttResult && (
        <div className="review-section">
          <p>Match score: <strong>{Math.round(sttResult.match_score * 100)}%</strong> (need {Math.round(STAGE_THRESHOLD * 100)}%)</p>
          <p className="field-hint">Recognized: {sttResult.recognized_text}</p>
          <ul className="feature-list">
            {sttResult.per_word.map((w, i) => (
              <li key={i} className="feature-item">
                <span>{w.expected}</span>
                <span className={`feature-status ${w.matched ? 'ok' : 'miss'}`}>
                  {w.matched ? '○' : `× ${w.recognized || '—'}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <div className="review-section">
          <h3>Recording history</h3>
          <ul className="feature-list">
            {history.slice(0, 5).map((h) => (
              <li key={h.id} className="feature-item">
                <span>Stage {h.stage} · {Math.round((h.matchScore || 0) * 100)}%</span>
                <audio controls src={recordingToObjectUrl(h)} style={{ maxWidth: 180, height: 28 }} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
