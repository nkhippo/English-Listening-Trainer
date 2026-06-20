export const LEVELS = {
  1: {
    label: 'Lv1 — Textbook English',
    speed: 0.85,
    style:
      'Read clearly and slowly, like a textbook example. No contractions. Articulate every word.',
    rules:
      '5–8 words. Single clause. NO contractions. NO weak forms. Use full forms like "going to", "have to", "want to". Vocabulary: CEFR A2 only.',
    dialogue: false,
  },
  2: {
    label: 'Lv2 — Weak forms only',
    speed: 0.9,
    style:
      'Relaxed natural pace with standard contractions, but no further reductions. Do not over-articulate function words.',
    rules:
      '8–10 words. Single clause. Standard contractions OK ("I\'ll", "don\'t"). Function words (to, of, and, the, for) should appear naturally and be unstressed. No gonna/wanna/lemme. Vocabulary: CEFR A2–B1.',
    dialogue: false,
  },
  3: {
    label: 'Lv3 — Linking',
    speed: 1.0,
    style:
      'Natural conversational pace with normal linking between words. Do not over-articulate function words.',
    rules:
      '10–12 words. May include one subordinate clause. Contractions OK. MUST include at least one consonant-to-vowel linking point (e.g., "pick it up", "an apple", "find out about it"). Vocabulary: CEFR A2–B1.',
    dialogue: false,
  },
  4: {
    label: 'Lv4 — Natural speed + reductions',
    speed: 1.05,
    style:
      'Natural conversational pace, with relaxed casual reductions where typical native speakers would use them. Keep reductions as written.',
    rules:
      '12–16 words. MUST include at least one casual reduction (gonna, wanna, lemme, didja, kinda). Multiple function words. MUST include at least 2 linking points. Vocabulary: CEFR B1.',
    dialogue: false,
  },
  5: {
    label: 'Lv5 — Dialogue (multi-speaker)',
    speed: 1.05,
    style:
      'Speak naturally with the personality of each speaker. Casual reductions where appropriate. Blend words smoothly with natural linking.',
    rules:
      '2–4 turn dialogue, each turn 6–14 words. Two speakers labeled A and B. Casual reductions allowed. Each turn MUST contain linking or weak forms. Vocabulary: CEFR B1.',
    dialogue: true,
  },
};

export function getLevelSpeed(level) {
  return LEVELS[level]?.speed ?? 1.0;
}
