import cefrWords from '../../data/cefr/cefr_words.json';
import cefrChunks from '../../data/cefr/cefr_chunks.json';
import { buildCefrConstraint } from '../generation/cefrConstraints.js';

const CEFR_RANK = { A1: 1, A2: 2, B1: 3, B2: 4 };
const BAND_MAX_RANK = { A1A2: 2, B1: 3, B2: 4 };

function buildLemmaIndex(entries) {
  const index = new Map();
  for (const entry of entries) {
    const rank = CEFR_RANK[entry.cefr];
    if (!rank) continue;
    for (const form of [entry.text, entry.lemma].filter(Boolean)) {
      const key = form.toLowerCase();
      const existing = index.get(key);
      if (!existing || rank < existing.rank) {
        index.set(key, { cefr: entry.cefr, rank, text: entry.text });
      }
    }
  }
  return index;
}

const wordIndex = buildLemmaIndex(cefrWords.entries);
const chunkIndex = buildLemmaIndex(cefrChunks.entries);

function extractItemText(item) {
  const parts = [];
  if (item?.sentence) parts.push(item.sentence);
  for (const line of item?.lines || []) {
    if (line?.text) parts.push(line.text);
  }
  return parts.join('\n');
}

function normalizeToken(token) {
  return token.toLowerCase().replace(/^['"]+|['"]+$/g, '');
}

function tokenVariants(token) {
  const normalized = normalizeToken(token);
  const variants = new Set([normalized]);
  if (normalized.includes("'")) {
    variants.add(normalized.replace(/'/g, ''));
    variants.add(normalized.replace(/n't$/i, ''));
    variants.add(normalized.replace(/'(?:s|d|ll|ve|re|m|t)$/i, ''));
  }
  if (normalized.endsWith("'s")) variants.add(normalized.slice(0, -2));
  if (normalized.length > 3 && normalized.endsWith('s') && !normalized.endsWith("'s")) {
    variants.add(normalized.slice(0, -1));
  }
  if (normalized.length > 4 && normalized.endsWith('ed')) variants.add(normalized.slice(0, -2));
  if (normalized.length > 4 && normalized.endsWith('ing')) variants.add(normalized.slice(0, -3));
  return [...variants];
}

function lookupWordRank(token) {
  let best = null;
  for (const variant of tokenVariants(token)) {
    const hit = wordIndex.get(variant);
    if (hit && (!best || hit.rank < best.rank)) best = hit;
  }
  return best;
}

export function findWordsAboveLevel(text, band) {
  const maxRank = BAND_MAX_RANK[band] ?? BAND_MAX_RANK.B1;
  const tokens = text.match(/[a-zA-Z']+/g) || [];
  const above = new Set();

  for (const token of tokens) {
    const hit = lookupWordRank(token);
    if (hit && hit.rank > maxRank) above.add(hit.text);
  }

  return [...above].sort();
}

export function findUsedChunks(text, band) {
  const maxRank = BAND_MAX_RANK[band] ?? BAND_MAX_RANK.B1;
  const lower = text.toLowerCase();
  const used = [];

  for (const entry of cefrChunks.entries) {
    const rank = CEFR_RANK[entry.cefr];
    if (!rank || rank > maxRank) continue;
    const phrase = entry.text.toLowerCase();
    if (lower.includes(phrase)) used.push(entry.text);
  }

  return [...new Set(used)].sort();
}

export function auditCefrMetadata(item, band) {
  const text = extractItemText(item);
  return {
    used_words_above_level: findWordsAboveLevel(text, band),
    used_chunks: findUsedChunks(text, band),
  };
}

export function isCefrCompliant(item, band) {
  const constraint = buildCefrConstraint(band);
  const audit = auditCefrMetadata(item, band);
  return audit.used_words_above_level.length <= constraint.max_unknown_words;
}

export function enrichCefrMetadata(item, band) {
  const audit = auditCefrMetadata(item, band);
  return {
    ...item,
    cefr_metadata: {
      ...(item?.cefr_metadata || {}),
      ...audit,
      validation: 'dictionary',
    },
  };
}

export function getCatalogStats() {
  return {
    words: cefrWords.total_count ?? cefrWords.entries.length,
    chunks: cefrChunks.total_count ?? cefrChunks.entries.length,
  };
}
