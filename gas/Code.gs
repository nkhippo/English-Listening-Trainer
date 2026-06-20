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
 *   Sync: { action: 'sync_pull'|'sync_push'|'sync_audio_pull'|'sync_audio_push'|'sync_audio_delete', ... }
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
    if (body.action === 'audio') {
      return jsonResponse(handleAudio(body));
    }
    if (body.action === 'tts') {
      return jsonResponse(handleTTS(body));
    }
    if (body.action === 'sync_pull') {
      return jsonResponse(handleSyncPull(body));
    }
    if (body.action === 'sync_push') {
      return jsonResponse(handleSyncPush(body));
    }
    if (body.action === 'sync_audio_pull') {
      return jsonResponse(handleSyncAudioPull(body));
    }
    if (body.action === 'sync_audio_push') {
      return jsonResponse(handleSyncAudioPush(body));
    }
    if (body.action === 'sync_audio_delete') {
      return jsonResponse(handleSyncAudioDelete(body));
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

// ===== v2 Audio cache with manifest (§5) =====

const MANIFEST_FILE = 'audio_manifest.json';
const MANIFEST_VERSION = '1';
const MANIFEST_MAX_ENTRIES = 5000;

function getListeningTrainerRoot_() {
  const cacheId = PropertiesService.getScriptProperties().getProperty('CACHE_FOLDER_ID');
  if (!cacheId) throw new Error('CACHE_FOLDER_ID not set in Script Properties');
  return DriveApp.getFolderById(cacheId);
}

function getOrCreateSubfolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function getAudioFolder_(cefr, shell) {
  const root = getListeningTrainerRoot_();
  const audioRoot = getOrCreateSubfolder_(root, 'audio');
  const cefrFolder = getOrCreateSubfolder_(audioRoot, cefr || 'B1');
  return getOrCreateSubfolder_(cefrFolder, shell || 'intensive');
}

function getManifestFolder_() {
  const root = getListeningTrainerRoot_();
  return getOrCreateSubfolder_(root, 'manifest');
}

function readAudioManifest_() {
  const folder = getManifestFolder_();
  const files = folder.getFilesByName(MANIFEST_FILE);
  if (!files.hasNext()) {
    return { version: MANIFEST_VERSION, updated_at: new Date().toISOString(), entries: {} };
  }
  const raw = files.next().getBlob().getDataAsString('UTF-8');
  const parsed = JSON.parse(raw);
  return {
    version: parsed.version || MANIFEST_VERSION,
    updated_at: parsed.updated_at || new Date().toISOString(),
    entries: parsed.entries || {},
  };
}

function writeAudioManifest_(manifest) {
  const folder = getManifestFolder_();
  manifest.updated_at = new Date().toISOString();
  const payload = JSON.stringify(manifest);
  const files = folder.getFilesByName(MANIFEST_FILE);
  if (files.hasNext()) {
    files.next().setContent(payload);
  } else {
    folder.createFile(Utilities.newBlob(payload, 'application/json', MANIFEST_FILE));
  }
}

function computeAudioCacheKey_(body) {
  const textPart = body.lines
    ? JSON.stringify(body.lines)
    : String(body.text || '');
  const voice = body.voice || body.voiceA || 'nova';
  const speed = body.speed || 1.0;
  const instructions = body.instructions || '';
  return sha256(textPart + '|' + voice + '|' + speed + '|' + instructions);
}

function driveDirectUrl_(fileId) {
  return 'https://drive.google.com/uc?export=download&id=' + fileId;
}

function handleAudio(body) {
  const lines = body.lines || [];
  const cefr = body.cefr || 'B1';
  const shell = body.shell || 'intensive';
  const voiceA = body.voice || body.voiceA || 'nova';
  const voiceB = body.voiceB || 'onyx';
  const speed = body.speed || 1.0;
  const instructions = body.instructions || '';

  if (lines.length === 0 && !body.text) throw new Error('No text or lines provided');

  const hash = computeAudioCacheKey_(body);
  const manifest = readAudioManifest_();
  const existing = manifest.entries[hash];

  if (existing && existing.drive_file_id) {
    existing.last_accessed_at = new Date().toISOString();
    existing.access_count = (existing.access_count || 0) + 1;
    manifest.entries[hash] = existing;
    writeAudioManifest_(manifest);
    var hitBase64 = null;
    try {
      hitBase64 = Utilities.base64Encode(DriveApp.getFileById(existing.drive_file_id).getBlob().getBytes());
    } catch (e) { /* url-only fallback */ }
    return {
      url: existing.drive_url || driveDirectUrl_(existing.drive_file_id),
      audioBase64: hitBase64,
      mimeType: 'audio/mpeg',
      cached: true,
      sizeBytes: existing.size_bytes || 0,
      hash: hash,
    };
  }

  var perLine;
  if (lines.length > 0) {
    perLine = lines.map(function (line) {
      var voice = line.speaker === 'B' ? voiceB : voiceA;
      return { speaker: line.speaker, audioBase64: synthesizeOne_(line.text, voice, speed, instructions), cached: false };
    });
  } else {
    perLine = [{ speaker: 'A', audioBase64: synthesizeOne_(body.text, voiceA, speed, instructions), cached: false }];
  }

  const combined = perLine.length === 1
    ? perLine[0].audioBase64
    : concatMp3WithGaps_(perLine.map(function (p) { return p.audioBase64; }), 350);

  const folder = getAudioFolder_(cefr, shell);
  const bytes = Utilities.base64Decode(combined);
  const blob = Utilities.newBlob(bytes, 'audio/mpeg', hash + '.mp3');
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const previewSource = lines.length > 0 ? lines[0].text : String(body.text || '');
  manifest.entries[hash] = {
    drive_file_id: file.getId(),
    drive_url: driveDirectUrl_(file.getId()),
    cefr: cefr,
    shell: shell,
    text_preview: previewSource.slice(0, 40),
    voice: voiceA,
    speed: speed,
    size_bytes: bytes.length,
    created_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
    access_count: 1,
  };

  if (Object.keys(manifest.entries).length > MANIFEST_MAX_ENTRIES) {
    lruCleanupManifest_(manifest);
  } else {
    writeAudioManifest_(manifest);
  }

  return {
    url: driveDirectUrl_(file.getId()),
    audioBase64: combined,
    mimeType: 'audio/mpeg',
    cached: false,
    sizeBytes: bytes.length,
    hash: hash,
  };
}

function lruCleanupManifest_(manifest) {
  var keys = Object.keys(manifest.entries);
  keys.sort(function (a, b) {
    var ta = new Date(manifest.entries[a].last_accessed_at || 0).getTime();
    var tb = new Date(manifest.entries[b].last_accessed_at || 0).getTime();
    return ta - tb;
  });
  var toRemove = keys.length - MANIFEST_MAX_ENTRIES + 100;
  for (var i = 0; i < toRemove; i++) {
    var entry = manifest.entries[keys[i]];
    if (entry && entry.drive_file_id) {
      try {
        DriveApp.getFileById(entry.drive_file_id).setTrashed(true);
      } catch (e) { /* ignore */ }
    }
    delete manifest.entries[keys[i]];
  }
  writeAudioManifest_(manifest);
}

/** Monthly batch entry point — run from GAS editor or time trigger. */
function runManifestLruCleanup() {
  var manifest = readAudioManifest_();
  if (Object.keys(manifest.entries).length > MANIFEST_MAX_ENTRIES) {
    lruCleanupManifest_(manifest);
  }
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

// ===== Cloud sync (single-user Drive JSON + per-item audio) =====

const SYNC_DATA_FILE = 'elt-user-data.json';
const SYNC_AUDIO_PREFIX = 'elt-audio-';
const SYNC_DOC_VERSION = 1;

function validateItemId_(itemId) {
  if (typeof itemId !== 'string') throw new Error('itemId required');
  const trimmed = itemId.trim();
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(trimmed)) {
    throw new Error('Invalid itemId');
  }
  return trimmed;
}

function syncAudioFileName_(itemId) {
  return `${SYNC_AUDIO_PREFIX}${itemId}.mp3`;
}

function getSyncFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('SYNC_FOLDER_ID');
  if (!id) throw new Error('SYNC_FOLDER_ID not set in Script Properties');
  return DriveApp.getFolderById(id);
}

