export function buildCefrConstraint(cefr) {
  const constraints = {
    A1A2: {
      vocab_pool_description: 'CEFR A1–A2 vocabulary (~1,450 words)',
      max_unknown_words: 0,
      sentence_complexity: 'simple sentences, present/past tense, no relative clauses',
      forbidden_constructions: ['perfect aspect', 'subjunctive', 'inversion'],
    },
    B1: {
      vocab_pool_description: 'CEFR up to B1 vocabulary (~3,100 words)',
      max_unknown_words: 1,
      sentence_complexity: 'compound sentences, all basic tenses, simple relative clauses',
      forbidden_constructions: ['subjunctive', 'cleft sentences'],
    },
    B2: {
      vocab_pool_description: 'CEFR up to B2 vocabulary (~5,600 words)',
      max_unknown_words: 2,
      sentence_complexity: 'complex sentences, perfect aspects, relative clauses, conditionals',
      forbidden_constructions: [],
    },
  };
  return constraints[cefr] || constraints.B1;
}
