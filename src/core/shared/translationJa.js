/** Split flat dialogue translations like "A: … B: …" onto separate lines. */
import { isDialogueContent } from './contentLength.js';

export function migrateTranslationJa(translationJa, lines = [], item = null) {
  if (!translationJa || typeof translationJa !== 'string') return translationJa;
  if (translationJa.includes('\n')) return translationJa;

  const isDialogue = isDialogueContent(item || { lines }, lines);
  if (!isDialogue) return translationJa;

  const hasSpeakerLabels = /\b[AB]:/.test(translationJa);
  if (!hasSpeakerLabels) return translationJa;

  return translationJa.split(/\s+(?=[AB]:)/).join('\n');
}

export function splitTranslationLines(translationJa) {
  if (!translationJa) return [];
  return translationJa.split('\n').map((line) => line.trim()).filter(Boolean);
}