function emptyExtensiveStats_() {
  return {
    totalMinutes: 0,
    structureCounts: {},
    chunkEncounters: {},
    passagesCompleted: 0,
    structureValidation: { checked: 0, compliant: 0 },
    updatedAt: null,
  };
}

function mergeCountMaps_(a, b) {
  const out = {};
  const left = a || {};
  const right = b || {};
  Object.keys(left).forEach(function (key) { out[key] = Number(left[key]) || 0; });
  Object.keys(right).forEach(function (key) {
    out[key] = (out[key] || 0) + (Number(right[key]) || 0);
  });
  return out;
}

function addExtensiveStats_(a, b) {
  return {
    totalMinutes: (Number(a.totalMinutes) || 0) + (Number(b.totalMinutes) || 0),
    passagesCompleted: (Number(a.passagesCompleted) || 0) + (Number(b.passagesCompleted) || 0),
    structureCounts: mergeCountMaps_(a.structureCounts, b.structureCounts),
    chunkEncounters: mergeCountMaps_(a.chunkEncounters, b.chunkEncounters),
    structureValidation: {
      checked: (Number(a.structureValidation && a.structureValidation.checked) || 0)
        + (Number(b.structureValidation && b.structureValidation.checked) || 0),
      compliant: (Number(a.structureValidation && a.structureValidation.compliant) || 0)
        + (Number(b.structureValidation && b.structureValidation.compliant) || 0),
    },
    updatedAt: new Date().toISOString(),
  };
}

