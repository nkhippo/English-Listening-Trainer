const RECORDINGS_KEY = 'elt_shadow_recordings';
const MAX_RECORDINGS = 30;

function loadRaw() {
  try {
    const raw = localStorage.getItem(RECORDINGS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveRaw(list) {
  localStorage.setItem(RECORDINGS_KEY, JSON.stringify(list.slice(0, MAX_RECORDINGS)));
}

export function loadShadowRecordings(entryId) {
  const all = loadRaw();
  return entryId ? all.filter((r) => r.entryId === entryId) : all;
}

export async function saveShadowRecording({ entryId, stage, audioBlob, matchScore, transcript }) {
  const base64 = await blobToBase64(audioBlob);
  const entry = {
    id: `rec${Date.now().toString(36)}`,
    entryId,
    stage,
    matchScore: matchScore ?? null,
    transcript: transcript || '',
    audioBase64: base64,
    mimeType: audioBlob.type || 'audio/webm',
    createdAt: new Date().toISOString(),
  };
  const list = loadRaw();
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
  if (!entry?.audioBase64) return null;
  return `data:${entry.mimeType || 'audio/webm'};base64,${entry.audioBase64}`;
}
