export const FEATURE_CATALOG = `
target_features catalog (use these exact tokens):
- weak_form:WORD          (a function word that will be reduced, e.g. weak_form:to, weak_form:and)
- linking:WORD1_WORD2     (consonant-vowel linking across words, e.g. linking:pick_it)
- reduction:FORM          (casual reduction, e.g. reduction:gonna, reduction:wanna, reduction:didja)
- elision:WORD            (a sound dropped, e.g. elision:next_day)
- minimal_pair:A_vs_B     (a word that contrasts with a confusable one, e.g. minimal_pair:right_vs_light)
`;
