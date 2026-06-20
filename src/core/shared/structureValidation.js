import { STRUCTURE_FLAG_KEYS } from './structureFlags.js';

export const STRUCTURE_MIN_COUNTS = {
  relative_clause: 2,
  participle: 2,
  conditional: 2,
  inversion: 1,
};

export const STRUCTURE_SENTENCE_COVERAGE = 0.8;

const NON_PARTICIPLE_ING = new Set([
  'thing', 'something', 'anything', 'everything', 'nothing', 'during', 'morning',
  'evening', 'according', 'building', 'ceiling', 'feeling', 'meeting', 'setting',
  'working', 'looking', 'going', 'coming', 'getting', 'making', 'taking', 'having',
  'being', 'doing', 'saying', 'thinking', 'waiting', 'standing', 'sitting',
]);

function extractSentences(item) {
  const lines = item?.lines?.map((line) => line?.text).filter(Boolean) || [];
  if (lines.length) return lines;
  if (item?.sentence) {
    return item.sentence.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function countPatternMatches(text, patterns) {
  if (!text) return { count: 0, samples: [] };
  const samples = [];
  for (const pattern of patterns) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(re)) {
      samples.push(match[0]);
    }
  }
  return { count: samples.length, samples };
}

function isLikelyParticipleIng(word) {
  const lower = word.toLowerCase();
  if (NON_PARTICIPLE_ING.has(lower)) return false;
  if (lower.endsWith('thing')) return false;
  return lower.length >= 4;
}

function detectRelativeClauses(text) {
  return countPatternMatches(text, [
    /\b(who|whom|whose|which)\s+[\w']+/i,
    /\b(that)\s+(?!\w+\s+(?:is|are|was|were)\b)[\w']+/i,
    /\b(where|when)\s+[\w']+/i,
    /\b(the|a|an)\s+[\w']+\s+(who|which|that|where|when)\s+/i,
  ]);
}

function detectParticiples(text) {
  const samples = [];

  for (const match of text.matchAll(/(?:^|[.!?]\s+)([A-Za-z]{3,}ing)\b/gi)) {
    if (isLikelyParticipleIng(match[1])) samples.push(match[1]);
  }
  for (const match of text.matchAll(/,\s*([A-Za-z]{3,}(?:ed|en))\b/gi)) {
    samples.push(match[1]);
  }
  for (const match of text.matchAll(/\bHaving\s+[\w']+/gi)) {
    samples.push(match[0]);
  }
  for (const match of text.matchAll(/\b(Born|Given|Left|Known|Seen|Taken|Written|Built)\s+[\w']+/gi)) {
    samples.push(match[0]);
  }

  return { count: samples.length, samples };
}

function detectConditionals(text) {
  return countPatternMatches(text, [
    /\bif\s+[\w']+/i,
    /\bunless\s+[\w']+/i,
    /\bwould\s+have\s+[\w']+/i,
    /\bwould\s+[\w']+/i,
    /\bcould\s+have\s+[\w']+/i,
    /\bmight\s+have\s+[\w']+/i,
    /\bhad\s+[\w']+\s+(?:been|known|seen|heard|left|gone|done|told|met|taken|had|arrived|called)/i,
    /\bwere\s+[\w']+\s+to\b/i,
    /\bIf\s+only\b/i,
  ]);
}

function detectInversions(text) {
  return countPatternMatches(text, [
    /\bNever\s+(?:have|had|will|would|did|do|does|is|are|was|were)\b/i,
    /\b(?:Rarely|Seldom|Hardly|Scarcely|Little)\s+(?:did|do|does|have|has|had|is|are|was|were)\b/i,
    /\bNot\s+only\b/i,
    /\bNo\s+sooner\b/i,
    /\bOnly\s+then\b/i,
    /\bUnder\s+no\s+circumstances\b/i,
    /\bHad\s+(?:I|we|they|he|she|it)\b/i,
    /\bWere\s+(?:I|we|they|he|she)\b/i,
    /\bShould\s+[\w']+\s+/i,
    /\b(?:Did|Do|Does)\s+(?:he|she|they|we|I|it)\s+/i,
  ]);
}

const DETECTORS = {
  relative_clause: detectRelativeClauses,
  participle: detectParticiples,
  conditional: detectConditionals,
  inversion: detectInversions,
};

export function countAllStructureOccurrences(item) {
  const sentences = extractSentences(item);
  const fullText = sentences.join(' ');
  const result = {};
  for (const key of STRUCTURE_FLAG_KEYS) {
    result[key] = DETECTORS[key](fullText).count;
  }
  return result;
}

export function auditStructureFlags(item, structureFlags = []) {
  const flags = (structureFlags || []).filter((key) => STRUCTURE_FLAG_KEYS.includes(key));
  if (!flags.length) {
    return {
      compliant: true,
      flags: {},
      sentenceCoverageRate: 1,
    };
  }

  const sentences = extractSentences(item);
  const fullText = sentences.join(' ');
  const results = {};
  let allCompliant = true;

  for (const key of flags) {
    const detector = DETECTORS[key];
    const minCount = STRUCTURE_MIN_COUNTS[key] ?? 1;
    const total = detector(fullText);
    const matchingSentences = sentences.filter((sentence) => detector(sentence).count > 0).length;
    const sentenceRate = sentences.length
      ? matchingSentences / sentences.length
      : (total.count > 0 ? 1 : 0);
    const countOk = total.count >= minCount;
    const coverageOk = sentenceRate >= STRUCTURE_SENTENCE_COVERAGE;
    const compliant = countOk && coverageOk;

    results[key] = {
      minCount,
      count: total.count,
      matchingSentences,
      totalSentences: sentences.length,
      sentenceRate,
      countOk,
      coverageOk,
      compliant,
      samples: total.samples.slice(0, 5),
    };
    if (!compliant) allCompliant = false;
  }

  const rates = Object.values(results).map((r) => r.sentenceRate);
  const sentenceCoverageRate = rates.length
    ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length
    : 1;

  return {
    compliant: allCompliant,
    flags: results,
    sentenceCoverageRate,
    validation: 'pattern',
  };
}

export function isStructureCompliant(item, structureFlags = []) {
  return auditStructureFlags(item, structureFlags).compliant;
}

export function enrichStructureMetadata(item, structureFlags = []) {
  const audit = auditStructureFlags(item, structureFlags);
  return {
    ...item,
    structure_metadata: audit,
  };
}

export function formatStructureFailures(audit) {
  return Object.entries(audit.flags || {})
    .filter(([, result]) => !result.compliant)
    .map(([key, result]) => ({
      flag: key,
      count: result.count,
      minCount: result.minCount,
      sentenceRate: result.sentenceRate,
    }));
}

export function logStructureValidationDebug({ structureFlags, item, context = 'generation' }) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') !== '1') return;

  const audit = item?.structure_metadata || auditStructureFlags(item, structureFlags);

  console.debug(`[extensive:${context}] structure validation`, {
    structureFlags,
    compliant: audit.compliant,
    sentenceCoverageRate: audit.sentenceCoverageRate,
    flags: audit.flags,
    occurrences: countAllStructureOccurrences(item),
  });

  return audit;
}
