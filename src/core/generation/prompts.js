// Sentence generation prompts for Claude API.
import { SCENES } from '../shared/sceneConfig.js';
import { LEVELS } from '../shared/levels.js';
import { FEATURE_CATALOG } from './targetFeatures.js';
import { buildCefrConstraint } from './cefrConstraints.js';
import { STRUCTURE_FLAGS } from '../shared/structureFlags.js';
import { STRUCTURE_SENTENCE_COVERAGE } from '../shared/structureValidation.js';
import { STRUCTURE_FEW_SHOT_EXAMPLES } from '../shared/structureFloodingExamples.js';
import { CONTENT_LENGTH_SPECS } from '../shared/contentLength.js';

export { SCENES, LEVELS };
export { MODES } from '../shared/modes.js';

const LENGTH_SPECS = {
  sentence: { unit: 'sentence', count: 'one', turns: null },
  short_passage: { unit: 'passage', count: '3–6 connected sentences', turns: null },
  long_passage: { unit: 'passage', count: '5–8 connected sentences', turns: null },
  dialogue: { unit: 'dialogue', count: null, turns: '4–8 turns' },
};

function buildStructureSection(structureFlags) {
  if (!structureFlags?.length) return '';
  const lines = structureFlags
    .map((key) => STRUCTURE_FLAGS[key]?.prompt)
    .filter(Boolean);
  if (!lines.length) return '';
  const examples = structureFlags
    .map((key) => STRUCTURE_FEW_SHOT_EXAMPLES[key])
    .filter(Boolean)
    .join('\n\n');
  return `
Structure focus (input flooding) — CRITICAL for extensive listening:
Each passage MUST satisfy ALL selected structures below. This is the core training goal.

Requirements per selected structure:
${lines.map((l) => `- ${l}`).join('\n')}

Quantitative validation (automated): for EACH selected structure, at least ${Math.round(STRUCTURE_SENTENCE_COVERAGE * 100)}% of sentences in the passage must contain that structure, AND the minimum total counts above must be met.

Few-shot reference (match this density and distribution):
${examples}

Do NOT write a passage where only 1–2 sentences contain the target structure. Spread structures across most sentences.`;
}

function buildCefrSection(cefr) {
  const c = buildCefrConstraint(cefr);
  return `
CEFR vocabulary constraint: Use only ${c.vocab_pool_description}.
Sentence complexity: ${c.sentence_complexity}.
Forbidden constructions: ${c.forbidden_constructions.length ? c.forbidden_constructions.join(', ') : 'none'}.
Self-check: list any words above this CEFR band in cefr_metadata.used_words_above_level (empty array if compliant).`;
}

function buildContentLengthSection(effectiveLength) {
  const spec = CONTENT_LENGTH_SPECS[effectiveLength];
  if (!spec) return '';

  if (spec.format === 'passage') {
    return `
CONTENT FORMAT: ${spec.label.toUpperCase()} (single-speaker monologue — NOT a dialogue)
- Write ONE connected passage narrated by a single speaker about the scene.
- Exactly ${spec.sentenceRange} sentences. Each sentence is one element in "lines".
- Every line MUST use "speaker": "A" only. NEVER use speaker "B".
- Do NOT write a conversation, interview, or question-and-answer exchange between two people.
- Sentences must connect into a short narrative, description, or observation (not isolated unrelated lines).
- Level word-count rules apply to EACH sentence in the passage.

Example (${spec.sentenceRange} sentences, speaker A only):
A: I got to the office a little early this morning.
A: The colleague who handles our bookings was already at her desk.
A: She mentioned that the report which we sent yesterday had been approved.
A: I left a note explaining the change before the meeting started.`;
  }

  return `
CONTENT FORMAT: DIALOGUE (two-speaker conversation — NOT a monologue)
- Write a natural back-and-forth conversation between speakers A and B about the scene.
- Exactly ${spec.turnRange} turns total. Each turn is one element in "lines".
- Speakers MUST alternate A → B → A → B (or B → A → B → A).
- Every line MUST use "speaker": "A" or "speaker": "B".
- Do NOT write a single-speaker narrative or essay. This must be an interactive conversation.
- Level word-count rules apply to EACH turn.

Example (${spec.turnRange} turns, alternating speakers):
A: Hey, did you finish the files that need reviewing today?
B: Yeah, I sorted through the emails and I'm gonna send the report soon.
A: Great — if you could cc me, I'd appreciate it.
B: Sure, lemme just organize the data and I'll get it to you.`;
}

