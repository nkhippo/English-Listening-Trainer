// Cloud sync via GAS + Google Drive (single-user, automatic).

import { loadCustomSpeechListRaw, replaceCustomSpeechRaw } from './customSpeech.js';
import { loadShadowQueueRaw, replaceShadowQueueRaw } from '../core/shared/materialQueue.js';
import { loadShadowRecordingsRaw, replaceShadowRecordingsRaw } from '../core/shared/shadowRecordings.js';
import {
  loadHistoryRaw,
  replaceHistoryRaw,
  loadExtensiveHistoryRaw,
  replaceExtensiveHistoryRaw,
  hasCachedAudio,
  getCachedAudio,
  saveCachedAudio,
  listCachedAudioIds,
} from './storage.js';

export function entryTimestamp(entry) {
  if (!entry) return 0;
  const raw = entry.updatedAt || entry.lastPlayedAt || entry.createdAt || entry.addedAt || 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function mergeEntryLists(localList, remoteList) {
  const byId = new Map();
  for (const entry of [...(localList || []), ...(remoteList || [])]) {
    if (!entry?.id) continue;
    const prev = byId.get(entry.id);
    if (!prev || entryTimestamp(entry) >= entryTimestamp(prev)) {
      byId.set(entry.id, entry);
    }
  }
  return [...byId.values()];
}

export function activeEntries(list) {
  return (list || []).filter((e) => !e.deletedAt);
}

function activeEntryIds({ speech, history, extensiveHistory, shadowQueue, shadowRecordings }) {
  return [
    ...activeEntries(speech).map((e) => e.id),
    ...activeEntries(history).map((e) => e.id),
    ...activeEntries(extensiveHistory).map((e) => e.id),
    ...activeEntries(shadowQueue).map((e) => e.id),
    ...activeEntries(shadowRecordings).map((e) => e.id),
  ];
}

async function fetchGas({ gasUrl, action, payload = {} }) {
  if (!gasUrl) throw new Error('GAS endpoint URL not configured');

  const res = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Sync proxy returned non-JSON: ${raw.slice(0, 200)}`);
  }
  if (data.error) throw new Error(data.error);
  return data;
}

export function getLocalSyncPayload() {
  return {
    speech: loadCustomSpeechListRaw(),
    history: loadHistoryRaw(),
    extensiveHistory: loadExtensiveHistoryRaw(),
    shadowQueue: loadShadowQueueRaw(),
    shadowRecordings: loadShadowRecordingsRaw(),
  };
}

export function applyMergedSyncData({
  speech, history, extensiveHistory, shadowQueue, shadowRecordings,
}) {
  replaceCustomSpeechRaw(speech);
  replaceHistoryRaw(history);
  replaceExtensiveHistoryRaw(extensiveHistory);
  replaceShadowQueueRaw(shadowQueue);
  replaceShadowRecordingsRaw(shadowRecordings);
  return {
    speech: activeEntries(speech),
    history: activeEntries(history),
    extensiveHistory: activeEntries(extensiveHistory),
    shadowQueue: activeEntries(shadowQueue),
    shadowRecordings: activeEntries(shadowRecordings),
  };
}

export function mergeLocalWithRemote(remote) {
  const local = getLocalSyncPayload();
  const mergedSpeech = mergeEntryLists(local.speech, remote.speech || []);
  const mergedHistory = mergeEntryLists(local.history, remote.history || []);
  const mergedExtensiveHistory = mergeEntryLists(local.extensiveHistory, remote.extensiveHistory || []);
  const mergedShadowQueue = mergeEntryLists(local.shadowQueue, remote.shadowQueue || []);
  const mergedShadowRecordings = mergeEntryLists(local.shadowRecordings, remote.shadowRecordings || []);
  return applyMergedSyncData({
    speech: mergedSpeech,
    history: mergedHistory,
    extensiveHistory: mergedExtensiveHistory,
    shadowQueue: mergedShadowQueue,
    shadowRecordings: mergedShadowRecordings,
  });
}

export async function pullCloudAudio({ gasUrl, itemId }) {
  const data = await fetchGas({
    gasUrl,
    action: 'sync_audio_pull',
    payload: { itemId },
  });
  if (!data.found || !data.audioBase64) return false;
  return saveCachedAudio(itemId, data.audioBase64);
}

export async function pushCloudAudio({ gasUrl, itemId, audioBase64 }) {
  if (!audioBase64) return false;
  await fetchGas({
    gasUrl,
    action: 'sync_audio_push',
    payload: { itemId, audioBase64 },
  });
  return true;
}

export async function deleteCloudAudio({ gasUrl, itemId }) {
  await fetchGas({
    gasUrl,
    action: 'sync_audio_delete',
    payload: { itemId },
  });
}

async function downloadMissingAudio({ gasUrl, audioIds, applied }) {
  const serverIds = new Set(audioIds || []);
  const wanted = activeEntryIds(applied);
  let downloaded = 0;

  for (const id of wanted) {
    if (!serverIds.has(id) || hasCachedAudio(id)) continue;
    try {
      const ok = await pullCloudAudio({ gasUrl, itemId: id });
      if (ok) downloaded += 1;
    } catch (err) {
      console.warn(`Cloud audio download failed for ${id}:`, err);
    }
  }
  return downloaded;
}

async function uploadMissingAudio({ gasUrl, audioIds }) {
  const serverIds = new Set(audioIds || []);
  const localIds = listCachedAudioIds();
  let uploaded = 0;

  for (const id of localIds) {
    if (serverIds.has(id)) continue;
    const base64 = getCachedAudio(id);
    if (!base64) continue;
    try {
      await pushCloudAudio({ gasUrl, itemId: id, audioBase64: base64 });
      uploaded += 1;
    } catch (err) {
      console.warn(`Cloud audio upload failed for ${id}:`, err);
    }
  }
  return uploaded;
}

export async function pushCloudSync({ gasUrl }) {
  const payload = getLocalSyncPayload();
  return fetchGas({
    gasUrl,
    action: 'sync_push',
    payload: {
      speech: payload.speech,
      history: payload.history,
      extensiveHistory: payload.extensiveHistory,
      shadowQueue: payload.shadowQueue,
      shadowRecordings: payload.shadowRecordings,
    },
  });
}

export async function pullCloudSync({ gasUrl }) {
  const remote = await fetchGas({ gasUrl, action: 'sync_pull' });
  const applied = mergeLocalWithRemote(remote);
  const pushResult = await pushCloudSync({ gasUrl });
  const audioIds = pushResult.audioIds || remote.audioIds || [];

  await downloadMissingAudio({ gasUrl, audioIds, applied });
  await uploadMissingAudio({ gasUrl, audioIds: audioIds });

  return {
    ...applied,
    remoteUpdatedAt: remote.updatedAt,
  };
}

export async function uploadCachedAudio({ gasUrl, itemId }) {
  const base64 = getCachedAudio(itemId);
  if (!base64) return false;
  return pushCloudAudio({ gasUrl, itemId, audioBase64: base64 });
}
