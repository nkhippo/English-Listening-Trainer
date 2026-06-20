/**
 * Optional batch helpers for the Listening Trainer GAS project.
 * Add this file to the same Apps Script project as Code.gs.
 *
 * Monthly cleanup trigger (recommended):
 *   Triggers → Add Trigger → runMonthlyManifestCleanup
 *   Event: Time-driven → Month timer → Day 1, 03:00–04:00
 *
 * Optional warmup (manual run from editor only):
 *   warmupCacheSample({ count: 5, cefr: 'B1', shell: 'intensive' })
 */

function warmupCacheSample(options) {
  options = options || {};
  var count = Math.min(Number(options.count) || 5, 20);
  var cefr = options.cefr || 'B1';
  var shell = options.shell || 'intensive';
  var cached = 0;
  var fresh = 0;

  for (var i = 0; i < count; i++) {
    var result = handleAudio({
      lines: [{ speaker: 'A', text: 'Warmup cache sample sentence ' + (i + 1) + '.' }],
      cefr: cefr,
      shell: shell,
      speed: 1.0,
      instructions: 'Natural conversational pace with normal linking.',
    });
    if (result.cached) cached += 1;
    else fresh += 1;
  }

  return {
    ok: true,
    requested: count,
    cached: cached,
    fresh: fresh,
    cefr: cefr,
    shell: shell,
  };
}
