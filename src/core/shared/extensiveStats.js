const STATS_KEY = 'elt_extensive_stats';

function defaultStats() {
  return {
    totalMinutes: 0,
    structureCounts: {},
    chunkEncounters: {},
    passagesCompleted: 0,
    updatedAt: null,
  };
}

function mergeCountMaps(a, b) {
  const out = { ...(a || {}) };
  for (const [key, value] of Object.entries(b || {})) {
    out[key] = (out[key] || 0) + (Number(value) || 0);
  }
  return out;
}

function addStats(a, b) {
  return {
    totalMinutes: a.totalMinutes + b.totalMinutes,
    passagesCompleted: a.passagesCompleted + b.passagesCompleted,
    structureCounts: mergeCountMaps(a.structureCounts, b.structureCounts),
    chunkEncounters: mergeCountMaps(a.chunkEncounters, b.chunkEncounters),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeExtensiveStats(raw) {
  const base = defaultStats();
  if (!raw || typeof raw !== 'object') return base;
  return {
    totalMinutes: Number(raw.totalMinutes) || 0,
    passagesCompleted: Number(raw.passagesCompleted) || 0,
    structureCounts: { ...(raw.structureCounts || {}) },
    chunkEncounters: { ...(raw.chunkEncounters || {}) },
    updatedAt: raw.updatedAt || null,
  };
}

export function statsTimestamp(stats) {
  if (!stats?.updatedAt) return 0;
  const ts = new Date(stats.updatedAt).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function mergeExtensiveStats(local, remote) {
  const l = normalizeExtensiveStats(local);
  const r = normalizeExtensiveStats(remote);
  if (!r.updatedAt) return l;
  if (!l.updatedAt) return r;

  const lts = statsTimestamp(l);
  const rts = statsTimestamp(r);
  if (rts > lts) return r;
  if (lts > rts) return l;
  return addStats(l, r);
}

export function loadExtensiveStatsRaw() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? normalizeExtensiveStats(JSON.parse(raw)) : defaultStats();
  } catch {
    return defaultStats();
  }
}

export function replaceExtensiveStatsRaw(stats) {
  saveExtensiveStats(stats);
}

export function loadExtensiveStats() {
  return loadExtensiveStatsRaw();
}

export function saveExtensiveStats(stats) {
  const normalized = normalizeExtensiveStats(stats);
  normalized.updatedAt = normalized.updatedAt || new Date().toISOString();
  localStorage.setItem(STATS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function recordPassageComplete({ durationSec, structureFlags, item }) {
  const stats = loadExtensiveStats();
  stats.totalMinutes += (durationSec || 0) / 60;
  stats.passagesCompleted += 1;
  for (const flag of structureFlags || []) {
    stats.structureCounts[flag] = (stats.structureCounts[flag] || 0) + 1;
  }
  for (const chunk of item?.cefr_metadata?.used_chunks || []) {
    stats.chunkEncounters[chunk] = (stats.chunkEncounters[chunk] || 0) + 1;
  }
  stats.updatedAt = new Date().toISOString();
  saveExtensiveStats(stats);
  return stats;
}
