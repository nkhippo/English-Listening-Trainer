// Cloud sync via GAS + Google Drive (single-user, automatic).

import { loadCustomSpeechListRaw, replaceCustomSpeechRaw } from './customSpeech.js';
import { loadShadowQueueRaw, replaceShadowQueueRaw } from '../core/shared/materialQueue.js';
import { loadShadowRecordingsRaw, replaceShadowRecordingsRaw } from '../core/shared/shadowRecordings.js';
import {
  loadExtensiveStatsRaw,
  replaceExtensiveStatsRaw,
  mergeExtensiveStats,
} from '../core/shared/extensiveStats.js';
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

import { gasFetch } from './gasFetch.js';

async function fetchGas({ gasUrl, action, payload = {} }) {
  return gasFetch(gasUrl, { action, ...payload }, { nonJsonLabel: 'Sync proxy' });
}

export function getLocalSyncPayload() {
  return {
    speech: loadCustomSpeechListRaw(),
    history: loadHistoryRaw(),
    extensiveHistory: loadExtensiveHistoryRaw(),
    shadowQueue: loadShadowQueueRaw(),
    shadowRecordings: loadShadowRecordingsRaw(),
    extensiveStats: loadExtensiveStatsRaw(),
  };
}

export function applyMergedSyncData({
  speech, history, extensiveHistory, shadowQueue, shadowRecordings, extensiveStats,
}) {
  replaceCustomSpeechRaw(speech);
  replaceHistoryRaw(history);
  replaceExtensiveHistoryRaw(extensiveHistory);
  replaceShadowQueueRaw(shadowQueue);
  replaceShadowRecordingsRaw(shadowRecordings);
  replaceExtensiveStatsRaw(extensiveStats);
  return {
    speech: activeEntries(speech),
    history: activeEntries(history),
    extensiveHistory: activeEntries(extensiveHistory),
    shadowQueue: activeEntries(shadowQueue),
    shadowRecordings: activeEntries(shadowRecordings),
    extensiveStats,
  };
}

export function mergeLocalWithRemote(remote) {
  const local = getLocalSyncPayload();
  const mergedSpeech = mergeEntryLists(local.speech, remote.speech || []);
  const mergedHistory = mergeEntryLists(local.history, remote.history || []);
  const mergedExtensiveHistory = mergeEntryLists(local.extensiveHistory, remote.extensiveHistory || []);
  const mergedShadowQueue = mergeEntryLists(local.shadowQueue, remote.shadowQueue || []);
  const mergedShadowRecordings = mergeEntryLists(local.shadowRecordings, remote.shadowRecordings || []);
  const mergedExtensiveStats = mergeExtensiveStats(local.extensiveStats, remote.extensiveStats);
  return applyMergedSyncData({
    speech: mergedSpeech,
    history: mergedHistory,
    extensiveHistory: mergedExtensiveHistory,
    shadowQueue: mergedShadowQueue,
    shadowRecordings: mergedShadowRecordings,
    extensiveStats: mergedExtensiveStats,
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
      extensiveStats: payload.extensiveStats,
    },
  });
}

export async function pullCloudMetadataSync({ gasUrl }) {
  const remote = await fetchGas({ gasUrl, action: 'sync_pull' });
  const applied = mergeLocalWithRemote(remote);
  const pushResult = await pushCloudSync({ gasUrl });
  return {
    applied,
    audioIds: pushResult.audioIds || remote.audioIds || [],
    remoteUpdatedAt: remote.updatedAt,
  };
}

export async function syncCloudAudio({ gasUrl, audioIds, applied }) {
  await downloadMissingAudio({ gasUrl, audioIds, applied });
  await uploadMissingAudio({ gasUrl, audioIds });
}

export async function pullCloudSync({ gasUrl }) {
  const meta = await pullCloudMetadataSync({ gasUrl });
  await syncCloudAudio({ gasUrl, audioIds: meta.audioIds, applied: meta.applied });
  return meta;
}

export async function uploadCachedAudio({ gasUrl, itemId }) {
  const base64 = getCachedAudio(itemId);
  if (!base64) return false;
  return pushCloudAudio({ gasUrl, itemId, audioBase64: base64 });
}
