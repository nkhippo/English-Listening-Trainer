export const STRUCTURE_FLAGS = {
  relative_clause: {
    label: 'Relative clauses',
    labelJa: '関係詞節',
    prompt: 'At least 80% of sentences must contain a relative clause (who/whom/whose/which/that/where/when). Include at least 2 relative clauses in total across the passage.',
  },
  participle: {
    label: 'Participle clauses',
    labelJa: '分詞構文',
    prompt: 'At least 80% of sentences must contain a participial phrase (-ing or -ed phrase, or "Having + past participle"). Include at least 2 participial constructions in total.',
  },
  conditional: {
    label: 'Conditionals',
    labelJa: '仮定法',
    prompt: 'At least 80% of sentences must contain a conditional structure (if/unless/would/could/had/were…to). Include at least 2 conditional structures in total.',
  },
  inversion: {
    label: 'Inversion',
    labelJa: '倒置',
    prompt: 'At least 80% of sentences must use inversion (Never have I…, Not only did…, Rarely do…, Had I…, Were I…, Should you…). Include at least 1 inverted structure in total.',
  },
};

export const STRUCTURE_FLAG_KEYS = Object.keys(STRUCTURE_FLAGS);
