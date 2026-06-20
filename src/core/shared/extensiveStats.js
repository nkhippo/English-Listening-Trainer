const STATS_KEY = 'elt_extensive_stats';

function defaultStats() {
  return {
    totalMinutes: 0,
    structureCounts: {},
    chunkEncounters: {},
    passagesCompleted: 0,
  };
}

export function loadExtensiveStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? { ...defaultStats(), ...JSON.parse(raw) } : defaultStats();
  } catch {
    return defaultStats();
  }
}

export function saveExtensiveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
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
  saveExtensiveStats(stats);
  return stats;
}
