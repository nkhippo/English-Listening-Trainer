import { countAllStructureOccurrences } from './structureValidation.js';

const STATS_KEY = 'elt_extensive_stats';
const STATS_SCHEMA_VERSION = 2;
const MAX_PASSAGE_IDS_PER_CHUNK = 200;

function defaultChunkEntry() {
  return {
    count: 0,
    distinct_passages: 0,
    last_encountered_at: null,
    passageIds: [],
    cefrBands: {},
  };
}

function defaultStats() {
  return {
    schemaVersion: STATS_SCHEMA_VERSION,
    totalMinutes: 0,
    structureEncounters: {},
    chunkEncounters: {},
    passagesCompleted: 0,
    structureValidation: { checked: 0, compliant: 0 },
    updatedAt: null,
  };
}

function normalizeChunkEntry(raw) {
  if (!raw || typeof raw !== 'object') return defaultChunkEntry();
  if (typeof raw === 'number') {
    return {
      ...defaultChunkEntry(),
      count: raw,
      distinct_passages: raw,
    };
  }
  const passageIds = Array.isArray(raw.passageIds) ? raw.passageIds : [];
  return {
    count: Number(raw.count) || 0,
    distinct_passages: Number(raw.distinct_passages) || passageIds.length,
    last_encountered_at: raw.last_encountered_at || null,
    passageIds,
    cefrBands: { ...(raw.cefrBands || {}) },
  };
}

function mergeCefrBands(a = {}, b = {}) {
  const out = { ...a };
  for (const [band, data] of Object.entries(b)) {
    const ids = [...new Set([...(out[band]?.passageIds || []), ...(data.passageIds || [])])];
    out[band] = {
      count: (out[band]?.count || 0) + (Number(data.count) || 0),
      passageIds: ids,
    };
  }
  return out;
}

function mergeChunkEntry(a, b) {
  const na = normalizeChunkEntry(a);
  const nb = normalizeChunkEntry(b);
  const passageIds = [...new Set([...na.passageIds, ...nb.passageIds])].slice(0, MAX_PASSAGE_IDS_PER_CHUNK);
  const last = [na.last_encountered_at, nb.last_encountered_at].filter(Boolean).sort().pop() || null;
  return {
    count: na.count + nb.count,
    distinct_passages: passageIds.length,
    last_encountered_at: last,
    passageIds,
    cefrBands: mergeCefrBands(na.cefrBands, nb.cefrBands),
  };
}

function mergeStructureEncounters(a, b) {
  const out = { ...(a || {}) };
  for (const [key, value] of Object.entries(b || {})) {
    const prev = out[key]?.occurrences || 0;
    const add = Number(value?.occurrences ?? value) || 0;
    out[key] = { occurrences: prev + add };
  }
  return out;
}

function mergeChunkEncounters(a, b) {
  const out = {};
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) {
    out[key] = mergeChunkEntry(a?.[key], b?.[key]);
  }
  return out;
}

