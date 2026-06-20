/**
 * Legacy in-project warmup helper (same Apps Script project as Code.gs).
 * For production batching use the standalone deployment in gas/warmup/Code.gs.
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