function normalizeExtensiveStats_(raw) {
  if (!raw || typeof raw !== 'object') return emptyExtensiveStats_();
  return {
    totalMinutes: Number(raw.totalMinutes) || 0,
    passagesCompleted: Number(raw.passagesCompleted) || 0,
    structureCounts: raw.structureCounts && typeof raw.structureCounts === 'object' ? raw.structureCounts : {},
    chunkEncounters: raw.chunkEncounters && typeof raw.chunkEncounters === 'object' ? raw.chunkEncounters : {},
    structureValidation: {
      checked: Number(raw.structureValidation && raw.structureValidation.checked) || 0,
      compliant: Number(raw.structureValidation && raw.structureValidation.compliant) || 0,
    },
    updatedAt: raw.updatedAt || null,
  };
}

function statsTimestamp_(stats) {
  if (!stats || !stats.updatedAt) return 0;
  const ts = new Date(stats.updatedAt).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function mergeExtensiveStats_(local, remote) {
  const l = normalizeExtensiveStats_(local);
  const r = normalizeExtensiveStats_(remote);
  if (!r.updatedAt) return l;
  if (!l.updatedAt) return r;
  const lts = statsTimestamp_(l);
  const rts = statsTimestamp_(r);
  if (rts > lts) return r;
  if (lts > rts) return l;
  return addExtensiveStats_(l, r);
}

function emptySyncDoc_() {
  return {
    version: SYNC_DOC_VERSION,
    updatedAt: new Date(0).toISOString(),
    speech: [],
    history: [],
    extensiveHistory: [],
    shadowQueue: [],
    shadowRecordings: [],
    extensiveStats: emptyExtensiveStats_(),
  };
}

function readSyncDoc_() {
  const folder = getSyncFolder_();
  const files = folder.getFilesByName(SYNC_DATA_FILE);
  if (!files.hasNext()) return null;
  const raw = files.next().getBlob().getDataAsString('UTF-8');
  const parsed = JSON.parse(raw);
  return {
    version: parsed.version || SYNC_DOC_VERSION,
    updatedAt: parsed.updatedAt || new Date(0).toISOString(),
    speech: Array.isArray(parsed.speech) ? parsed.speech : [],
    history: Array.isArray(parsed.history) ? parsed.history : [],
    extensiveHistory: Array.isArray(parsed.extensiveHistory) ? parsed.extensiveHistory : [],
    shadowQueue: Array.isArray(parsed.shadowQueue) ? parsed.shadowQueue : [],
    shadowRecordings: Array.isArray(parsed.shadowRecordings) ? parsed.shadowRecordings : [],
    extensiveStats: normalizeExtensiveStats_(parsed.extensiveStats),
  };
}

function writeSyncDoc_(doc) {
  const folder = getSyncFolder_();
  const payload = JSON.stringify(doc);
  const files = folder.getFilesByName(SYNC_DATA_FILE);
  if (files.hasNext()) {
    files.next().setContent(payload);
  } else {
    const blob = Utilities.newBlob(payload, 'application/json', SYNC_DATA_FILE);
    folder.createFile(blob);
  }
}

function listSyncAudioIds_() {
  const folder = getSyncFolder_();
  const ids = [];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const name = files.next().getName();
    if (name.indexOf(SYNC_AUDIO_PREFIX) === 0 && name.slice(-4) === '.mp3') {
      ids.push(name.slice(SYNC_AUDIO_PREFIX.length, -4));
    }
  }
  return ids;
}

