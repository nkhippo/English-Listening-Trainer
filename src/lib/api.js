// API client: Claude (sentence generation) + GAS (TTS proxy with Drive cache).
import { buildGenerationPrompt, buildSystemPrompt } from './prompts.js';

const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Generate one listening item via Claude.
 */
export async function generateItem({ scene, level, mode, anthropicKey }) {
  const userPrompt = buildGenerationPrompt({ scene, level, mode });
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.9,
  };

  const res = await fetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
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
  } catch (e) {
    throw new Error(`JSON parse failed. Raw text:\n${text}`);
  }
}

/** Ensure generated items always have lines[] for UI and TTS. */
export function normalizeItem(item) {
  if (!item) throw new Error('Empty item from generator');
  const lines = Array.isArray(item.lines) && item.lines.length > 0
    ? item.lines
    : [{ speaker: 'A', text: item.sentence || '' }];
  const sentence = item.sentence || lines.map((l) => l.text).join('\n');
  return { ...item, lines, sentence };
}

/**
 * Request TTS audio from GAS proxy.
 * GAS handles: Drive cache check -> OpenAI call if miss -> save -> return.
 *
 * For single-speaker requests, pass lines with one element.
 * For dialogues, pass multiple lines; GAS concatenates audio with short gaps.
 *
 * Returns: { audioBase64: string, mimeType: string, cached: boolean, perLine: [...] }
 */
export async function fetchTTS({ gasUrl, lines, level, voice = 'nova', voiceB = 'onyx', instructions = '' }) {
  if (!gasUrl) throw new Error('GAS endpoint URL not configured');

  const speed = LEVEL_SPEED[level] ?? 1.0;
  const body = {
    action: 'tts',
    lines, // [{ speaker: 'A', text: '...' }, ...]
    voiceA: voice,
    voiceB,
    speed,
    instructions, // free-form style guidance
  };

  const res = await fetch(gasUrl, {
    method: 'POST',
    // GAS web apps require text/plain to avoid CORS preflight
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`TTS proxy ${res.status}: ${errText}`);
  }

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`TTS proxy returned non-JSON: ${raw.slice(0, 200)}`);
  }
  if (data.error) throw new Error(`TTS error: ${data.error}`);
  return data;
}

const LEVEL_SPEED = { 1: 0.85, 2: 0.9, 3: 1.0, 4: 1.05, 5: 1.05 };

/**
 * Convert base64 mp3 to a playable URL.
 * iOS Safari is more reliable with data: URLs than blob: URLs for <audio>.
 */
export function base64ToAudioUrl(base64, mimeType = 'audio/mpeg') {
  if (!base64) throw new Error('Empty audio data');

  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isIOS) {
    return `data:${mimeType};base64,${base64}`;
  }

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch {
    return `data:${mimeType};base64,${base64}`;
  }
}

/**
 * Resolve audio for an item: use local cache when available, otherwise call GAS once.
 */
export async function resolveItemAudio({
  itemId,
  cachedBase64,
  gasUrl,
  lines,
  level,
  instructions = '',
  voice = 'nova',
  voiceB = 'onyx',
  onCacheSave,
}) {
  if (cachedBase64) {
    return {
      audioBase64: cachedBase64,
      mimeType: 'audio/mpeg',
      cached: true,
      source: 'local',
    };
  }

  const tts = await fetchTTS({
    gasUrl,
    lines,
    level,
    instructions,
    voice,
    voiceB,
  });

  if (onCacheSave && tts.audioBase64) {
    const { audioBase64 } = tts;
    // Defer cache write so session transition is not blocked (iOS localStorage can be slow).
    setTimeout(() => onCacheSave(itemId, audioBase64), 0);
  }

  return { ...tts, source: tts.cached ? 'gas-cache' : 'gas-fresh' };
}

/**
 * Generate TTS style instructions for custom speech.
 * Uses Claude when an API key is available; otherwise falls back to heuristics.
 */
export async function generateCustomSpeechTtsInstructions({ body, lines, anthropicKey }) {
  if (anthropicKey) {
    try {
      return await fetchCustomSpeechTtsInstructions({ body, lines, anthropicKey });
    } catch (e) {
      console.warn('Claude tts_instructions failed, using heuristic:', e);
    }
  }
  return buildCustomSpeechTtsInstructions(lines);
}

async function fetchCustomSpeechTtsInstructions({ body, lines, anthropicKey }) {
  const isDialogue = lines.length > 1;
  const styleRef = isDialogue
    ? 'Speak naturally with the personality of each speaker. Casual reductions where appropriate. Blend words smoothly with natural linking.'
    : 'Natural conversational pace with normal linking between words. Do not over-articulate function words.';

  const userPrompt = `You write OpenAI TTS "instructions" for English listening-practice audio aimed at Japanese learners (connected speech / layer 3 focus).

Text to speak:
${body.trim()}

Speakers: ${isDialogue ? 'multi-speaker dialogue (M = male, F = female)' : 'single speaker'}
Style reference: "${styleRef}"

Return ONLY one sentence of tts_instructions (10–25 words). Match the actual phenomena in the text (contractions, linking, reductions). If reductions like gonna/wanna appear, say to keep them as written. No JSON, no quotes, no preamble.`;

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
      max_tokens: 120,
      system: 'You return a single sentence of TTS voice/style instructions. No JSON, no markdown, no extra text.',
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = (data.content?.[0]?.text ?? '').trim().replace(/^["']|["']$/g, '');
  if (!text) throw new Error('Empty tts_instructions from Claude');
  return text;
}

/** Heuristic tts_instructions aligned with Listening tab level styles. */
export function buildCustomSpeechTtsInstructions(lines) {
  const texts = lines.map((l) => l.text).join(' ');
  const isDialogue = lines.length > 1;
  const hasReductions = /\b(gonna|wanna|lemme|didja|kinda|gotta|coulda|shoulda)\b/i.test(texts);
  const hasContractions = /'\w/i.test(texts);

  if (isDialogue) {
    if (hasReductions) {
      return 'Speak naturally with distinct voices per speaker. Natural pace with smooth linking; keep casual reductions as written.';
    }
    return 'Speak naturally with the personality of each speaker. Natural conversational pace with smooth linking between words.';
  }
  if (hasReductions) {
    return 'Natural conversational pace with relaxed casual reductions as written. Do not over-articulate function words.';
  }
  if (hasContractions) {
    return 'Relaxed natural pace with standard contractions. Function words should sound unstressed with normal linking.';
  }
  return 'Natural conversational pace with normal linking between words. Do not over-articulate function words.';
}
