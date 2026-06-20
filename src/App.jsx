import React, { useState, useEffect, useCallback } from 'react';
import { DEFAULT_GAS_URL } from './lib/config.js';
import { saveCachedAudio } from './lib/storage.js';
import { useAudioPlayer } from './hooks/useAudioPlayer.js';
import { useCloudSync } from './hooks/useCloudSync.js';
import AudioProgressBar from './components/AudioProgressBar.jsx';
import CustomSpeechTab from './components/CustomSpeechTab.jsx';
import IntensiveApp from './shells/intensive/IntensiveApp.jsx';
import ExtensiveApp from './shells/extensive/ExtensiveApp.jsx';
import ShadowingApp from './shells/shadowing/ShadowingApp.jsx';
import { UI } from './core/shared/uiJa.js';

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
  const gasUrl = DEFAULT_GAS_URL;

  const handleCloudSynced = useCallback(() => {
    setSpeechRefreshKey((k) => k + 1);
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
            onClick={() => setAppTab(key)}
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          className="app-tab"
          aria-pressed={appTab === 'speech'}
          onClick={() => setAppTab('speech')}
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
        />
      )}

      {appTab === 'intensive' && (
        <IntensiveApp
          anthropicKey={anthropicKey}
          settingsOpen={settingsOpen}
          gasUrl={gasUrl}
          cloudSync={cloudSync}
        />
      )}

      {appTab === 'extensive' && (
        <ExtensiveApp
          anthropicKey={anthropicKey}
          audioPlayer={audioPlayer}
          gasUrl={gasUrl}
          cloudSync={cloudSync}
        />
      )}

      {appTab === 'shadowing' && (
        <ShadowingApp
          anthropicKey={anthropicKey}
          audioPlayer={audioPlayer}
          gasUrl={gasUrl}
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

function SettingsPanel({ anthropicKey, isConfigured, onSave, onClear, cloudSync }) {
  const [draft, setDraft] = useState(anthropicKey);
  const { syncStatus, syncError } = cloudSync;

  useEffect(() => {
    setDraft(anthropicKey);
  }, [anthropicKey]);

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
