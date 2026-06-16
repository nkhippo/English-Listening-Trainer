// Browser persistence: past items + local audio cache (saves API calls).

const HISTORY_KEY = 'elt_history';
const AUDIO_PREFIX = 'elt_audio:';
const MAX_HISTORY = 100;
const MAX_AUDIO_ENTRIES = 40;

function previewText(item) {
  const lines = item?.lines || [{ text: item?.sentence || '' }];
  const text = lines.map((l) => l.text).join(' / ');
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

export function computeItemId({ item, mode, scene, level }) {
  const payload = JSON.stringify({
    mode,
    scene,
    level,
    sentence: item.sentence || '',
    lines: item.lines || [],
  });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 31 + payload.charCodeAt(i)) | 0;
  }
  return `h${Math.abs(hash).toString(36)}`;
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)));
}

export function upsertHistoryEntry({ id, item, mode, scene, level }) {
  const now = new Date().toISOString();
  const existing = loadHistory().find((e) => e.id === id);
  const list = loadHistory().filter((e) => e.id !== id);
  list.unshift({
    id,
    item,
    mode,
    scene,
    level,
    preview: previewText(item),
    createdAt: existing?.createdAt || now,
    lastPlayedAt: now,
  });
  saveHistory(list);
  return list;
}

export function touchHistoryEntry(id) {
  const list = loadHistory();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return list;
  list[idx].lastPlayedAt = new Date().toISOString();
  list.sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt));
  saveHistory(list);
  return list;
}

export function removeHistoryEntry(id) {
  const list = loadHistory().filter((e) => e.id !== id);
  saveHistory(list);
  removeCachedAudio(id);
  return list;
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
    // Quota exceeded: drop oldest caches and retry once.
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
