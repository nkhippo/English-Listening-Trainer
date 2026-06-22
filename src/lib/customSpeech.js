// Custom speech: user-authored text → TTS with M:/F: speaker tags.

import { removeCachedAudio } from './storage.js';
import { buildCustomSpeechTtsInstructions } from './api.js';

const STORAGE_KEY = 'elt_custom_speech';
const MAX_ENTRIES = 50;
export const CUSTOM_SPEECH_EXPORT_TYPE = 'elt_custom_speech';
export const CUSTOM_SPEECH_EXPORT_VERSION = 1;

const SPEAKER_PREFIX = /^(M|F)[：:]\s*/i;

/** OpenAI voices for custom speech (F → voiceA, M → voiceB in GAS). */
export const CUSTOM_SPEECH_VOICES = {
  female: 'shimmer',
  male: 'onyx',
};

/** Map display label to GAS line speaker (A = female, B = male). */
function ttsSpeakerForLabel(label) {
  return label === 'F' ? 'A' : 'B';
}

/**
 * Parse body text into TTS lines.
 * M: → male (onyx), F: → female (shimmer). No prefix → male.
 */
export function parseCustomSpeechBody(body) {
  const rawLines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return [];

  return rawLines.map((line) => {
    const match = line.match(SPEAKER_PREFIX);
    if (match) {
      const label = match[1].toUpperCase();
      return {
        label,
        speaker: ttsSpeakerForLabel(label),
        text: line.slice(match[0].length).trim(),
      };
    }
    return { label: 'M', speaker: 'B', text: line };
  });
}

export function linesForTTS(parsedLines) {
  return parsedLines.map(({ speaker, text }) => ({ speaker, text }));
}

export function computeCustomSpeechId() {
  return `cs${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function loadCustomSpeechList() {
  return loadCustomSpeechListRaw().filter((e) => !e.deletedAt);
}

export function loadCustomSpeechListRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeCustomSpeechEntry);
  } catch {
    return [];
  }
}

function normalizeCustomSpeechEntry(entry) {
  const createdAt = entry.createdAt || new Date().toISOString();
  return {
    ...entry,
    translation_ja: typeof entry.translation_ja === 'string' ? entry.translation_ja : '',
    createdAt,
    updatedAt: entry.updatedAt || createdAt,
    deletedAt: entry.deletedAt || null,
  };
}

export function replaceCustomSpeechRaw(list) {
  saveCustomSpeechList((list || []).map(normalizeCustomSpeechEntry));
}

function saveCustomSpeechList(list) {
  const active = list.filter((e) => !e.deletedAt);
  const tombstones = list.filter((e) => e.deletedAt);
  const payload = JSON.stringify([...active.slice(0, MAX_ENTRIES), ...tombstones]);
  try {
    localStorage.setItem(STORAGE_KEY, payload);
    return true;
  } catch (err) {
    console.warn('Custom speech save failed:', err);
    // Retry with fewer entries when storage quota is exceeded (common on iOS Safari).
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([
        ...active.slice(0, Math.min(20, active.length)),
        ...tombstones,
      ]));
      return true;
    } catch {
      return false;
    }
  }
}

export function addCustomSpeechEntry({ title, body, translation_ja = '', ttsInstructions }) {
  const parsedLines = parseCustomSpeechBody(body);
  if (parsedLines.length === 0) throw new Error('Enter body text');

  const now = new Date().toISOString();
  const entry = {
    id: computeCustomSpeechId(),
    title: title.trim() || 'Untitled',
    body: body.trim(),
    translation_ja: typeof translation_ja === 'string' ? translation_ja : '',
    lines: parsedLines,
    tts_instructions: ttsInstructions,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const list = [entry, ...loadCustomSpeechListRaw()];
  if (!saveCustomSpeechList(list)) {
    throw new Error('Could not save item — browser storage may be full. Delete old items or clear cached audio.');
  }
  return { entry, list: loadCustomSpeechList() };
}

export function updateCustomSpeechTitle(id, title) {
  const now = new Date().toISOString();
  const list = loadCustomSpeechListRaw();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return loadCustomSpeechList();
  list[idx] = {
    ...list[idx],
    title: title.trim() || 'Untitled',
    updatedAt: now,
    deletedAt: null,
  };
  saveCustomSpeechList(list);
  return loadCustomSpeechList();
}

export function removeCustomSpeechEntry(id) {
  const now = new Date().toISOString();
  const list = loadCustomSpeechListRaw();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return loadCustomSpeechList();
  list[idx] = { ...list[idx], deletedAt: now, updatedAt: now };
  saveCustomSpeechList(list);
  removeCachedAudio(id);
  return loadCustomSpeechList();
}

export function formatCustomSpeechDate(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function ttsInstructionsForEntry(entry) {
  return entry.tts_instructions || buildCustomSpeechTtsInstructions(entry.lines);
}

function normalizeImportedEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!body) return null;

  const parsedLines = Array.isArray(raw.lines) && raw.lines.length > 0
    ? raw.lines
    : parseCustomSpeechBody(body);
  if (parsedLines.length === 0) return null;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : computeCustomSpeechId(),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Untitled',
    body,
    translation_ja: typeof raw.translation_ja === 'string' ? raw.translation_ja : '',
    lines: parsedLines,
    tts_instructions: typeof raw.tts_instructions === 'string' ? raw.tts_instructions : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : (typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()),
    deletedAt: null,
  };
}

export function exportCustomSpeechData() {
  return JSON.stringify({
    version: CUSTOM_SPEECH_EXPORT_VERSION,
    type: CUSTOM_SPEECH_EXPORT_TYPE,
    exportedAt: new Date().toISOString(),
    entries: loadCustomSpeechList(),
  }, null, 2);
}

/**
 * Import saved speech entries from a JSON export file.
 * Merges by id: existing local entries are kept, new ids are appended.
 */
export function importCustomSpeechData(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON file');
  }

  const rawEntries = Array.isArray(parsed)
    ? parsed
    : parsed?.type === CUSTOM_SPEECH_EXPORT_TYPE && Array.isArray(parsed.entries)
      ? parsed.entries
      : null;

  if (!rawEntries) {
    throw new Error('Unrecognized backup file format');
  }

  const imported = rawEntries.map(normalizeImportedEntry).filter(Boolean);
  if (imported.length === 0) {
    throw new Error('No valid saved items found in file');
  }

  const existing = loadCustomSpeechListRaw();
  const existingIds = new Set(existing.filter((e) => !e.deletedAt).map((e) => e.id));
  const merged = [
    ...existing.filter((e) => !e.deletedAt),
    ...imported.filter((e) => !existingIds.has(e.id)),
  ].slice(0, MAX_ENTRIES);

  if (!saveCustomSpeechList(merged.map((e) => ({ ...e, updatedAt: new Date().toISOString() })))) {
    throw new Error('Could not save imported items — browser storage may be full');
  }

  const added = merged.length - existing.filter((e) => !e.deletedAt).length;
  return { list: loadCustomSpeechList(), added, skipped: imported.length - added };
}
