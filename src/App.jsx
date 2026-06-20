import React, { useState, useEffect, useCallback } from 'react';
import { DEFAULT_GAS_URL, DEFAULT_WARMUP_GAS_URL, WARMUP_BATCH_SIZE, WARMUP_SENTENCES_PER_CELL } from './lib/config.js';
import { saveCachedAudio } from './lib/storage.js';
import { useAudioPlayer } from './hooks/useAudioPlayer.js';
import { useCloudSync } from './hooks/useCloudSync.js';
import AudioProgressBar from './components/AudioProgressBar.jsx';
import CustomSpeechTab from './components/CustomSpeechTab.jsx';
import IntensiveApp from './shells/intensive/IntensiveApp.jsx';
import ExtensiveApp from './shells/extensive/ExtensiveApp.jsx';
import ShadowingApp from './shells/shadowing/ShadowingApp.jsx';
import { UI } from './core/shared/uiJa.js';
import {
  getLastAudioFetch,
  describeAudioSource,
  verifyDriveAudioCache,
  fetchAudioManifestStats,
  runAudioManifestCleanup,
} from './core/audio/audioCacheStatus.js';
import {
  getWarmupStatus,
  runWarmupBatch,
  resetWarmupProgress,
  formatWarmupProgress,
} from './core/audio/warmupClient.js';

const LS_KEYS = {
  appTab: 'elt_app_tab',
  shell: 'elt_active_shell',
  anthropic: 'elt_anthropic_key',
};

const SHELLS = {
  intensive: { label: 'Intensive', sub: 'Layer 3 focus' },
  extensive: { label: 'Extensive', sub: 'Input flooding' },
  shadowing: { label: 'Shadowing', sub: 'Production' },
};

