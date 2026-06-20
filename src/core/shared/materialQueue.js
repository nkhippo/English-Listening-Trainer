const SHADOW_QUEUE_KEY = 'elt_shadow_queue';
const MAX_QUEUE = 50;

function normalizeShadowQueueEntry(entry) {
  const createdAt = entry.createdAt || entry.addedAt || new Date().toISOString();
  return {
    ...entry,
    createdAt,
    updatedAt: entry.updatedAt || entry.addedAt || createdAt,
    deletedAt: entry.deletedAt || (entry.removed ? (entry.updatedAt || createdAt) : null),
  };
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(SHADOW_QUEUE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeShadowQueueEntry);
  } catch {
    return [];
  }
}

function saveRaw(list) {
  const normalized = (list || []).map(normalizeShadowQueueEntry);
  const activeCount = normalized.filter((e) => !e.deletedAt && !e.removed).length;
  let trimmed = normalized;
  if (activeCount > MAX_QUEUE) {
    const active = normalized.filter((e) => !e.deletedAt && !e.removed).slice(0, MAX_QUEUE);
    const tombstones = normalized.filter((e) => e.deletedAt || e.removed);
    trimmed = [...active, ...tombstones];
  }
  localStorage.setItem(SHADOW_QUEUE_KEY, JSON.stringify(trimmed));
}

export function loadShadowQueueRaw() {
  return loadRaw();
}

export function replaceShadowQueueRaw(list) {
  saveRaw(list || []);
}

export function loadShadowQueue() {
  return loadRaw()
    .filter((e) => !e.deletedAt && !e.removed)
    .sort((a, b) => new Date(b.updatedAt || b.addedAt) - new Date(a.updatedAt || a.addedAt));
}

export function addToShadowQueue({ item, scene, level, cefr, source, score, sourceItemId, understood }) {
  const now = new Date().toISOString();
  const id = `s${Date.now().toString(36)}`;
  const entry = {
    id,
    item,
    scene,
    level,
    cefr: cefr || 'B1',
    source: source || 'manual',
    score: score ?? null,
    sourceItemId: sourceItemId || null,
    understood: !!understood,
    addedAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    stageProgress: { 1: false, 2: false, 3: false },
  };
  const list = loadRaw();
  list.unshift(entry);
  saveRaw(list);
  return entry;
}

export function updateShadowProgress(id, stage, completed) {
  const now = new Date().toISOString();
  const list = loadRaw();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return loadShadowQueue();
  list[idx] = {
    ...list[idx],
    stageProgress: { ...list[idx].stageProgress, [stage]: completed },
    updatedAt: now,
  };
  saveRaw(list);
  return loadShadowQueue();
}

export function removeFromShadowQueue(id) {
  const now = new Date().toISOString();
  const list = loadRaw();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return loadShadowQueue();
  list[idx] = {
    ...list[idx],
    removed: true,
    deletedAt: now,
    updatedAt: now,
  };
  saveRaw(list);
  return loadShadowQueue();
}

export function hasShadowQueueEntryForSource(sourceItemId) {
  if (!sourceItemId) return false;
  return loadRaw().some((e) => !e.deletedAt && !e.removed && e.sourceItemId === sourceItemId);
}

export function addUnderstoodShadowCandidate({
  item, itemId, scene, level, cefr, score,
}) {
  if (hasShadowQueueEntryForSource(itemId)) return null;
  return addToShadowQueue({
    item,
    scene,
    level,
    cefr,
    source: 'intensive',
    score,
    sourceItemId: itemId,
    understood: true,
  });
}
