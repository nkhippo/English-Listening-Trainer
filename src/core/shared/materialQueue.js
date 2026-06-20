const SHADOW_QUEUE_KEY = 'elt_shadow_queue';

function loadRaw() {
  try {
    const raw = localStorage.getItem(SHADOW_QUEUE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveRaw(list) {
  localStorage.setItem(SHADOW_QUEUE_KEY, JSON.stringify(list.slice(0, 50)));
}

export function loadShadowQueue() {
  return loadRaw().filter((e) => !e.removed);
}

export function addToShadowQueue({ item, scene, level, cefr, source, score }) {
  const id = `s${Date.now().toString(36)}`;
  const entry = {
    id,
    item,
    scene,
    level,
    cefr: cefr || 'B1',
    source: source || 'manual',
    score: score ?? null,
    addedAt: new Date().toISOString(),
    stageProgress: { 1: false, 2: false, 3: false },
  };
  const list = loadRaw();
  list.unshift(entry);
  saveRaw(list);
  return entry;
}

export function updateShadowProgress(id, stage, completed) {
  const list = loadRaw();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return loadShadowQueue();
  list[idx] = {
    ...list[idx],
    stageProgress: { ...list[idx].stageProgress, [stage]: completed },
  };
  saveRaw(list);
  return loadShadowQueue();
}

export function removeFromShadowQueue(id) {
  const list = loadRaw();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return loadShadowQueue();
  list[idx] = { ...list[idx], removed: true };
  saveRaw(list);
  return loadShadowQueue();
}
