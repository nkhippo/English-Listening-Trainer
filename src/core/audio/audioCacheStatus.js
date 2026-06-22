import { gasFetch } from '../../lib/gasFetch.js';
import { fetchAudio } from './driveCache.js';

const LAST_FETCH_KEY = 'elt_last_audio_fetch';
const VERIFY_LINES = [{ speaker: 'A', text: 'English Listening Trainer cache verification.' }];

export function recordAudioFetch({ source, cached, hash, shell, cefr }) {
  try {
    localStorage.setItem(LAST_FETCH_KEY, JSON.stringify({
      source,
      cached: !!cached,
      hash: hash || null,
      shell: shell || null,
      cefr: cefr || null,
      at: new Date().toISOString(),
    }));
  } catch {
    /* ignore */
  }
}

export function getLastAudioFetch() {
  try {
    const raw = localStorage.getItem(LAST_FETCH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function describeAudioSource(source) {
  const labels = {
    local: 'ブラウザキャッシュ',
    'gas-cache': 'Drive キャッシュ（HIT）',
    'gas-fresh': 'Drive 新規生成（MISS）',
    'legacy-tts': 'Legacy TTS',
  };
  return labels[source] || source || '—';
}

export async function verifyDriveAudioCache({ gasUrl, cefr = 'B1', shell = 'intensive' }) {
  if (!gasUrl) throw new Error('GAS endpoint URL not configured');

  const first = await fetchAudio({
    gasUrl,
    lines: VERIFY_LINES,
    cefr,
    shell,
    level: 3,
    instructions: 'Neutral pace for cache verification.',
  });

  const second = await fetchAudio({
    gasUrl,
    lines: VERIFY_LINES,
    cefr,
    shell,
    level: 3,
    instructions: 'Neutral pace for cache verification.',
  });

  recordAudioFetch({
    source: second.cached ? 'gas-cache' : 'gas-fresh',
    cached: second.cached,
    hash: second.hash || first.hash,
    shell,
    cefr,
  });

  return {
    pass: second.cached === true,
    firstCached: !!first.cached,
    secondCached: !!second.cached,
    hash: second.hash || first.hash || null,
    usedLegacyFallback: !first.hash && !second.hash,
  };
}

export async function fetchAudioManifestStats({ gasUrl }) {
  if (!gasUrl) throw new Error('GAS endpoint URL not configured');

  return gasFetch(gasUrl, { action: 'audio_stats' });
}

export async function runAudioManifestCleanup({ gasUrl, pruneStaleDays = 90 }) {
  if (!gasUrl) throw new Error('GAS endpoint URL not configured');

  return gasFetch(gasUrl, { action: 'audio_cleanup', pruneStaleDays, forceLru: true });
}