function addStats(a, b) {
  return {
    schemaVersion: STATS_SCHEMA_VERSION,
    totalMinutes: a.totalMinutes + b.totalMinutes,
    passagesCompleted: a.passagesCompleted + b.passagesCompleted,
    structureEncounters: mergeStructureEncounters(a.structureEncounters, b.structureEncounters),
    chunkEncounters: mergeChunkEncounters(a.chunkEncounters, b.chunkEncounters),
    structureValidation: {
      checked: (a.structureValidation?.checked || 0) + (b.structureValidation?.checked || 0),
      compliant: (a.structureValidation?.compliant || 0) + (b.structureValidation?.compliant || 0),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeExtensiveStats(raw) {
  const base = defaultStats();
  if (!raw || typeof raw !== 'object') return base;

  const migrated = raw.schemaVersion !== STATS_SCHEMA_VERSION;
  const chunkEncounters = migrated
    ? {}
    : Object.fromEntries(
      Object.entries(raw.chunkEncounters || {}).map(([k, v]) => [k, normalizeChunkEntry(v)]),
    );

  const structureEncounters = migrated
    ? {}
    : Object.fromEntries(
      Object.entries(raw.structureEncounters || {}).map(([key, val]) => [
        key,
        { occurrences: Number(val?.occurrences) || 0 },
      ]),
    );

  return {
    schemaVersion: STATS_SCHEMA_VERSION,
    totalMinutes: Number(raw.totalMinutes) || 0,
    passagesCompleted: Number(raw.passagesCompleted) || 0,
    structureEncounters,
    chunkEncounters,
    structureValidation: {
      checked: Number(raw.structureValidation?.checked) || 0,
      compliant: Number(raw.structureValidation?.compliant) || 0,
    },
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

function recordChunkEncounter(stats, chunk, passageId, cefr) {
  const entry = normalizeChunkEntry(stats.chunkEncounters[chunk]);
  entry.count += 1;
  if (passageId && !entry.passageIds.includes(passageId)) {
    entry.passageIds.push(passageId);
    if (entry.passageIds.length > MAX_PASSAGE_IDS_PER_CHUNK) {
      entry.passageIds = entry.passageIds.slice(-MAX_PASSAGE_IDS_PER_CHUNK);
    }
  }
  entry.distinct_passages = entry.passageIds.length;
  entry.last_encountered_at = new Date().toISOString();

  const band = cefr || 'B1';
  if (!entry.cefrBands[band]) {
    entry.cefrBands[band] = { count: 0, passageIds: [] };
  }
  entry.cefrBands[band].count += 1;
  if (passageId && !entry.cefrBands[band].passageIds.includes(passageId)) {
    entry.cefrBands[band].passageIds.push(passageId);
  }

  stats.chunkEncounters[chunk] = entry;
}

export function recordPassageComplete({ durationSec, structureFlags, item, passageId, cefr }) {
  const stats = loadExtensiveStats();
  stats.totalMinutes += (durationSec || 0) / 60;
  stats.passagesCompleted += 1;

  const occurrences = countAllStructureOccurrences(item);
  for (const [flag, count] of Object.entries(occurrences)) {
    if (!count) continue;
    const prev = stats.structureEncounters[flag]?.occurrences || 0;
    stats.structureEncounters[flag] = { occurrences: prev + count };
  }

  for (const chunk of item?.cefr_metadata?.used_chunks || []) {
    recordChunkEncounter(stats, chunk, passageId, cefr);
  }

  if (structureFlags?.length && item?.structure_metadata) {
    stats.structureValidation.checked += 1;
    if (item.structure_metadata.compliant) {
      stats.structureValidation.compliant += 1;
    }
  }

  stats.updatedAt = new Date().toISOString();
  saveExtensiveStats(stats);

  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1') {
    const { checked, compliant } = stats.structureValidation;
    const rate = checked ? Math.round((compliant / checked) * 100) : 0;
    console.debug('[extensive:stats] structure validation cumulative', { checked, compliant, rate: `${rate}%` });
  }

  return stats;
}

export function getChunkEncounterRows(stats, { cefr, limit = 10, recentHours = 24 } = {}) {
  const now = Date.now();
  const recentCutoff = now - recentHours * 60 * 60 * 1000;

  const rows = Object.entries(stats.chunkEncounters || {}).map(([chunk, raw]) => {
    const entry = normalizeChunkEntry(raw);
    const bandData = cefr ? entry.cefrBands[cefr] : null;
    const count = cefr ? (bandData?.count || 0) : entry.count;
    const distinct = cefr ? (bandData?.passageIds?.length || 0) : entry.distinct_passages;
    const lastTs = entry.last_encountered_at ? new Date(entry.last_encountered_at).getTime() : 0;
    return {
      chunk,
      count,
      distinct_passages: distinct,
      last_encountered_at: entry.last_encountered_at,
      isRecent: lastTs >= recentCutoff,
    };
  }).filter((row) => row.count > 0);

  const top = [...rows].sort((a, b) => b.count - a.count).slice(0, limit);
  const recent = rows.filter((r) => r.isRecent).sort(
    (a, b) => new Date(b.last_encountered_at) - new Date(a.last_encountered_at),
  ).slice(0, limit);

  return { top, recent, all: rows.sort((a, b) => b.count - a.count) };
}

export function isExtensiveDebugMode() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debug') === '1';
}
