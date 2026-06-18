// Cloud sync via GAS + Google Drive JSON.

import { loadCustomSpeechListRaw, replaceCustomSpeechRaw } from './customSpeech.js';
import { loadHistoryRaw, replaceHistoryRaw } from './storage.js';

export function entryTimestamp(entry) {
  if (!entry) return 0;
  const raw = entry.updatedAt || entry.lastPlayedAt || entry.createdAt || 0;
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

async function fetchSync({ gasUrl, action, token, payload = {} }) {
  if (!gasUrl) throw new Error('GAS endpoint URL not configured');
  if (!token) throw new Error('Sync token not configured');

  const res = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token, ...payload }),
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
  };
}

export function applyMergedSyncData({ speech, history }) {
  replaceCustomSpeechRaw(speech);
  replaceHistoryRaw(history);
  return {
    speech: activeEntries(speech),
    history: activeEntries(history),
  };
}

export function mergeLocalWithRemote(remote) {
  const local = getLocalSyncPayload();
  const mergedSpeech = mergeEntryLists(local.speech, remote.speech || []);
  const mergedHistory = mergeEntryLists(local.history, remote.history || []);
  return applyMergedSyncData({ speech: mergedSpeech, history: mergedHistory });
}

export async function pullCloudSync({ gasUrl, token }) {
  const remote = await fetchSync({ gasUrl, action: 'sync_pull', token });
  const applied = mergeLocalWithRemote(remote);
  await pushCloudSync({ gasUrl, token });
  return { ...applied, remoteUpdatedAt: remote.updatedAt };
}

export async function pushCloudSync({ gasUrl, token }) {
  const payload = getLocalSyncPayload();
  return fetchSync({
    gasUrl,
    action: 'sync_push',
    token,
    payload: {
      speech: payload.speech,
      history: payload.history,
    },
  });
}
