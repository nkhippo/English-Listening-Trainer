/** Client-side helpers for audio manifest metadata (server of record is GAS). */

export function formatManifestEntry(entry) {
  if (!entry) return null;
  return {
    hash: entry.hash,
    preview: entry.text_preview,
    cefr: entry.cefr,
    shell: entry.shell,
    cached: true,
    accessCount: entry.access_count,
    lastAccessed: entry.last_accessed_at,
  };
}

export function trackLocalAudioAccess(cacheKey) {
  if (!cacheKey) return;
  try {
    const raw = localStorage.getItem('elt_audio_manifest_local');
    const map = raw ? JSON.parse(raw) : {};
    map[cacheKey] = {
      last_accessed_at: new Date().toISOString(),
      access_count: (map[cacheKey]?.access_count || 0) + 1,
    };
    localStorage.setItem('elt_audio_manifest_local', JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
