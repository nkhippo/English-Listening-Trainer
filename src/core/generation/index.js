import { buildGenerationPrompt, buildSystemPrompt } from './prompts.js';
import { buildCefrConstraint } from './cefrConstraints.js';

const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const MAX_CEFR_RETRIES = 3;

async function callClaude({ anthropicKey, userPrompt }) {
  const res = await fetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.9,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`JSON parse failed. Raw text:\n${text}`);
  }
}

function needsCefrRetry(item, cefr) {
  const constraint = buildCefrConstraint(cefr);
  const above = item?.cefr_metadata?.used_words_above_level;
  if (!Array.isArray(above)) return true;
  return above.length > constraint.max_unknown_words;
}

export async function generateContent({
  shell = 'intensive',
  scene,
  cefr = 'B1',
  level,
  mode = 'cloze',
  length = 'sentence',
  structureFlags = [],
  anthropicKey,
}) {
  if (!anthropicKey) throw new Error('Anthropic API key required');

  let lastError;
  for (let attempt = 0; attempt < MAX_CEFR_RETRIES; attempt++) {
    const userPrompt = buildGenerationPrompt({
      scene,
      level,
      mode,
      cefr,
      shell,
      length,
      structureFlags,
    });
    try {
      const item = await callClaude({ anthropicKey, userPrompt });
      if (needsCefrRetry(item, cefr) && attempt < MAX_CEFR_RETRIES - 1) {
        lastError = new Error(`CEFR validation failed: ${JSON.stringify(item.cefr_metadata?.used_words_above_level)}`);
        continue;
      }
      return item;
    } catch (e) {
      lastError = e;
      if (attempt >= MAX_CEFR_RETRIES - 1) throw e;
    }
  }
  throw lastError || new Error('Generation failed after retries');
}

/** @deprecated use generateContent */
export async function generateItem({ scene, level, mode, cefr, anthropicKey }) {
  return generateContent({ shell: 'intensive', scene, level, mode, cefr, anthropicKey });
}
