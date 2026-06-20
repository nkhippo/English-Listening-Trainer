export const CEFR_LEVELS = {
  A1A2: {
    id: 'A1A2',
    label: 'A1+A2',
    description: 'Basic vocabulary (~1,300 words)',
    recommendedLevels: [1, 2],
    defaultLevel: 1,
    cumulativeWords: 1300,
    cumulativeChunks: 350,
  },
  B1: {
    id: 'B1',
    label: 'B1',
    description: 'Intermediate vocabulary (~2,200 words)',
    recommendedLevels: [2, 3, 4],
    defaultLevel: 3,
    cumulativeWords: 2200,
    cumulativeChunks: 800,
  },
  B2: {
    id: 'B2',
    label: 'B2',
    description: 'Upper-intermediate vocabulary (~3,400 words)',
    recommendedLevels: [3, 4, 5],
    defaultLevel: 4,
    cumulativeWords: 3400,
    cumulativeChunks: 1800,
  },
};

export const DEFAULT_CEFR = 'B1';

export function getRecommendedLevel(cefr) {
  return CEFR_LEVELS[cefr]?.defaultLevel ?? 3;
}

export function isLevelRecommended(cefr, level) {
  return CEFR_LEVELS[cefr]?.recommendedLevels?.includes(level) ?? true;
}

export function migrateCefrFromStorage(stored) {
  if (stored && CEFR_LEVELS[stored]) return stored;
  return DEFAULT_CEFR;
}
