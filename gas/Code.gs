/**
 * English Listening Trainer — TTS proxy with Drive cache.
 *
 * Setup:
 *   1. Create a new Apps Script project.
 *   2. Paste this file as Code.gs.
 *   3. Script Properties: set OPENAI_API_KEY and CACHE_FOLDER_ID.
 *      (CACHE_FOLDER_ID = Drive folder ID where mp3 files will be stored.)
 *   4. Deploy as Web app, "Execute as: Me", "Who has access: Anyone".
 *   5. Copy the /exec URL into the app's "GAS Endpoint URL" field.
 *
 * Request body (JSON, sent as text/plain to avoid CORS preflight):
 *   TTS:  { action: 'tts', lines: [...], voiceA, voiceB, speed, instructions }
 *   Sync: { action: 'sync_pull'|'sync_push', token, speech?: [...], history?: [...] }
 *
 * Script Properties: OPENAI_API_KEY, CACHE_FOLDER_ID, SYNC_FOLDER_ID
 *
 * Response:
 *   { audioBase64: '...', mimeType: 'audio/mpeg', cached: true|false, perLine: [...] }
 */

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const OPENAI_MODEL = 'gpt-4o-mini-tts';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'tts') {
      return jsonResponse(handleTTS(body));
    }
    if (body.action === 'sync_pull') {
      return jsonResponse(handleSyncPull(body));
    }
    if (body.action === 'sync_push') {
      return jsonResponse(handleSyncPush(body));
    }
    return jsonResponse({ error: `Unknown action: ${body.action}` });
  } catch (err) {
    return jsonResponse({ error: String(err && err.message || err) });
  }
}

function doGet() {
  return jsonResponse({ status: 'ok', service: 'elt-tts-proxy' });
}

function handleTTS(body) {
  const lines = body.lines || [];
  const voiceA = body.voiceA || 'nova';
  const voiceB = body.voiceB || 'onyx';
  const speed = body.speed || 1.0;
  const instructions = body.instructions || '';

  if (lines.length === 0) throw new Error('No lines provided');

  // Generate audio for each line (cached per line)
  const perLine = lines.map((line) => {
    const voice = line.speaker === 'B' ? voiceB : voiceA;
    const cacheKey = sha256(`${voice}|${speed}|${instructions}|${line.text}`);
    const cached = getCachedMp3(cacheKey);
    if (cached) {
      return { speaker: line.speaker, audioBase64: cached, cached: true };
    }
    const mp3 = synthesizeOne_(line.text, voice, speed, instructions);
    saveCachedMp3(cacheKey, mp3);
    return { speaker: line.speaker, audioBase64: mp3, cached: false };
  });

  // For dialogue, concatenate mp3 frames with small silence gaps.
  // For single-speaker, perLine[0] is the answer.
  const combined = perLine.length === 1
    ? perLine[0].audioBase64
    : concatMp3WithGaps_(perLine.map(p => p.audioBase64), 350);

  return {
    audioBase64: combined,
    mimeType: 'audio/mpeg',
    cached: perLine.every(p => p.cached),
    perLine: perLine.map(p => ({ speaker: p.speaker, cached: p.cached })),
  };
}

function synthesizeOne_(text, voice, speed, instructions) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not set in Script Properties');

  const payload = {
    model: OPENAI_MODEL,
    voice: voice,
    input: text,
    response_format: 'mp3',
    speed: speed,
  };
  if (instructions) payload.instructions = instructions;

  const res = UrlFetchApp.fetch(OPENAI_TTS_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${apiKey}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(`OpenAI TTS ${res.getResponseCode()}: ${res.getContentText().slice(0, 500)}`);
  }
  const blob = res.getBlob();
  return Utilities.base64Encode(blob.getBytes());
}

// ===== Drive cache =====
function getCacheFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('CACHE_FOLDER_ID');
  if (!id) throw new Error('CACHE_FOLDER_ID not set in Script Properties');
  return DriveApp.getFolderById(id);
}

function getCachedMp3(key) {
  const folder = getCacheFolder_();
  const files = folder.getFilesByName(`${key}.mp3`);
  if (!files.hasNext()) return null;
  const blob = files.next().getBlob();
  return Utilities.base64Encode(blob.getBytes());
}

function saveCachedMp3(key, base64) {
  const folder = getCacheFolder_();
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, 'audio/mpeg', `${key}.mp3`);
  folder.createFile(blob);
}

