import { buildGenerationPrompt, buildSystemPrompt } from './prompts.js';
import { enrichCefrMetadata, isCefrCompliant } from '../shared/cefrCatalog.js';
import { enrichStructureMetadata, isStructureCompliant, formatStructureFailures } from '../shared/structureValidation.js';

const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const MAX_CEFR_RETRIES = 3;
const MAX_STRUCTURE_RETRIES = 5;

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
  return !isCefrCompliant(item, cefr);
}

function needsStructureRetry(item, structureFlags) {
  if (!structureFlags?.length) return false;
  return !isStructureCompliant(item, structureFlags);
}

function maxGenerationAttempts(structureFlags) {
  return structureFlags?.length ? MAX_STRUCTURE_RETRIES : MAX_CEFR_RETRIES;
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

  const maxAttempts = maxGenerationAttempts(structureFlags);
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
      const raw = await callClaude({ anthropicKey, userPrompt });
      let item = enrichCefrMetadata(raw, cefr);
      item = enrichStructureMetadata(item, structureFlags);

      if (needsCefrRetry(item, cefr) && attempt < maxAttempts - 1) {
        lastError = new Error(`CEFR validation failed: ${JSON.stringify(item.cefr_metadata?.used_words_above_level)}`);
        continue;
      }
      if (needsStructureRetry(item, structureFlags) && attempt < maxAttempts - 1) {
        lastError = new Error(`Structure validation failed: ${JSON.stringify(formatStructureFailures(item.structure_metadata))}`);
        continue;
      }
      return item;
    } catch (e) {
      lastError = e;
      if (attempt >= maxAttempts - 1) throw e;
    }
  }
  throw lastError || new Error('Generation failed after retries');
}

/** @deprecated use generateContent */
export async function generateItem({ scene, level, mode, cefr, anthropicKey }) {
  return generateContent({ shell: 'intensive', scene, level, mode, cefr, anthropicKey });
}
