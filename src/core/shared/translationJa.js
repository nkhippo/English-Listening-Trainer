/** Split flat dialogue translations like "A: … B: …" onto separate lines. */
export function migrateTranslationJa(translationJa, lines = []) {
  if (!translationJa || typeof translationJa !== 'string') return translationJa;
  if (translationJa.includes('\n')) return translationJa;

  const speakers = new Set((lines || []).map((l) => l.speaker).filter(Boolean));
  const isDialogue = lines.length > 1 && speakers.size > 1;
  if (!isDialogue) return translationJa;

  const hasSpeakerLabels = /\b[AB]:/.test(translationJa);
  if (!hasSpeakerLabels) return translationJa;

  return translationJa.split(/\s+(?=[AB]:)/).join('\n');
}

export function splitTranslationLines(translationJa) {
  if (!translationJa) return [];
  return translationJa.split('\n').map((line) => line.trim()).filter(Boolean);
}
