// Custom speech: user-authored text → TTS with M:/F: speaker tags.

import { removeCachedAudio } from './storage.js';
import { buildCustomSpeechTtsInstructions } from './api.js';

const STORAGE_KEY = 'elt_custom_speech';
const MAX_ENTRIES = 50;

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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveCustomSpeechList(list) {
  const payload = JSON.stringify(list.slice(0, MAX_ENTRIES));
  try {
    localStorage.setItem(STORAGE_KEY, payload);
    return true;
  } catch (err) {
    console.warn('Custom speech save failed:', err);
    // Retry with fewer entries when storage quota is exceeded (common on iOS Safari).
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, Math.min(20, list.length))));
      return true;
    } catch {
      return false;
    }
  }
}

export function addCustomSpeechEntry({ title, body, ttsInstructions }) {
  const parsedLines = parseCustomSpeechBody(body);
  if (parsedLines.length === 0) throw new Error('Enter body text');

  const entry = {
    id: computeCustomSpeechId(),
    title: title.trim() || 'Untitled',
    body: body.trim(),
    lines: parsedLines,
    tts_instructions: ttsInstructions,
    createdAt: new Date().toISOString(),
  };

  const list = [entry, ...loadCustomSpeechList()];
  if (!saveCustomSpeechList(list)) {
    throw new Error('Could not save item — browser storage may be full. Delete old items or clear cached audio.');
  }
  return { entry, list };
}

export function updateCustomSpeechTitle(id, title) {
  const list = loadCustomSpeechList();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return list;
  list[idx] = { ...list[idx], title: title.trim() || 'Untitled' };
  saveCustomSpeechList(list);
  return list;
}

export function removeCustomSpeechEntry(id) {
  const list = loadCustomSpeechList().filter((e) => e.id !== id);
  saveCustomSpeechList(list);
  removeCachedAudio(id);
  return list;
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
