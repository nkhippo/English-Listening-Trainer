// Sentence generation prompts for Claude API.
// Design rationale: docs/background.md

export const SCENES = {
  phone: {
    label: '電話口',
    en: 'phone call',
    description:
      'phone calls: customer support, booking, appointments, inquiries. No visual context. Formulaic openings/closings.',
  },
  store: {
    label: '店舗・カフェ',
    en: 'store / cafe',
    description:
      'short transactional exchanges at a store, cafe, restaurant, or counter. Greetings, ordering, payment, takeaway.',
  },
  workplace: {
    label: '職場の会話',
    en: 'workplace',
    description:
      'short workplace exchanges: quick check-ins, scheduling, asking for status, brief meeting openings. Semi-formal.',
  },
};

export const LEVELS = {
  1: {
    label: 'Lv1 — 教科書英語',
    speed: 0.85,
    style:
      'Read clearly and slowly, like a textbook example. No contractions. Articulate every word.',
    rules:
      '5–8 words. Single clause. NO contractions. NO weak forms. Use full forms like "going to", "have to", "want to". Vocabulary: CEFR A2 only.',
    dialogue: false,
  },
  2: {
    label: 'Lv2 — 弱形のみ',
    speed: 0.9,
    style:
      'Relaxed natural pace with standard contractions, but no further reductions. Do not over-articulate function words.',
    rules:
      '8–10 words. Single clause. Standard contractions OK ("I\'ll", "don\'t"). Function words (to, of, and, the, for) should appear naturally and be unstressed. No gonna/wanna/lemme. Vocabulary: CEFR A2–B1.',
    dialogue: false,
  },
  3: {
    label: 'Lv3 — 連結あり',
    speed: 1.0,
    style:
      'Natural conversational pace with normal linking between words. Do not over-articulate function words.',
    rules:
      '10–12 words. May include one subordinate clause. Contractions OK. MUST include at least one consonant-to-vowel linking point (e.g., "pick it up", "an apple", "find out about it"). Vocabulary: CEFR A2–B1.',
    dialogue: false,
  },
  4: {
    label: 'Lv4 — 自然速度＋縮約',
    speed: 1.05,
    style:
      'Natural conversational pace, with relaxed casual reductions where typical native speakers would use them. Keep reductions as written.',
    rules:
      '12–16 words. MUST include at least one casual reduction (gonna, wanna, lemme, didja, kinda). Multiple function words. MUST include at least 2 linking points. Vocabulary: CEFR B1.',
    dialogue: false,
  },
  5: {
    label: 'Lv5 — 対話・複数話者',
    speed: 1.05,
    style:
      'Speak naturally with the personality of each speaker. Casual reductions where appropriate. Blend words smoothly with natural linking.',
    rules:
      '2–4 turn dialogue, each turn 6–14 words. Two speakers labeled A and B. Casual reductions allowed. Each turn MUST contain linking or weak forms. Vocabulary: CEFR B1.',
    dialogue: true,
  },
};

export const MODES = {
  cloze: { label: 'Cloze（空欄補充）', description: '機能語・連結箇所を聞き取って入力' },
  dictation: { label: 'Full Dictation（全文）', description: '全文を聞き取って書き起こし' },
  minimal_pair: { label: 'Minimal Pair（聞き分け）', description: '紛らわしい音の選択肢から正解を選ぶ' },
};

export function buildGenerationPrompt({ scene, level, mode }) {
  const sceneSpec = SCENES[scene];
  const levelSpec = LEVELS[level];

  const featureCatalog = `
target_features catalog (use these exact tokens):
- weak_form:WORD          (a function word that will be reduced, e.g. weak_form:to, weak_form:and)
- linking:WORD1_WORD2     (consonant-vowel linking across words, e.g. linking:pick_it)
- reduction:FORM          (casual reduction, e.g. reduction:gonna, reduction:wanna, reduction:didja)
- elision:WORD            (a sound dropped, e.g. elision:next_day)
- minimal_pair:A_vs_B     (a word that contrasts with a confusable one, e.g. minimal_pair:right_vs_light)
`;

  let modeSpecific = '';
  if (mode === 'minimal_pair') {
    modeSpecific = `
Mode: minimal_pair. The sentence MUST contain exactly one target word that has a confusable pair for Japanese learners. Include "minimal_pair_target" with { "correct": string, "distractors": [string, string] }. Distractors must be phonologically confusable for Japanese learners (r/l, θ/s, ɪ/iː, æ/e, f/h pairs).`;
  } else if (mode === 'cloze') {
    modeSpecific = `
Mode: cloze. Identify 2–4 spans in the sentence to blank out. blanks MUST correspond directly to target_features where possible (weak forms, linking phrases, reductions). Prefer function words / linked phrases / reductions; avoid content words at CEFR A2 first-encounter level. Return "blanks" as an array of { "answer": string, "hint": string } where hint is one of: "weak form", "linking", "reduction", "elision".`;
  } else {
    modeSpecific = `Mode: dictation. The learner will write the whole sentence.`;
  }

  const dialogueSpec = levelSpec.dialogue
    ? `
This is a DIALOGUE. Return "lines" as an array of { "speaker": "A" | "B", "text": string }. 2–4 turns total. Speakers alternate. "sentence" field should contain the full dialogue joined with newlines for fallback display.`
    : `
This is a single utterance. "lines" should be an array with one element { "speaker": "A", "text": "..." }.`;

  return `Generate one English listening-practice ${levelSpec.dialogue ? 'dialogue' : 'sentence'} for a Japanese learner.

Scene: ${sceneSpec.en} — ${sceneSpec.description}
Level: ${levelSpec.label}
Rules: ${levelSpec.rules}
Topics: everyday, neutral, non-controversial. No politics, HR disputes, or confrontational exchanges.
${dialogueSpec}
${modeSpecific}

${featureCatalog}

Return ONLY a JSON object (no prose, no code fences) with this exact schema:
{
  "sentence": "full text for display (dialogue joined with \\n)",
  "lines": [{ "speaker": "A", "text": "..." }, ...],
  "translation_ja": "Japanese translation of the full content",
  "target_features": ["weak_form:to", "linking:pick_it", ...],
  "blanks": [{ "answer": "to", "hint": "weak form" }, ...] | null,
  "minimal_pair_target": { "correct": "right", "distractors": ["light", "write"] } | null,
  "tts_instructions": "Short stylistic guidance for the TTS voice, derived from scene and level."
}

Critical:
- Output JSON only. No backticks. No prose.
- ASCII only in English fields (no fullwidth characters, no emoji).
- target_features must be a faithful summary of ACTUAL phenomena in the sentence; never fabricate features.
- Vary sentence openings and structures; avoid repetitive patterns (e.g. do not always start with "I was").
- translation_ja must sound natural to a Japanese native speaker, not word-for-word literal.
- "blanks" is required when mode=cloze, null otherwise.
- "minimal_pair_target" is required when mode=minimal_pair, null otherwise.
- tts_instructions: one sentence, 10–25 words, aligned with this level style: "${levelSpec.style}"
- For Lv3+: tts_instructions should include natural linking; for Lv4+: keep reductions as written in the text.
- Write reductions in the sentence as spoken forms (gonna, not going to) when level allows.`;
}

export function buildSystemPrompt() {
  return [
    'You generate English listening-practice items for Japanese learners focused on connected speech (layer 3).',
    'You always return strict JSON matching the requested schema.',
    'You never include code fences or commentary.',
    'Vocabulary must stay within the CEFR level stated in the user prompt.',
    'target_features are ground truth for automated diagnosis — they must match the actual sentence content.',
  ].join(' ');
}
