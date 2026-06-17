// Scoring utilities for cloze, full dictation, and minimal pair modes.

/**
 * Normalize a string for forgiving comparison.
 */
export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[.,!?;:"'()\-\u2014\u2013\u2018\u2019]/g, ' ')
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

export function scoreMinimalPair(userChoice, expected) {
  return normalize(userChoice) === normalize(expected);
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
 * Map each target_feature to the cloze blank that tests it, then report capture status.
 */
export function diagnoseFeatures(item, clozeResults) {
  const features = item.target_features || [];
  const results = clozeResults || [];

  return features.map((feature) => {
    const [type, payload] = feature.split(':');
    const payloadNorm = normalize(payload.replace(/_/g, ' '));
    const payloadCompact = normalize(payload.replace(/_/g, ''));

    const hintByType = {
      weak_form: 'weak',
      linking: 'link',
      reduction: 'reduc',
      elision: 'elision',
      minimal_pair: 'minimal',
    };

    const matched = results.find((r) => {
      const ans = normalize(r.expected);
      const hint = (r.hint || '').toLowerCase();
      const typeHint = hintByType[type];

      if (payloadNorm && (ans === payloadNorm || ans.includes(payloadNorm) || payloadNorm.includes(ans))) {
        return true;
      }
      if (payloadCompact && ans.replace(/\s/g, '') === payloadCompact) return true;
      if (typeHint && hint.includes(typeHint)) {
        const firstToken = payloadNorm.split(' ')[0];
        if (firstToken && ans.includes(firstToken)) return true;
      }
      return false;
    });

    return {
      feature,
      type,
      payload,
      captured: matched ? matched.correct : null,
    };
  });
}
