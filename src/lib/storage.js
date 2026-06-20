// Browser persistence: past items + local audio cache (saves API calls).

const HISTORY_KEY = 'elt_history';
const EXTENSIVE_HISTORY_KEY = 'elt_extensive_history';
const AUDIO_PREFIX = 'elt_audio:';
const MAX_HISTORY = 100;
const MAX_AUDIO_ENTRIES = 40;

function hashPayload(payload) {
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 31 + payload.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function previewText(item) {
  const lines = item?.lines || [{ text: item?.sentence || '' }];
  const text = lines.map((l) => l.text).join(' / ');
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

export function computeItemId({ item, mode, scene, level, cefr }) {
  const payload = JSON.stringify({
    mode,
    scene,
    level,
    cefr: cefr || null,
    sentence: item.sentence || '',
    lines: item.lines || [],
  });
  return `h${hashPayload(payload)}`;
}

export function computeExtensiveItemId({ item, scene, level, cefr, length, structureFlags = [] }) {
  const payload = JSON.stringify({
    shell: 'extensive',
    scene,
    level,
    cefr: cefr || null,
    length,
    structureFlags: [...structureFlags].sort(),
    sentence: item.sentence || '',
    lines: item.lines || [],
  });
  return `ex${hashPayload(payload)}`;
}

export function loadHistoryRaw() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeHistoryEntry);
  } catch {
    return [];
  }
}

function normalizeHistoryEntry(entry) {
  const createdAt = entry.createdAt || entry.lastPlayedAt || new Date().toISOString();
  return {
    ...entry,
    createdAt,
    updatedAt: entry.updatedAt || entry.lastPlayedAt || createdAt,
    deletedAt: entry.deletedAt || null,
  };
}

export function loadHistory() {
  return loadHistoryRaw()
    .filter((e) => !e.deletedAt)
    .sort((a, b) => new Date(b.lastPlayedAt || b.updatedAt) - new Date(a.lastPlayedAt || a.updatedAt));
}

function saveHistoryRaw(list) {
  const activeCount = list.filter((e) => !e.deletedAt).length;
  let trimmed = list;
  if (activeCount > MAX_HISTORY) {
    const active = list.filter((e) => !e.deletedAt).slice(0, MAX_HISTORY);
    const tombstones = list.filter((e) => e.deletedAt);
    trimmed = [...active, ...tombstones];
  }
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    return true;
  } catch (err) {
    console.warn('History save failed (storage quota?):', err);
    try {
      const fallback = trimmed.filter((e) => !e.deletedAt).slice(0, Math.min(20, MAX_HISTORY));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(fallback));
      return true;
    } catch {
      return false;
    }
  }
}

export function replaceHistoryRaw(list) {
  saveHistoryRaw((list || []).map(normalizeHistoryEntry));
}

export function upsertHistoryEntry({ id, item, mode, scene, level, cefr }) {
  const now = new Date().toISOString();
  const all = loadHistoryRaw();
  const existing = all.find((e) => e.id === id);
  const raw = all.filter((e) => e.id !== id);
  raw.unshift({
    id,
    item,
    mode,
    scene,
    level,
    cefr: cefr || null,
    preview: previewText(item),
    createdAt: existing?.createdAt || now,
    lastPlayedAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  saveHistoryRaw(raw);
  return loadHistory();
}

export function touchHistoryEntry(id) {
  const now = new Date().toISOString();
  const raw = loadHistoryRaw();
  const idx = raw.findIndex((e) => e.id === id);
  if (idx === -1) return loadHistory();
  raw[idx] = {
    ...raw[idx],
    lastPlayedAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  raw.sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt));
  saveHistoryRaw(raw);
  return loadHistory();
}

export function removeHistoryEntry(id) {
  const now = new Date().toISOString();
  const raw = loadHistoryRaw();
  const idx = raw.findIndex((e) => e.id === id);
  if (idx === -1) return loadHistory();
  raw[idx] = { ...raw[idx], deletedAt: now, updatedAt: now };
  saveHistoryRaw(raw);
  removeCachedAudio(id);
  return loadHistory();
}

function audioKey(id) {
  return `${AUDIO_PREFIX}${id}`;
}

export function getCachedAudio(id) {
  try {
    return localStorage.getItem(audioKey(id));
  } catch {
    return null;
  }
}

export function hasCachedAudio(id) {
  return !!getCachedAudio(id);
}

export function listCachedAudioIds() {
  return listAudioKeys().map((k) => k.slice(AUDIO_PREFIX.length));
}

function listAudioKeys() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(AUDIO_PREFIX)) keys.push(k);
    }
  } catch {
    /* ignore */
  }
  return keys;
}

