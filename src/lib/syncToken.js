// Sync token: generated locally, shared across devices via clipboard (no manual typing).

const SYNC_TOKEN_KEY = 'elt_sync_token';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24,64}$/;

export function isValidSyncToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token.trim());
}

export function getSyncToken() {
  try {
    const token = localStorage.getItem(SYNC_TOKEN_KEY);
    return isValidSyncToken(token) ? token.trim() : '';
  } catch {
    return '';
  }
}

export function setSyncToken(token) {
  const trimmed = token.trim();
  if (!isValidSyncToken(trimmed)) {
    throw new Error('Invalid sync token');
  }
  localStorage.setItem(SYNC_TOKEN_KEY, trimmed);
  return trimmed;
}

export function clearSyncToken() {
  localStorage.removeItem(SYNC_TOKEN_KEY);
}

export function generateSyncToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 32);
  return setSyncToken(token);
}

export async function readSyncTokenFromClipboard() {
  if (!navigator.clipboard?.readText) {
    throw new Error('Clipboard access is not available in this browser');
  }
  const text = (await navigator.clipboard.readText()).trim();
  if (!isValidSyncToken(text)) {
    throw new Error('Clipboard does not contain a valid sync token. Copy it from your other device first.');
  }
  return setSyncToken(text);
}

export async function copySyncTokenToClipboard(token) {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard copy is not available in this browser');
  }
  await navigator.clipboard.writeText(token);
}

export function maskSyncToken(token) {
  if (!token || token.length < 12) return token;
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}