// ===== Utilities =====
function sha256(input) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  return digest.map((b) => {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/**
 * Naively concatenate base64-encoded MP3 frames.
 * MP3 is a frame-based format that tolerates concatenation of independent frames,
 * but a per-line gap of silence between speakers feels more natural.
 *
 * For prototype purposes we just concatenate the bytes directly (no silence frame).
 * If a silence gap is required, we could embed a pre-encoded silent MP3 chunk; for now
 * we rely on natural trailing silence in each clip.
 */
function concatMp3WithGaps_(base64List, gapMs) {
  // Simple byte concatenation. Gap_ms is currently informational only.
  const buffers = base64List.map(b => Utilities.base64Decode(b));
  let total = 0;
  buffers.forEach(b => total += b.length);
  const out = new Array(total);
  let pos = 0;
  for (const buf of buffers) {
    for (let i = 0; i < buf.length; i++) out[pos++] = buf[i];
  }
  return Utilities.base64Encode(out);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== Cloud sync (Drive JSON per sync token) =====

const SYNC_FILE_PREFIX = 'elt-sync-';
const SYNC_DOC_VERSION = 1;

function validateSyncToken_(token) {
  if (typeof token !== 'string') throw new Error('Sync token required');
  const trimmed = token.trim();
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(trimmed)) {
    throw new Error('Invalid sync token');
  }
  return trimmed;
}

function syncFileName_(token) {
  return `${SYNC_FILE_PREFIX}${sha256(token)}.json`;
}

function getSyncFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('SYNC_FOLDER_ID');
  if (!id) throw new Error('SYNC_FOLDER_ID not set in Script Properties');
  return DriveApp.getFolderById(id);
}

function emptySyncDoc_() {
  return {
    version: SYNC_DOC_VERSION,
    updatedAt: new Date(0).toISOString(),
    speech: [],
    history: [],
  };
}

function readSyncDoc_(token) {
  const folder = getSyncFolder_();
  const name = syncFileName_(token);
  const files = folder.getFilesByName(name);
  if (!files.hasNext()) return null;
  const raw = files.next().getBlob().getDataAsString('UTF-8');
  const parsed = JSON.parse(raw);
  return {
    version: parsed.version || SYNC_DOC_VERSION,
    updatedAt: parsed.updatedAt || new Date(0).toISOString(),
    speech: Array.isArray(parsed.speech) ? parsed.speech : [],
    history: Array.isArray(parsed.history) ? parsed.history : [],
  };
}

function writeSyncDoc_(token, doc) {
  const folder = getSyncFolder_();
  const name = syncFileName_(token);
  const payload = JSON.stringify(doc);
  const blob = Utilities.newBlob(payload, 'application/json', name);
  const files = folder.getFilesByName(name);
  if (files.hasNext()) {
    files.next().setContent(payload);
  } else {
    folder.createFile(blob);
  }
}

function entryTimestamp_(entry) {
  if (!entry) return 0;
  const raw = entry.updatedAt || entry.lastPlayedAt || entry.createdAt || 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function mergeEntryLists_(serverList, clientList) {
  const byId = {};
  const all = []
    .concat(Array.isArray(serverList) ? serverList : [])
    .concat(Array.isArray(clientList) ? clientList : []);

  for (let i = 0; i < all.length; i++) {
    const entry = all[i];
    if (!entry || typeof entry.id !== 'string' || !entry.id) continue;
    const prev = byId[entry.id];
    if (!prev || entryTimestamp_(entry) >= entryTimestamp_(prev)) {
      byId[entry.id] = entry;
    }
  }

  return Object.keys(byId).map(function (id) { return byId[id]; });
}

function handleSyncPull(body) {
  const token = validateSyncToken_(body.token);
  const doc = readSyncDoc_(token) || emptySyncDoc_();
  return {
    version: doc.version,
    updatedAt: doc.updatedAt,
    speech: doc.speech,
    history: doc.history,
  };
}

function handleSyncPush(body) {
  const token = validateSyncToken_(body.token);
  const existing = readSyncDoc_(token) || emptySyncDoc_();
  const merged = {
    version: SYNC_DOC_VERSION,
    updatedAt: new Date().toISOString(),
    speech: mergeEntryLists_(existing.speech, body.speech || []),
    history: mergeEntryLists_(existing.history, body.history || []),
  };
  writeSyncDoc_(token, merged);
  return {
    ok: true,
    updatedAt: merged.updatedAt,
    speechCount: merged.speech.filter(function (e) { return !e.deletedAt; }).length,
    historyCount: merged.history.filter(function (e) { return !e.deletedAt; }).length,
  };
}
