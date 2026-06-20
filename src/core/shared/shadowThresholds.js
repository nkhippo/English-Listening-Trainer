export const SHADOW_CLOZE_THRESHOLD = 0.8;

export function isShadowCandidateScore(score) {
  return typeof score === 'number' && score >= SHADOW_CLOZE_THRESHOLD;
}
