export function normalize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[.,!?;:"'()\-\u2014\u2013\u2018\u2019]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
