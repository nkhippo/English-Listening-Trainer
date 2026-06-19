import { useCallback, useEffect, useRef, useState } from 'react';
import { pullCloudSync, pushCloudSync, uploadCachedAudio, deleteCloudAudio } from '../lib/sync.js';

const PUSH_DEBOUNCE_MS = 2000;
const AUDIO_PUSH_DEBOUNCE_MS = 3000;

export function useCloudSync({ gasUrl, onSynced }) {
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncError, setSyncError] = useState('');
  const pushTimerRef = useRef(null);
  const audioTimerRef = useRef(null);
  const pendingAudioIdsRef = useRef(new Set());
  const pullingRef = useRef(false);

  const notifySynced = useCallback(() => {
    onSynced?.();
  }, [onSynced]);

  const runPull = useCallback(async () => {
    if (!gasUrl || pullingRef.current) return;
    pullingRef.current = true;
    setSyncStatus('syncing');
    setSyncError('');
    try {
      await pullCloudSync({ gasUrl });
      notifySynced();
      setSyncStatus('synced');
    } catch (err) {
      console.warn('Cloud sync pull failed:', err);
      setSyncError(String(err.message || err));
      setSyncStatus('error');
    } finally {
      pullingRef.current = false;
    }
  }, [gasUrl, notifySynced]);

  const runPush = useCallback(async () => {
    if (!gasUrl) return;
    setSyncStatus('syncing');
    setSyncError('');
    try {
      await pushCloudSync({ gasUrl });
      setSyncStatus('synced');
    } catch (err) {
      console.warn('Cloud sync push failed:', err);
      setSyncError(String(err.message || err));
      setSyncStatus('error');
    }
  }, [gasUrl]);

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
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      runPush();
    }, PUSH_DEBOUNCE_MS);
  }, [gasUrl, runPush]);

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
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
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
  };
}
