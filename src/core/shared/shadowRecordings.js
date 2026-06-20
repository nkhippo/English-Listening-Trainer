import {
  getCachedAudio,
  saveCachedAudio,
  hasCachedAudio,
} from '../../lib/storage.js';

const RECORDINGS_KEY = 'elt_shadow_recordings';
const MAX_RECORDINGS = 30;

function normalizeRecording(entry) {
  const createdAt = entry.createdAt || new Date().toISOString();
  return {
    ...entry,
    createdAt,
    updatedAt: entry.updatedAt || createdAt,
    deletedAt: entry.deletedAt || null,
  };
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(RECORDINGS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeRecording);
  } catch {
    return [];
  }
}

function stripInlineAudio(entry) {
  const { audioBase64, ...rest } = entry;
  return rest;
}

function migrateInlineAudio(list) {
  let changed = false;
  const next = list.map((entry) => {
    if (entry.audioBase64 && !hasCachedAudio(entry.id)) {
      saveCachedAudio(entry.id, entry.audioBase64);
      changed = true;
    }
    return stripInlineAudio(entry);
  });
  if (changed) saveRaw(next);
  return next;
}

function saveRaw(list) {
  const normalized = (list || []).map(normalizeRecording).map(stripInlineAudio);
  const activeCount = normalized.filter((e) => !e.deletedAt).length;
  let trimmed = normalized;
  if (activeCount > MAX_RECORDINGS) {
    const active = normalized.filter((e) => !e.deletedAt).slice(0, MAX_RECORDINGS);
    const tombstones = normalized.filter((e) => e.deletedAt);
    trimmed = [...active, ...tombstones];
  }
  localStorage.setItem(RECORDINGS_KEY, JSON.stringify(trimmed));
}

export function loadShadowRecordingsRaw() {
  return migrateInlineAudio(loadRaw());
}

export function replaceShadowRecordingsRaw(list) {
  saveRaw(list || []);
}

export function loadShadowRecordings(entryId) {
  return loadShadowRecordingsRaw()
    .filter((r) => !r.deletedAt && (!entryId || r.entryId === entryId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function saveShadowRecording({ entryId, stage, audioBlob, matchScore, transcript }) {
  const base64 = await blobToBase64(audioBlob);
  const now = new Date().toISOString();
  const id = `rec${Date.now().toString(36)}`;
  saveCachedAudio(id, base64);
  const entry = {
    id,
    entryId,
    stage,
    matchScore: matchScore ?? null,
    transcript: transcript || '',
    mimeType: audioBlob.type || 'audio/webm',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const list = loadRaw().map(stripInlineAudio);
  list.unshift(entry);
  saveRaw(list);
  return entry;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      resolve(String(dataUrl).split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function recordingToObjectUrl(entry) {
  const base64 = getCachedAudio(entry?.id) || entry?.audioBase64;
  if (!base64) return null;
  return `data:${entry.mimeType || 'audio/webm'};base64,${base64}`;
}