function getSyncAudio_(itemId) {
  const folder = getSyncFolder_();
  const files = folder.getFilesByName(syncAudioFileName_(itemId));
  if (!files.hasNext()) return null;
  const blob = files.next().getBlob();
  return Utilities.base64Encode(blob.getBytes());
}

function saveSyncAudio_(itemId, base64) {
  const folder = getSyncFolder_();
  const name = syncAudioFileName_(itemId);
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, 'audio/mpeg', name);
  const files = folder.getFilesByName(name);
  if (files.hasNext()) {
    files.next().setContent(blob.getBytes());
  } else {
    folder.createFile(blob);
  }
}

function deleteSyncAudio_(itemId) {
  const folder = getSyncFolder_();
  const files = folder.getFilesByName(syncAudioFileName_(itemId));
  while (files.hasNext()) {
    files.next().setTrashed(true);
  }
}

function entryTimestamp_(entry) {
  if (!entry) return 0;
  const raw = entry.updatedAt || entry.lastPlayedAt || entry.createdAt || entry.addedAt || 0;
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
  const doc = readSyncDoc_() || emptySyncDoc_();
  return {
    version: doc.version,
    updatedAt: doc.updatedAt,
    speech: doc.speech,
    history: doc.history,
    extensiveHistory: doc.extensiveHistory,
    shadowQueue: doc.shadowQueue,
    shadowRecordings: doc.shadowRecordings,
    extensiveStats: doc.extensiveStats,
    audioIds: listSyncAudioIds_(),
  };
}

function handleSyncPush(body) {
  const existing = readSyncDoc_() || emptySyncDoc_();
  const merged = {
    version: SYNC_DOC_VERSION,
    updatedAt: new Date().toISOString(),
    speech: mergeEntryLists_(existing.speech, body.speech || []),
    history: mergeEntryLists_(existing.history, body.history || []),
    extensiveHistory: mergeEntryLists_(existing.extensiveHistory, body.extensiveHistory || []),
    shadowQueue: mergeEntryLists_(existing.shadowQueue, body.shadowQueue || []),
    shadowRecordings: mergeEntryLists_(existing.shadowRecordings, body.shadowRecordings || []),
    extensiveStats: mergeExtensiveStats_(existing.extensiveStats, body.extensiveStats),
  };
  writeSyncDoc_(merged);
  return {
    ok: true,
    updatedAt: merged.updatedAt,
    speechCount: merged.speech.filter(function (e) { return !e.deletedAt; }).length,
    historyCount: merged.history.filter(function (e) { return !e.deletedAt; }).length,
    extensiveHistoryCount: merged.extensiveHistory.filter(function (e) { return !e.deletedAt; }).length,
    shadowQueueCount: merged.shadowQueue.filter(function (e) { return !e.deletedAt; }).length,
    shadowRecordingsCount: merged.shadowRecordings.filter(function (e) { return !e.deletedAt; }).length,
    audioIds: listSyncAudioIds_(),
  };
}

function handleSyncAudioPull(body) {
  const itemId = validateItemId_(body.itemId);
  const audioBase64 = getSyncAudio_(itemId);
  if (!audioBase64) {
    return { itemId: itemId, audioBase64: null, mimeType: 'audio/mpeg', found: false };
  }
  return { itemId: itemId, audioBase64: audioBase64, mimeType: 'audio/mpeg', found: true };
}

function handleSyncAudioPush(body) {
  const itemId = validateItemId_(body.itemId);
  if (!body.audioBase64) throw new Error('audioBase64 required');
  saveSyncAudio_(itemId, body.audioBase64);
  return { ok: true, itemId: itemId };
}

function handleSyncAudioDelete(body) {
  const itemId = validateItemId_(body.itemId);
  deleteSyncAudio_(itemId);
  return { ok: true, itemId: itemId };
}
