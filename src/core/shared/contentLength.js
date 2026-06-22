export const CONTENT_LENGTH_SPECS = {
  short_passage: {
    label: 'short passage',
    format: 'passage',
    minLines: 3,
    maxLines: 6,
    sentenceRange: '3–6',
  },
  long_passage: {
    label: 'long passage',
    format: 'passage',
    minLines: 5,
    maxLines: 8,
    sentenceRange: '5–8',
  },
  dialogue: {
    label: 'dialogue',
    format: 'dialogue',
    minLines: 4,
    maxLines: 8,
    turnRange: '4–8',
  },
};

function lineSpeakers(lines = []) {
  return new Set(
    lines
      .map((line) => String(line?.speaker || '').trim().toUpperCase())
      .filter(Boolean),
  );
}

export function isDialogueContent(item, lines = item?.lines) {
  const length = item?.content_length;
  if (length === 'dialogue') return true;
  if (length === 'short_passage' || length === 'long_passage') return false;
  const speakers = lineSpeakers(lines);
  return speakers.has('A') && speakers.has('B');
}

export function auditContentLength(item, length) {
  const spec = CONTENT_LENGTH_SPECS[length];
  if (!spec) {
    return { compliant: true, length, format: null, lineCount: item?.lines?.length ?? 0 };
  }

  const lines = Array.isArray(item?.lines) ? item.lines.filter((line) => line?.text?.trim()) : [];
  const lineCount = lines.length;
  const speakers = lineSpeakers(lines);
  const hasSpeakerB = speakers.has('B');
  const hasSpeakerA = speakers.has('A');
  const countOk = lineCount >= spec.minLines && lineCount <= spec.maxLines;

  if (spec.format === 'passage') {
    const singleSpeaker = !hasSpeakerB && lineCount > 0;
    return {
      compliant: countOk && singleSpeaker,
      length,
      format: spec.format,
      lineCount,
      minLines: spec.minLines,
      maxLines: spec.maxLines,
      hasSpeakerB,
      singleSpeaker,
      countOk,
    };
  }

  const multiSpeaker = hasSpeakerA && hasSpeakerB;
  return {
    compliant: countOk && multiSpeaker,
    length,
    format: spec.format,
    lineCount,
    minLines: spec.minLines,
    maxLines: spec.maxLines,
    hasSpeakerA,
    hasSpeakerB,
    multiSpeaker,
    countOk,
  };
}

export function isContentLengthCompliant(item, length) {
  return auditContentLength(item, length).compliant;
}

export function formatContentLengthFailures(audit) {
  if (!audit?.length || audit.compliant) return [];
  if (audit.format === 'passage') {
    const issues = [];
    if (!audit.countOk) {
      issues.push(`expected ${audit.minLines}–${audit.maxLines} sentences, got ${audit.lineCount}`);
    }
    if (audit.hasSpeakerB) {
      issues.push('passage must use speaker A only (no dialogue between A and B)');
    }
    return issues;
  }
  const issues = [];
  if (!audit.countOk) {
    issues.push(`expected ${audit.minLines}–${audit.maxLines} turns, got ${audit.lineCount}`);
  }
  if (!audit.multiSpeaker) {
    issues.push('dialogue must alternate speakers A and B');
  }
  return issues;
}

export function applyContentLengthMetadata(item, length) {
  if (!item || !CONTENT_LENGTH_SPECS[length]) return item;
  const spec = CONTENT_LENGTH_SPECS[length];
  let lines = Array.isArray(item.lines) ? item.lines : [];

  if (spec.format === 'passage') {
    lines = lines.map((line) => ({ ...line, speaker: 'A' }));
  }

  return {
    ...item,
    content_length: length,
    lines,
  };
}
