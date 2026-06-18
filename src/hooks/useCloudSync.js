import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSyncToken,
  generateSyncToken,
  clearSyncToken,
  readSyncTokenFromClipboard,
  copySyncTokenToClipboard,
} from '../lib/syncToken.js';
import { pullCloudSync, pushCloudSync } from '../lib/sync.js';

const PUSH_DEBOUNCE_MS = 2000;

export function useCloudSync({ gasUrl, onSynced }) {
  const [syncToken, setSyncTokenState] = useState(() => getSyncToken());
  const [syncStatus, setSyncStatus] = useState(() => (getSyncToken() ? 'idle' : 'disabled'));
  const [syncError, setSyncError] = useState('');
  const pushTimerRef = useRef(null);
  const pullingRef = useRef(false);

  const notifySynced = useCallback(() => {
    onSynced?.();
  }, [onSynced]);

  const runPull = useCallback(async () => {
    const token = getSyncToken();
    if (!token || !gasUrl || pullingRef.current) return;
    pullingRef.current = true;
    setSyncStatus('syncing');
    setSyncError('');
    try {
      await pullCloudSync({ gasUrl, token });
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
    const token = getSyncToken();
    if (!token || !gasUrl) return;
    setSyncStatus('syncing');
    setSyncError('');
    try {
      await pushCloudSync({ gasUrl, token });
      setSyncStatus('synced');
    } catch (err) {
      console.warn('Cloud sync push failed:', err);
      setSyncError(String(err.message || err));
      setSyncStatus('error');
    }
  }, [gasUrl]);

  const schedulePush = useCallback(() => {
    const token = getSyncToken();
    if (!token || !gasUrl) return;
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      runPush();
    }, PUSH_DEBOUNCE_MS);
  }, [gasUrl, runPush]);

  const handleGenerateToken = useCallback(async () => {
    const token = generateSyncToken();
    setSyncTokenState(token);
    setSyncError('');
    await runPull();
  }, [runPull]);

  const handleLinkFromClipboard = useCallback(async () => {
    try {
      const token = await readSyncTokenFromClipboard();
      setSyncTokenState(token);
      setSyncError('');
      await runPull();
    } catch (err) {
      setSyncError(String(err.message || err));
      setSyncStatus('error');
    }
  }, [runPull]);

  const handleCopyToken = useCallback(async () => {
    const token = getSyncToken();
    if (!token) return;
    try {
      await copySyncTokenToClipboard(token);
    } catch (err) {
      setSyncError(String(err.message || err));
    }
  }, []);

  const handleClearToken = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    clearSyncToken();
    setSyncTokenState('');
    setSyncStatus('disabled');
    setSyncError('');
  }, []);

  useEffect(() => {
    if (!syncToken) {
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
    };
  }, [syncToken, runPull]);

  return {
    syncToken,
    syncStatus,
    syncError,
    schedulePush,
    handleGenerateToken,
    handleLinkFromClipboard,
    handleCopyToken,
    handleClearToken,
  };
}