function evictOldestAudio(exceptId) {
  const keys = listAudioKeys().filter((k) => k !== audioKey(exceptId));
  if (keys.length <= MAX_AUDIO_ENTRIES) return;
  keys.slice(0, keys.length - MAX_AUDIO_ENTRIES).forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
}

export function saveCachedAudio(id, base64) {
  evictOldestAudio(id);
  try {
    localStorage.setItem(audioKey(id), base64);
    return true;
  } catch {
    listAudioKeys()
      .slice(0, 5)
      .forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {
          /* ignore */
        }
      });
    try {
      localStorage.setItem(audioKey(id), base64);
      return true;
    } catch {
      return false;
    }
  }
}

export function removeCachedAudio(id) {
  try {
    localStorage.removeItem(audioKey(id));
  } catch {
    /* ignore */
  }
}

// ===== Extensive listening history =====

export function loadExtensiveHistoryRaw() {
  try {
    const raw = localStorage.getItem(EXTENSIVE_HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeHistoryEntry);
  } catch {
    return [];
  }
}

export function loadExtensiveHistory() {
  return loadExtensiveHistoryRaw()
    .filter((e) => !e.deletedAt)
    .sort((a, b) => new Date(b.lastPlayedAt || b.updatedAt) - new Date(a.lastPlayedAt || a.updatedAt));
}

function saveExtensiveHistoryRaw(list) {
  const activeCount = list.filter((e) => !e.deletedAt).length;
  let trimmed = list;
  if (activeCount > MAX_HISTORY) {
    const active = list.filter((e) => !e.deletedAt).slice(0, MAX_HISTORY);
    const tombstones = list.filter((e) => e.deletedAt);
    trimmed = [...active, ...tombstones];
  }
  try {
    localStorage.setItem(EXTENSIVE_HISTORY_KEY, JSON.stringify(trimmed));
    return true;
  } catch (err) {
    console.warn('Extensive history save failed:', err);
    return false;
  }
}

export function upsertExtensiveHistoryEntry({
  id, item, scene, level, cefr, length, structureFlags, viewMode,
}) {
  const now = new Date().toISOString();
  const all = loadExtensiveHistoryRaw();
  const existing = all.find((e) => e.id === id);
  const raw = all.filter((e) => e.id !== id);
  raw.unshift({
    id,
    item,
    scene,
    level,
    cefr: cefr || null,
    length,
    structureFlags: structureFlags || [],
    viewMode: viewMode || 'read_listen',
    preview: previewText(item),
    createdAt: existing?.createdAt || now,
    lastPlayedAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  saveExtensiveHistoryRaw(raw);
  return loadExtensiveHistory();
}

export function touchExtensiveHistoryEntry(id) {
  const now = new Date().toISOString();
  const raw = loadExtensiveHistoryRaw();
  const idx = raw.findIndex((e) => e.id === id);
  if (idx === -1) return loadExtensiveHistory();
  raw[idx] = {
    ...raw[idx],
    lastPlayedAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  raw.sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt));
  saveExtensiveHistoryRaw(raw);
  return loadExtensiveHistory();
}

export function removeExtensiveHistoryEntry(id) {
  const now = new Date().toISOString();
  const raw = loadExtensiveHistoryRaw();
  const idx = raw.findIndex((e) => e.id === id);
  if (idx === -1) return loadExtensiveHistory();
  raw[idx] = { ...raw[idx], deletedAt: now, updatedAt: now };
  saveExtensiveHistoryRaw(raw);
  removeCachedAudio(id);
  return loadExtensiveHistory();
}