function buildSchemaSection({ useDialogue, effectiveLength }) {
  if (useDialogue) {
    return `{
  "sentence": "full dialogue joined with \\n",
  "lines": [{ "speaker": "A" | "B", "text": "one turn" }, ...],
  "translation_ja": "Japanese translation; one line per turn prefixed with A: or B:, joined with \\n",
  "target_features": ["weak_form:to", "linking:pick_it", ...],
  "cefr_metadata": { "used_words_above_level": [], "used_chunks": [] },
  "blanks": null,
  "minimal_pair_target": null,
  "tts_instructions": "Short stylistic guidance for the TTS voice, derived from scene and level."
}`;
  }

  if (effectiveLength !== 'sentence') {
    return `{
  "sentence": "full passage joined with \\n",
  "lines": [{ "speaker": "A", "text": "one sentence" }, ...],
  "translation_ja": "Natural Japanese translation; one line per sentence WITHOUT speaker prefixes, joined with \\n",
  "target_features": ["weak_form:to", "linking:pick_it", ...],
  "cefr_metadata": { "used_words_above_level": [], "used_chunks": [] },
  "blanks": null,
  "minimal_pair_target": null,
  "tts_instructions": "Short stylistic guidance for the TTS voice, derived from scene and level."
}`;
  }

  return `{
  "sentence": "full text for display",
  "lines": [{ "speaker": "A", "text": "..." }],
  "translation_ja": "Japanese translation",
  "target_features": ["weak_form:to", "linking:pick_it", ...],
  "cefr_metadata": { "used_words_above_level": [], "used_chunks": [] },
  "blanks": [{ "answer": "to", "hint": "weak form" }, ...] | null,
  "minimal_pair_target": { "correct": "right", "distractors": ["light", "write"] } | null,
  "tts_instructions": "Short stylistic guidance for the TTS voice, derived from scene and level."
}`;
}

export function buildGenerationPrompt({
  scene,
  level,
  mode,
  cefr = 'B1',
  shell = 'intensive',
  length = 'sentence',
  structureFlags = [],
}) {
  const sceneSpec = SCENES[scene];
  const levelSpec = LEVELS[level];
  const isPassageShell = shell === 'extensive' || shell === 'shadowing';
  const effectiveLength = isPassageShell && length === 'sentence' ? 'short_passage' : length;
  const lengthSpec = LENGTH_SPECS[effectiveLength] || LENGTH_SPECS.sentence;

  let modeSpecific = '';
  if (mode === 'minimal_pair') {
    modeSpecific = `
Mode: minimal_pair. The sentence MUST contain exactly one target word that has a confusable pair for Japanese learners. Include "minimal_pair_target" with { "correct": string, "distractors": [string, string] }. Distractors must be phonologically confusable for Japanese learners (r/l, θ/s, ɪ/iː, æ/e, f/h pairs).`;
  } else if (mode === 'cloze') {
    modeSpecific = `
Mode: cloze. Identify 2–4 spans in the sentence to blank out. blanks MUST correspond directly to target_features where possible (weak forms, linking phrases, reductions). Prefer function words / linked phrases / reductions; avoid content words at CEFR A2 first-encounter level. Return "blanks" as an array of { "answer": string, "hint": string } where hint is one of: "weak form", "linking", "reduction", "elision".`;
  } else if (mode === 'dictation' || mode === 'full_dictation') {
    modeSpecific = 'Mode: dictation. The learner will write the whole sentence.';
  } else if (isPassageShell) {
    modeSpecific = 'Mode: extensive listening. No blanks or minimal pairs. Focus on natural connected speech flow.';
  }

  const useDialogue = effectiveLength === 'dialogue' || (levelSpec.dialogue && effectiveLength === 'sentence');
  const contentLengthSection = isPassageShell && effectiveLength !== 'sentence'
    ? buildContentLengthSection(effectiveLength)
    : useDialogue
      ? buildContentLengthSection('dialogue')
      : effectiveLength !== 'sentence'
        ? `
This is a ${lengthSpec.unit} of ${lengthSpec.count}. Return "lines" as an array of { "speaker": "A", "text": string } — one element per sentence in order. "sentence" joins them with newlines.`
        : `
This is a single utterance. "lines" should be an array with one element { "speaker": "A", "text": "..." }.`;

  const contentType = useDialogue ? 'dialogue' : lengthSpec.unit;

  return `Generate one English listening-practice ${contentType} for a Japanese learner.

Scene: ${sceneSpec.en} — ${sceneSpec.description}
CEFR band: ${cefr}
Level: ${levelSpec.label}
Rules: ${levelSpec.rules}
Topics: everyday, neutral, non-controversial. No politics, HR disputes, or confrontational exchanges.
${buildCefrSection(cefr)}
${contentLengthSection}
${modeSpecific}
${buildStructureSection(structureFlags)}

${FEATURE_CATALOG}

Return ONLY a JSON object (no prose, no code fences) with this exact schema:
${buildSchemaSection({ useDialogue, effectiveLength })}

Critical:
- Output JSON only. No backticks. No prose.
- ASCII only in English fields (no fullwidth characters, no emoji).
- target_features must be a faithful summary of ACTUAL phenomena in the sentence; never fabricate features.
- Vary sentence openings and structures; avoid repetitive patterns (e.g. do not always start with "I was").
- translation_ja must sound natural to a Japanese native speaker, not word-for-word literal.
${useDialogue
    ? '- For dialogues: translation_ja MUST use one line per speaker turn (\\n-separated), each prefixed with A: or B: matching the English lines order.'
    : effectiveLength !== 'sentence'
      ? '- For passages: translation_ja MUST NOT use A: or B: prefixes — one Japanese line per English sentence only.'
      : ''}
- "blanks" is required when mode=cloze, null otherwise.
- "minimal_pair_target" is required when mode=minimal_pair, null otherwise.
- cefr_metadata.used_words_above_level MUST be an array (empty if fully compliant).
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
    'Always include cefr_metadata with used_words_above_level as an honest self-audit of vocabulary.',
    'For extensive listening: short/long passages are single-speaker monologues (speaker A only); dialogues are two-speaker conversations (A and B). Never mix these formats.',
  ].join(' ');
}
