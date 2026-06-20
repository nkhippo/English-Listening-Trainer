export const STRUCTURE_FLAGS = {
  relative_clause: {
    label: 'Relative clauses',
    prompt: 'Include at least two relative clauses (who/which/that/where) across the passage.',
  },
  participle: {
    label: 'Participle clauses',
    prompt: 'Include at least two participle constructions (-ing or -ed participial phrases).',
  },
  conditional: {
    label: 'Conditionals',
    prompt: 'Include at least two conditional structures (if/would/had/were).',
  },
  inversion: {
    label: 'Inversion',
    prompt: 'Include at least one inverted structure (Never have I..., Not only..., Had I known...).',
  },
};

export const STRUCTURE_FLAG_KEYS = Object.keys(STRUCTURE_FLAGS);
