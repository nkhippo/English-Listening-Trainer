// Scoring utilities for cloze, full dictation, and minimal pair modes.

/**
 * Normalize a string for forgiving comparison.
 */
export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[.,!?;:"'()\-\u2014\u2013]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compare a single cloze answer. Allows trivial variation (case, punctuation).
 * Also accepts common contraction equivalents (e.g. "going to" ≈ "gonna").
 */
const EQUIVALENTS = [
  ['gonna', 'going to'],
  ['wanna', 'want to'],
  ['gotta', 'got to'],
  ['lemme', 'let me'],
  ['gimme', 'give me'],
  ['kinda', 'kind of'],
  ['sorta', 'sort of'],
  ["dunno", "don't know"],
];

function equivalentForms(s) {
  const n = normalize(s);
  const set = new Set([n]);
  for (const [a, b] of EQUIVALENTS) {
    if (n === a) set.add(b);
    if (n === b) set.add(a);
  }
  return set;
}

export function scoreClozeBlank(userInput, expected) {
  const a = equivalentForms(userInput);
  const b = equivalentForms(expected);
  for (const v of a) if (b.has(v)) return true;
  return false;
}

/**
 * Levenshtein distance for full dictation.
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  const n = a.length, m = b.length;
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
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[m];
}

/**
 * Word-level accuracy for full dictation.
 */
export function scoreFullDictation(userInput, expected) {
  const a = normalize(userInput).split(' ').filter(Boolean);
  const b = normalize(expected).split(' ').filter(Boolean);
  if (b.length === 0) return { accuracy: 0, edits: 0, totalWords: 0 };
  const edits = levenshtein(a, b);
  const accuracy = Math.max(0, 1 - edits / b.length);
  return { accuracy, edits, totalWords: b.length };
}

/**
 * Build a feature-level diagnostic from cloze results.
 * For each target_feature like "weak_form:to", if any blank with hint "weak form"
 * and answer "to" was correct, mark feature as captured.
 */
export function diagnoseFeatures(item, clozeResults) {
  const features = item.target_features || [];
  return features.map((feature) => {
    const [type, payload] = feature.split(':');
    const found = (clozeResults || []).find((r) => {
      const ans = normalize(r.expected);
      return ans.includes(normalize(payload.replace(/_/g, ' ')));
    });
    return {
      feature,
      type,
      payload,
      captured: found ? found.correct : null,
    };
  });
}
