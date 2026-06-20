/**
 * Validates few-shot examples and sample passages against structure detectors.
 * Run: node scripts/validate-structure-flooding.mjs
 */
import { auditStructureFlags, countAllStructureOccurrences } from '../src/core/shared/structureValidation.js';
import { STRUCTURE_FEW_SHOT_EXAMPLES } from '../src/core/shared/structureFloodingExamples.js';

function itemFromText(text) {
  const lines = text.split(/(?<=[.!?])\s+/).filter(Boolean).map((t) => ({ speaker: 'A', text: t }));
  return { lines, sentence: lines.map((l) => l.text).join('\n') };
}

let pass = 0;
let fail = 0;

for (const [flag, example] of Object.entries(STRUCTURE_FEW_SHOT_EXAMPLES)) {
  const body = example.split('\n').slice(1).join(' ').replace(/^"|"$/g, '');
  const item = itemFromText(body);
  const audit = auditStructureFlags(item, [flag]);
  const ok = audit.compliant;
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${flag}`, {
    compliant: audit.compliant,
    flags: audit.flags[flag],
    occurrences: countAllStructureOccurrences(item)[flag],
  });
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
