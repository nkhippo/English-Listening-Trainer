import { normalize } from './normalize.js';

function levenshtein(a, b) {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const dp = new Array(m + 1);
  for (let j = 0; j <= m; j++) dp[j] = j;
  for (let i = 1; i <= n; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= m; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[m];
}

export function scoreFullDictation(userInput, expected) {
  const a = normalize(userInput).split(' ').filter(Boolean);
  const b = normalize(expected).split(' ').filter(Boolean);
  if (b.length === 0) return { accuracy: 0, edits: 0, totalWords: 0 };
  const edits = levenshtein(a, b);
  const accuracy = Math.max(0, 1 - edits / b.length);
  return { accuracy, edits, totalWords: b.length };
}