export default function App() {
  const audioPlayer = useAudioPlayer();
  const [appTab, setAppTab] = useState(() => {
    const stored = localStorage.getItem(LS_KEYS.appTab);
    if (stored === 'trainer') return 'intensive';
    return stored || 'intensive';
  });
  const [settingsOpen, setSettingsOpen] = useState(() => !localStorage.getItem(LS_KEYS.anthropic));
  const [anthropicKey, setAnthropicKey] = useState(localStorage.getItem(LS_KEYS.anthropic) || '');
  const [speechRefreshKey, setSpeechRefreshKey] = useState(0);
  const [syncRefreshKey, setSyncRefreshKey] = useState(0);
  const [shellHomeNonce, setShellHomeNonce] = useState(0);
  const gasUrl = DEFAULT_GAS_URL;
  const warmupGasUrl = DEFAULT_WARMUP_GAS_URL;

  const handleCloudSynced = useCallback(() => {
    setSpeechRefreshKey((k) => k + 1);
    setSyncRefreshKey((k) => k + 1);
  }, []);

  const cloudSync = useCloudSync({ gasUrl, onSynced: handleCloudSynced });
  const { cacheAudio } = cloudSync;

  const cacheAudioLocallyAndCloud = useCallback(
    (itemId, base64) => cacheAudio(itemId, base64, saveCachedAudio),
    [cacheAudio],
  );

  useEffect(() => { localStorage.setItem(LS_KEYS.appTab, appTab); }, [appTab]);
  useEffect(() => {
    if (anthropicKey) localStorage.setItem(LS_KEYS.anthropic, anthropicKey);
  }, [anthropicKey]);

  useEffect(() => {
    document.body.classList.toggle('audio-progress-visible', audioPlayer.visible);
    return () => document.body.classList.remove('audio-progress-visible');
  }, [audioPlayer.visible]);

  function saveAnthropicKey(key) {
    const trimmed = key.trim();
    setAnthropicKey(trimmed);
    if (trimmed) {
      localStorage.setItem(LS_KEYS.anthropic, trimmed);
      setSettingsOpen(false);
    }
  }

  function clearAnthropicKey() {
    setAnthropicKey('');
    localStorage.removeItem(LS_KEYS.anthropic);
    setSettingsOpen(true);
  }

  const isConfigured = !!anthropicKey;
  const activeShell = SHELLS[appTab] || SHELLS.intensive;

  function handleTabClick(key) {
    if (appTab === key) {
      setShellHomeNonce((n) => n + 1);
      return;
    }
    setAppTab(key);
  }

  return (
    <div className="shell">
      <header className="header">
        <div>
          <div className="brand">English Listening Trainer</div>
          <div className="brand-sub">{appTab === 'speech' ? 'Custom speech' : activeShell.sub}</div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm settings-toggle"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
        >
          {settingsOpen ? UI.settings.close : UI.settings.open}
        </button>
      </header>

      <nav className="app-tabs" aria-label="App mode">
        {Object.entries(SHELLS).map(([key, s]) => (
          <button
            key={key}
            type="button"
            className="app-tab"
            aria-pressed={appTab === key}
            onClick={() => handleTabClick(key)}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          className="app-tab"
          aria-pressed={appTab === 'speech'}
          onClick={() => handleTabClick('speech')}
        >
          Speech
        </button>
      </nav>

      {settingsOpen && (
        <SettingsPanel
          anthropicKey={anthropicKey}
          isConfigured={isConfigured}
          onSave={saveAnthropicKey}
          onClear={clearAnthropicKey}
          cloudSync={cloudSync}
          gasUrl={gasUrl}
          warmupGasUrl={warmupGasUrl}
        />
      )}

      {appTab === 'speech' && (
        <CustomSpeechTab
          audioPlayer={audioPlayer}
          gasUrl={gasUrl}
          anthropicKey={anthropicKey}
          scheduleCloudSync={cloudSync.schedulePush}
          cacheAudioLocallyAndCloud={cacheAudioLocallyAndCloud}
          scheduleAudioDelete={cloudSync.scheduleAudioDelete}
          refreshKey={speechRefreshKey}
          syncStatus={cloudSync.syncStatus}
          homeNonce={shellHomeNonce}
        />
      )}

      {appTab === 'intensive' && (
        <IntensiveApp
          anthropicKey={anthropicKey}
          settingsOpen={settingsOpen}
          gasUrl={gasUrl}
          cloudSync={cloudSync}
          syncRefreshKey={syncRefreshKey}
          homeNonce={shellHomeNonce}
        />
      )}

      {appTab === 'extensive' && (
        <ExtensiveApp
          anthropicKey={anthropicKey}
          audioPlayer={audioPlayer}
          gasUrl={gasUrl}
          cloudSync={cloudSync}
          syncRefreshKey={syncRefreshKey}
          homeNonce={shellHomeNonce}
        />
      )}

      {appTab === 'shadowing' && (
        <ShadowingApp
          anthropicKey={anthropicKey}
          audioPlayer={audioPlayer}
          gasUrl={gasUrl}
          cloudSync={cloudSync}
          syncRefreshKey={syncRefreshKey}
          homeNonce={shellHomeNonce}
        />
      )}

      <AudioProgressBar
        visible={audioPlayer.visible}
        progress={audioPlayer.progress}
        endlessRepeat={audioPlayer.endlessRepeat}
        playbackRate={audioPlayer.playbackRate}
        holding={audioPlayer.holding}
        onToggleEndlessRepeat={audioPlayer.toggleEndlessRepeat}
        onTogglePlaybackRate={audioPlayer.togglePlaybackRate}
        onClose={audioPlayer.closeBar}
        onSeekStart={audioPlayer.beginScrub}
        onSeekMove={audioPlayer.moveScrub}
        onSeekEnd={audioPlayer.endScrub}
      />
    </div>
  );
}

function SettingsPanel({ anthropicKey, isConfigured, onSave, onClear, cloudSync, gasUrl, warmupGasUrl }) {
  const [draft, setDraft] = useState(anthropicKey);
  const [audioVerifyMsg, setAudioVerifyMsg] = useState('');
  const [audioVerifyBusy, setAudioVerifyBusy] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [manifestStats, setManifestStats] = useState(null);
  const [warmupBusy, setWarmupBusy] = useState(false);
  const [warmupStatus, setWarmupStatus] = useState(null);
  const [sentencesPerCell, setSentencesPerCell] = useState(WARMUP_SENTENCES_PER_CELL);
  const { syncStatus, syncError } = cloudSync;
  const lastAudio = getLastAudioFetch();

  async function refreshManifestStats() {
    if (!gasUrl) return;
    try {
      setManifestStats(await fetchAudioManifestStats({ gasUrl }));
    } catch {
      setManifestStats(null);
    }
  }

  useEffect(() => {
    setDraft(anthropicKey);
  }, [anthropicKey]);

  useEffect(() => {
    refreshManifestStats();
  }, [gasUrl, audioVerifyMsg]);

  useEffect(() => {
    if (!warmupGasUrl) return;
    getWarmupStatus({ warmupGasUrl, sentencesPerCell })
      .then(setWarmupStatus)
      .catch(() => setWarmupStatus(null));
  }, [warmupGasUrl, sentencesPerCell]);

  async function runAudioCacheVerify() {
    setAudioVerifyBusy(true);
    setAudioVerifyMsg('');
    try {
      const result = await verifyDriveAudioCache({ gasUrl });
      setAudioVerifyMsg(result.pass ? UI.settings.audioCachePass : UI.settings.audioCacheFail);
    } catch (err) {
      setAudioVerifyMsg(String(err.message || err));
    } finally {
      setAudioVerifyBusy(false);
    }
  }

  async function runManifestCleanup() {
    setCleanupBusy(true);
    setAudioVerifyMsg('');
    try {
      const result = await runAudioManifestCleanup({ gasUrl });
      setAudioVerifyMsg(
        `${UI.settings.audioCacheCleanupDone}: ${result.removed ?? 0} (${result.before ?? '—'} → ${result.after ?? '—'})`,
      );
      await refreshManifestStats();
    } catch (err) {
      setAudioVerifyMsg(String(err.message || err));
    } finally {
      setCleanupBusy(false);
    }
  }

  async function runWarmupStep() {
    setWarmupBusy(true);
    setAudioVerifyMsg('');
    try {
      const result = await runWarmupBatch({
        warmupGasUrl,
        mainGasUrl: gasUrl,
        batchSize: WARMUP_BATCH_SIZE,
        sentencesPerCell,
      });
      setWarmupStatus(result);
      await refreshManifestStats();
      if (result.done) {
        setAudioVerifyMsg(UI.settings.warmupDone);
      }
    } catch (err) {
      setAudioVerifyMsg(String(err.message || err));
    } finally {
      setWarmupBusy(false);
    }
  }

  async function runWarmupAll() {
    setWarmupBusy(true);
    setAudioVerifyMsg('');
    try {
      let status = await getWarmupStatus({ warmupGasUrl, sentencesPerCell });
      let guard = 0;
      while (!status.done && guard < 2000) {
        status = await runWarmupBatch({
          warmupGasUrl,
          mainGasUrl: gasUrl,
          batchSize: WARMUP_BATCH_SIZE,
          sentencesPerCell,
        });
        setWarmupStatus(status);
        guard += 1;
      }
      await refreshManifestStats();
      setAudioVerifyMsg(status.done ? UI.settings.warmupDone : UI.settings.warmupPartial);
    } catch (err) {
      setAudioVerifyMsg(String(err.message || err));
    } finally {
      setWarmupBusy(false);
    }
  }

  async function handleWarmupReset() {
    setWarmupBusy(true);
    try {
      await resetWarmupProgress({ warmupGasUrl });
      setWarmupStatus(await getWarmupStatus({ warmupGasUrl, sentencesPerCell }));
      setAudioVerifyMsg(UI.settings.warmupResetDone);
    } catch (err) {
      setAudioVerifyMsg(String(err.message || err));
    } finally {
      setWarmupBusy(false);
    }
  }

  const syncStatusLabel = UI.settings.statusLabels[syncStatus] || syncStatus;

  return (
    <section className="settings-panel">
      <h2 className="settings-heading">Settings</h2>

      <div className="settings-block">
        <h3 className="settings-subheading">{UI.settings.cloudSyncSub}</h3>
        <p className="field-hint">{UI.settings.cloudSyncHint}</p>
        <p className="field-hint sync-status-line">
          {UI.settings.status}: {syncStatusLabel}
          {syncError ? ` — ${syncError}` : ''}
        </p>
      </div>

      <div className="settings-block">
        <h3 className="settings-subheading">{UI.settings.audioCacheSub}</h3>
        <p className="field-hint">{UI.settings.audioCacheHint}</p>
        {lastAudio && (
          <p className="field-hint sync-status-line">
            {UI.settings.audioCacheLast}: {describeAudioSource(lastAudio.source)}
            {lastAudio.cached ? ' ✓' : ''}
            {lastAudio.hash ? ` · ${lastAudio.hash.slice(0, 8)}…` : ''}
          </p>
        )}
        {manifestStats && (
          <p className="field-hint">
            {UI.settings.audioCacheManifest}: {manifestStats.entryCount ?? '—'}
            {' · '}
            {UI.settings.audioCacheAccess}: {manifestStats.totalAccessCount ?? '—'}
          </p>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={runAudioCacheVerify}
          disabled={audioVerifyBusy || cleanupBusy || !gasUrl}
        >
          {audioVerifyBusy ? UI.settings.audioCacheVerifying : UI.settings.audioCacheVerify}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={runManifestCleanup}
          disabled={audioVerifyBusy || cleanupBusy || !gasUrl}
          style={{ marginLeft: 8 }}
        >
          {cleanupBusy ? UI.settings.audioCacheCleaning : UI.settings.audioCacheCleanup}
        </button>
        {audioVerifyMsg && <p className="field-hint sync-status-line">{audioVerifyMsg}</p>}
      </div>

      <div className="settings-block">
        <h3 className="settings-subheading">{UI.settings.warmupSub}</h3>
        <p className="field-hint">{UI.settings.warmupHint}</p>
        {warmupStatus && (
          <p className="field-hint sync-status-line">
            {UI.settings.warmupProgress}: {formatWarmupProgress(warmupStatus)}
            {warmupStatus.stats ? ` · cached ${warmupStatus.stats.cached} / fresh ${warmupStatus.stats.fresh}` : ''}
          </p>
        )}
        <div className="field">
          <label>{UI.settings.warmupSentencesPerCell}</label>
          <div className="choices">
            {[5, 10, 50].map((n) => (
              <button
                key={n}
                type="button"
                className="choice"
                aria-pressed={sentencesPerCell === n}
                onClick={() => setSentencesPerCell(n)}
                disabled={warmupBusy}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={runWarmupStep}
          disabled={warmupBusy || !warmupGasUrl}
        >
          {warmupBusy ? UI.settings.warmupRunning : UI.settings.warmupRunBatch}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={runWarmupAll}
          disabled={warmupBusy || !warmupGasUrl}
          style={{ marginLeft: 8 }}
        >
          {UI.settings.warmupRunAll}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={handleWarmupReset}
          disabled={warmupBusy || !warmupGasUrl}
          style={{ marginLeft: 8 }}
        >
          {UI.settings.warmupReset}
        </button>
      </div>

      <div className="settings-block">
        <h3 className="settings-subheading">{UI.settings.anthropicSub}</h3>
        <p className="field-hint">{UI.settings.anthropicHint}</p>
        <div className="field">
          <label>{UI.settings.apiKeyLabel}</label>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="sk-ant-..."
            autoComplete="off"
          />
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => onSave(draft)} disabled={!draft.trim()}>
            {UI.common.save}
          </button>
          {isConfigured && (
            <button type="button" className="btn btn-ghost" onClick={onClear}>
              {UI.settings.clearKey}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
