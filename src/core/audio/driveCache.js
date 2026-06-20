import { getLevelSpeed } from '../shared/levels.js';

export function computeAudioCacheKey({ text, voice, speed, instructions, lines }) {
  const textPart = lines
    ? JSON.stringify(lines)
    : (Array.isArray(text) ? JSON.stringify(text) : String(text || ''));
  return `${textPart}|${voice}|${speed}|${instructions || ''}`;
}

export async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeCacheHash(params) {
  return sha256Hex(computeAudioCacheKey(params));
}

/**
 * Fetch audio via GAS Drive cache layer (§5.3).
 * Falls back to legacy tts action when audio action unavailable.
 */
export async function fetchAudio({
  gasUrl,
  text,
  lines,
  voice = 'nova',
  voiceB = 'onyx',
  speed,
  level,
  instructions = '',
  cefr = 'B1',
  shell = 'intensive',
}) {
  if (!gasUrl) throw new Error('GAS endpoint URL not configured');

  const effectiveSpeed = speed ?? getLevelSpeed(level);
  const body = {
    action: 'audio',
    text: lines ? undefined : text,
    lines: lines || undefined,
    voice,
    voiceA: voice,
    voiceB,
    speed: effectiveSpeed,
    instructions,
    cefr,
    shell,
  };

  const res = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Audio proxy returned non-JSON: ${raw.slice(0, 200)}`);
  }
  if (data.error) throw new Error(`Audio error: ${data.error}`);
  return data;
}
