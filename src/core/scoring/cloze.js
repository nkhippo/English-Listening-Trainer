import { normalize } from './normalize.js';

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
