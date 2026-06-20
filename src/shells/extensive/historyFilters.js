import { DEFAULT_CEFR } from '../../core/shared/cefr.js';

export function matchesHistoryFilters(entry, { cefr, level, structureFlags }) {
  if (cefr && (entry.cefr || DEFAULT_CEFR) !== cefr) return false;
  if (level != null && Number(entry.level) !== level) return false;
  if (structureFlags?.length > 0) {
    const entryFlags = entry.structureFlags || [];
    if (!structureFlags.some((f) => entryFlags.includes(f))) return false;
  }
  return true;
}

export function filterHistory(history, filters) {
  return history.filter((entry) => matchesHistoryFilters(entry, filters));
}

export function hasActiveHistoryFilters({ cefr, level, structureFlags }) {
  return Boolean(cefr || level != null || structureFlags?.length > 0);
}
