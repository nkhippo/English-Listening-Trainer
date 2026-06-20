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

function detectRelativeClauses(text) {
  return countPatternMatches(text, [
    /\b(who|whom|whose|which)\s+[\w']+/i,
    /\b(that)\s+(?!is\b|are\b|was\b|were\b|would\b|could\b|should\b|may\b|might\b|can\b|will\b|shall\b|has\b|have\b|had\b|be\b|been\b|being\b|am\b|it\b|this\b|that\b)[\w']+/i,
    /\b(where|when)\s+[\w']+/i,
  ]);
}

function detectParticiples(text) {
  const present = [...text.matchAll(/(?:^|[.;]\s+|,\s+)([A-Za-z]{4,}ing)\b/gi)]
    .map((m) => m[1].toLowerCase())
    .filter((word) => !NON_PARTICIPLE_ING.has(word) && !word.endsWith('thing'));
  const past = [...text.matchAll(/,\s*([A-Za-z]{4,}ed)\b/gi)].map((m) => m[1]);
  const perfect = [...text.matchAll(/\bHaving\s+[\w']+/gi)].map((m) => m[0]);
  const samples = [...present, ...past, ...perfect];
  return { count: samples.length, samples };
}

function detectConditionals(text) {
  return countPatternMatches(text, [
    /\bif\s+[\w']+/i,
    /\b(?:would|could|might)\s+(?:have\s+)?[\w']+/i,
    /\bhad\s+[\w']+\s+(?:been|known|seen|heard|left|gone|done|told|met|taken)/i,
    /\bwere\s+[\w']+\s+to\b/i,
    /\bunless\s+[\w']+/i,
  ]);
}

function detectInversions(text) {
  return countPatternMatches(text, [
    /\bNever\s+(?:have|had|will|would|did|do|does|is|are|was|were)\b/i,
    /\b(?:Rarely|Seldom|Hardly|Scarcely|Little)\s+(?:did|do|does|have|has|had|is|are|was|were)\b/i,
    /\bNot\s+only\b/i,
    /\bNo\s+sooner\b/i,
    /\bHad\s+I\b/i,
    /\bWere\s+I\b/i,
    /\bShould\s+[\w']+\s+/i,
  ]);
}

const DETECTORS = {
  relative_clause: detectRelativeClauses,
  participle: detectParticiples,
  conditional: detectConditionals,
  inversion: detectInversions,
};

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
