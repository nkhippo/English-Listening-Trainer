import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pullCloudMetadataSync,
  syncCloudAudio,
  pushCloudSync,
  uploadCachedAudio,
  deleteCloudAudio,
} from '../lib/sync.js';

const SYNC_DEBOUNCE_MS = 2000;
const AUDIO_PUSH_DEBOUNCE_MS = 3000;

export function useCloudSync({ gasUrl, onSynced }) {
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncError, setSyncError] = useState('');
  const syncTimerRef = useRef(null);
  const audioTimerRef = useRef(null);
  const pendingAudioIdsRef = useRef(new Set());
  const metadataSyncingRef = useRef(false);

  const notifySynced = useCallback(() => {
    onSynced?.();
  }, [onSynced]);

  const runAudioSync = useCallback(async (meta) => {
    if (!gasUrl || !meta) return;
    try {
      await syncCloudAudio({ gasUrl, audioIds: meta.audioIds, applied: meta.applied });
    } catch (err) {
      console.warn('Cloud audio sync failed:', err);
    }
  }, [gasUrl]);

  const runPull = useCallback(async () => {
    if (!gasUrl || metadataSyncingRef.current) return;
    metadataSyncingRef.current = true;
    setSyncStatus('syncing');
    setSyncError('');
    try {
      const meta = await pullCloudMetadataSync({ gasUrl });
      notifySynced();
      setSyncStatus('synced');
      runAudioSync(meta);
    } catch (err) {
      console.warn('Cloud sync pull failed:', err);
      setSyncError(String(err.message || err));
      setSyncStatus('error');
    } finally {
      metadataSyncingRef.current = false;
    }
  }, [gasUrl, notifySynced, runAudioSync]);

  const flushPendingAudio = useCallback(async () => {
    if (!gasUrl || pendingAudioIdsRef.current.size === 0) return;
    const ids = [...pendingAudioIdsRef.current];
    pendingAudioIdsRef.current.clear();
    for (const id of ids) {
      try {
        await uploadCachedAudio({ gasUrl, itemId: id });
      } catch (err) {
        console.warn(`Cloud audio upload failed for ${id}:`, err);
        pendingAudioIdsRef.current.add(id);
      }
    }
  }, [gasUrl]);

  const schedulePush = useCallback(() => {
    if (!gasUrl) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      runPull();
    }, SYNC_DEBOUNCE_MS);
  }, [gasUrl, runPull]);

  const scheduleAudioPush = useCallback((itemId) => {
    if (!gasUrl || !itemId) return;
    pendingAudioIdsRef.current.add(itemId);
    if (audioTimerRef.current) clearTimeout(audioTimerRef.current);
    audioTimerRef.current = setTimeout(async () => {
      audioTimerRef.current = null;
      await flushPendingAudio();
    }, AUDIO_PUSH_DEBOUNCE_MS);
  }, [gasUrl, flushPendingAudio]);

  const scheduleAudioDelete = useCallback(async (itemId) => {
    if (!gasUrl || !itemId) return;
    pendingAudioIdsRef.current.delete(itemId);
    try {
      await deleteCloudAudio({ gasUrl, itemId });
    } catch (err) {
      console.warn(`Cloud audio delete failed for ${itemId}:`, err);
    }
  }, [gasUrl]);

  const cacheAudio = useCallback((itemId, base64, saveLocally) => {
    const ok = saveLocally(itemId, base64);
    if (ok) scheduleAudioPush(itemId);
    return ok;
  }, [scheduleAudioPush]);

  useEffect(() => {
    if (!gasUrl) {
      setSyncStatus('disabled');
      return undefined;
    }
    runPull();
    function onVisible() {
      if (document.visibilityState === 'visible') runPull();
    }
    function onPageShow() {
      runPull();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      if (audioTimerRef.current) clearTimeout(audioTimerRef.current);
    };
  }, [gasUrl, runPull]);

  return {
    syncStatus,
    syncError,
    schedulePush,
    scheduleAudioPush,
    scheduleAudioDelete,
    cacheAudio,
    syncNow: runPull,
  };
}
