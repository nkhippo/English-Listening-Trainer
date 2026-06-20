/**
 * English Listening Trainer — Warmup cache batch (standalone GAS Web App).
 *
 * Deploy separately from Code.gs. Calls the main TTS proxy (action: audio) to
 * populate Drive cache for CEFR × scene × level × shell combinations.
 *
 * Script Properties:
 *   MAIN_GAS_URL — main Code.gs Web App /exec URL (or pass mainGasUrl on first run)
 *
 * Deploy: Web app, Execute as Me, Anyone with link.
 */

var WARMUP_CEFR = ['A1A2', 'B1', 'B2'];
var WARMUP_SHELLS = ['intensive', 'extensive', 'shadowing'];
var WARMUP_SCENES = ['phone', 'shop', 'workplace', 'friends', 'travel', 'daily'];
var WARMUP_LEVELS = [1, 2, 3, 4, 5];
var CURSOR_KEY = 'WARMUP_CURSOR';
var STATS_KEY = 'WARMUP_STATS';

var WARMUP_LEVEL_SPECS = {
  1: {
    speed: 0.85,
    instructions: 'Read clearly and slowly, like a textbook example. No contractions.',
  },
  2: {
    speed: 0.9,
    instructions: 'Relaxed natural pace with standard contractions, but no further reductions.',
  },
  3: {
    speed: 1.0,
    instructions: 'Natural conversational pace with normal linking between words.',
  },
  4: {
    speed: 1.05,
    instructions: 'Natural pace with relaxed casual reductions as written. Keep linking natural.',
  },
  5: {
    speed: 1.05,
    instructions: 'Speak naturally with distinct voices per speaker. Smooth linking between words.',
  },
};

var WARMUP_SCENE_LINES = {
  phone: [
    'Hello, I am calling to confirm my appointment for tomorrow afternoon.',
    'Could you please hold for a moment while I check your booking?',
    'I would like to change the time of my reservation if that is possible.',
    'Thank you for calling. How may I help you today?',
    'Sorry, the line was bad for a second. Could you repeat that please?',
    'I have a question about the confirmation email I received yesterday.',
    'Is there any chance I can speak to someone about my account?',
    'I will call back later if that is easier for you.',
    'Could you please send me the details by email after this call?',
    'Thanks for your help. I appreciate you looking into this for me.',
  ],
  shop: [
    'Hi, I would like a medium coffee to go, please.',
    'Do you have any almond milk for the latte?',
    'Could I get the sandwich without onions, please?',
    'Is it possible to pay by card for this order?',
    'I think I forgot my wallet. Can I come back in ten minutes?',
    'Could you warm this up for me, please?',
    'Do you have anything similar in a smaller size?',
    'I would like to return this item. I still have the receipt.',
    'Can I have a bag for these, please?',
    'Thanks. The cake looks great. Have a nice day.',
  ],
  workplace: [
    'Do you have a minute to talk about the report deadline?',
    'I finished the first draft and shared it in the folder.',
    'Could we move our check-in to tomorrow morning instead?',
    'I will follow up with the client after lunch today.',
    'Let me know if you need anything else from my side.',
    'I am running a little late because of the train delay.',
    'Can you review the slides before the meeting starts?',
    'I think we should sync on the budget numbers this week.',
    'Thanks for the update. That helps me plan my tasks.',
    'I will send the summary to the team by five o clock.',
  ],
  friends: [
    'Hey, are you free this weekend for coffee or a walk?',
    'I finally watched that show you recommended last month.',
    'Do you want to grab lunch somewhere near the station?',
    'Sorry I replied late. Work has been pretty busy lately.',
    'That sounds fun. What time were you thinking?',
    'I can bring the tickets if you pick a place to eat.',
    'Let me know when you get home safely tonight.',
    'We should catch up properly soon. It has been ages.',
    'I loved hearing about your trip. The photos looked amazing.',
    'Same here. Talk soon and take care until then.',
  ],
  travel: [
    'Excuse me, where is the check-in counter for this airline?',
    'Could you tell me which platform the next train leaves from?',
    'I would like a room for two nights, checking in today.',
    'Is breakfast included with this booking?',
    'How do I get to the city center from this airport?',
    'Could I have a map of the local bus routes, please?',
    'My flight was delayed. Can I still catch the last train?',
    'Where can I store my luggage for a few hours?',
    'Is this seat taken, or may I sit here?',
    'Thank you. That really helps me find my way around.',
  ],
  daily: [
    'I need to pick up some milk on the way home today.',
    'Could you take the trash out before you leave?',
    'It looks like it might rain later, so take an umbrella.',
    'I will start dinner around six if that works for you.',
    'The package arrived while you were out this morning.',
    'Can you help me move this table a little closer to the window?',
    'I forgot my keys, so I will wait here until you come back.',
    'Let us walk the dog before it gets too dark outside.',
    'I will water the plants while you are away this week.',
    'Thanks for helping me with the errands this afternoon.',
  ],
};

var WARMUP_DIALOGUES = {
  phone: [
    [
      { speaker: 'A', text: 'Hi, I am calling about my appointment tomorrow.' },
      { speaker: 'B', text: 'Sure, can I have your name and date of birth?' },
      { speaker: 'A', text: 'It is Tanaka, and my birthday is March twelfth.' },
    ],
  ],
  shop: [
    [
      { speaker: 'A', text: 'Could I get a tea and one of those muffins, please?' },
      { speaker: 'B', text: 'Of course. Would you like that heated up?' },
      { speaker: 'A', text: 'Yes, please. I will pay by card.' },
    ],
  ],
  workplace: [
    [
      { speaker: 'A', text: 'Do you have time for a quick sync this afternoon?' },
      { speaker: 'B', text: 'Maybe after three. Is the deck ready to share?' },
      { speaker: 'A', text: 'Almost. I will send it in the next hour.' },
    ],
  ],
  friends: [
    [
      { speaker: 'A', text: 'Are you still up for dinner on Friday night?' },
      { speaker: 'B', text: 'Yeah, totally. I found a place near the park.' },
      { speaker: 'A', text: 'Perfect. Text me when you leave work.' },
    ],
  ],
  travel: [
    [
      { speaker: 'A', text: 'Excuse me, does this bus go to the main station?' },
      { speaker: 'B', text: 'Yes, but you need the express line on platform four.' },
      { speaker: 'A', text: 'Thanks. I was looking at the wrong screen.' },
    ],
  ],
  daily: [
    [
      { speaker: 'A', text: 'Did you remember to turn off the heater downstairs?' },
      { speaker: 'B', text: 'Good catch. I will go check right now.' },
      { speaker: 'A', text: 'Thanks. I will start making lunch then.' },
    ],
  ],
};

function doGet() {
  return jsonResponse({ status: 'ok', service: 'elt-warmup-cache', actions: ['warmup_status', 'warmup_run', 'warmup_reset'] });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.mainGasUrl) {
      PropertiesService.getScriptProperties().setProperty('MAIN_GAS_URL', String(body.mainGasUrl));
    }
    if (body.action === 'warmup_status') return jsonResponse(getWarmupStatus_(body));
    if (body.action === 'warmup_run') return jsonResponse(runWarmupBatch_(body));
    if (body.action === 'warmup_reset') return jsonResponse(resetWarmupProgress_());
    return jsonResponse({ error: 'Unknown action: ' + body.action });
  } catch (err) {
    return jsonResponse({ error: String(err && err.message || err) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getMainGasUrl_() {
  var url = PropertiesService.getScriptProperties().getProperty('MAIN_GAS_URL');
  if (!url) throw new Error('MAIN_GAS_URL not set. Pass mainGasUrl once or set Script Properties.');
  return url;
}

function loadCursor_() {
  var raw = PropertiesService.getScriptProperties().getProperty(CURSOR_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

function saveCursor_(cursor) {
  PropertiesService.getScriptProperties().setProperty(CURSOR_KEY, JSON.stringify(cursor));
}

function loadStats_() {
  var raw = PropertiesService.getScriptProperties().getProperty(STATS_KEY);
  return raw ? JSON.parse(raw) : { cached: 0, fresh: 0, errors: 0, processed: 0 };
}

function saveStats_(stats) {
  PropertiesService.getScriptProperties().setProperty(STATS_KEY, JSON.stringify(stats));
}

function computeWarmupPlan_(sentencesPerCell) {
  return {
    cefr: WARMUP_CEFR.length,
    shells: WARMUP_SHELLS.length,
    scenes: WARMUP_SCENES.length,
    levels: WARMUP_LEVELS.length,
    sentencesPerCell: sentencesPerCell,
    total: WARMUP_CEFR.length * WARMUP_SHELLS.length * WARMUP_SCENES.length
      * WARMUP_LEVELS.length * sentencesPerCell,
  };
}

function initCursor_() {
  return {
    cefrIdx: 0,
    shellIdx: 0,
    sceneIdx: 0,
    levelIdx: 0,
    sentenceIdx: 0,
    sentencesPerCell: 10,
  };
}

function cursorToFlatIndex_(cursor) {
  var perCell = cursor.sentencesPerCell || 10;
  var cellIndex = cursor.cefrIdx;
  cellIndex = cellIndex * WARMUP_SHELLS.length + cursor.shellIdx;
  cellIndex = cellIndex * WARMUP_SCENES.length + cursor.sceneIdx;
  cellIndex = cellIndex * WARMUP_LEVELS.length + cursor.levelIdx;
  return cellIndex * perCell + cursor.sentenceIdx;
}

function advanceCursor_(cursor) {
  cursor.sentenceIdx += 1;
  if (cursor.sentenceIdx < cursor.sentencesPerCell) return cursor;
  cursor.sentenceIdx = 0;
  cursor.levelIdx += 1;
  if (cursor.levelIdx < WARMUP_LEVELS.length) return cursor;
  cursor.levelIdx = 0;
  cursor.sceneIdx += 1;
  if (cursor.sceneIdx < WARMUP_SCENES.length) return cursor;
  cursor.sceneIdx = 0;
  cursor.shellIdx += 1;
  if (cursor.shellIdx < WARMUP_SHELLS.length) return cursor;
  cursor.shellIdx = 0;
  cursor.cefrIdx += 1;
  return cursor;
}

function isCursorDone_(cursor) {
  return cursor.cefrIdx >= WARMUP_CEFR.length;
}

function buildWarmupPayload_(cursor) {
  var cefr = WARMUP_CEFR[cursor.cefrIdx];
  var shell = WARMUP_SHELLS[cursor.shellIdx];
  var scene = WARMUP_SCENES[cursor.sceneIdx];
  var level = WARMUP_LEVELS[cursor.levelIdx];
  var spec = WARMUP_LEVEL_SPECS[level];
  var lines;

  if (level === 5) {
    var dialogues = WARMUP_DIALOGUES[scene] || WARMUP_DIALOGUES.phone;
    lines = dialogues[cursor.sentenceIdx % dialogues.length];
  } else {
    var sceneLines = WARMUP_SCENE_LINES[scene] || WARMUP_SCENE_LINES.phone;
    var base = sceneLines[cursor.sentenceIdx % sceneLines.length];
    if (cursor.sentenceIdx >= sceneLines.length) {
      base = base.replace(/\.$/, '') + ' (warmup ' + (cursor.sentenceIdx + 1) + ').';
    }
    lines = [{ speaker: 'A', text: base }];
  }

  return {
    action: 'audio',
    lines: lines,
    cefr: cefr,
    shell: shell,
    speed: spec.speed,
    instructions: spec.instructions,
    voiceA: 'nova',
    voiceB: 'onyx',
  };
}

function postToMainAudio_(payload) {
  var res = UrlFetchApp.fetch(getMainGasUrl_(), {
    method: 'post',
    contentType: 'text/plain; charset=utf-8',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var raw = res.getContentText();
  var data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error('Main GAS returned non-JSON: ' + raw.slice(0, 200));
  }
  if (data.error) throw new Error(data.error);
  return data;
}

function getWarmupStatus_(body) {
  var sentencesPerCell = Math.min(Number(body && body.sentencesPerCell) || 10, 50);
  var plan = computeWarmupPlan_(sentencesPerCell);
  var cursor = loadCursor_() || initCursor_();
  cursor.sentencesPerCell = sentencesPerCell;
  var processed = isCursorDone_(cursor) ? plan.total : cursorToFlatIndex_(cursor);
  return {
    ok: true,
    done: isCursorDone_(cursor),
    progress: processed,
    total: plan.total,
    percent: plan.total ? Math.round((processed / plan.total) * 100) : 100,
    cursor: cursor,
    stats: loadStats_(),
    plan: plan,
  };
}

function runWarmupBatch_(body) {
  var batchSize = Math.min(Number(body.batchSize) || 5, 25);
  var sentencesPerCell = Math.min(Number(body.sentencesPerCell) || 10, 50);
  var plan = computeWarmupPlan_(sentencesPerCell);
  var cursor = loadCursor_();
  if (!cursor || isCursorDone_(cursor)) {
    cursor = initCursor_();
    saveStats_({ cached: 0, fresh: 0, errors: 0, processed: 0 });
  }
  cursor.sentencesPerCell = sentencesPerCell;

  var stats = loadStats_();
  var batchResults = [];

  for (var i = 0; i < batchSize && !isCursorDone_(cursor); i++) {
    var payload = buildWarmupPayload_(cursor);
    var label = WARMUP_CEFR[cursor.cefrIdx] + '/' + WARMUP_SHELLS[cursor.shellIdx]
      + '/' + WARMUP_SCENES[cursor.sceneIdx] + '/L' + WARMUP_LEVELS[cursor.levelIdx]
      + '/' + (cursor.sentenceIdx + 1);
    try {
      var result = postToMainAudio_(payload);
      if (result.cached) stats.cached += 1;
      else stats.fresh += 1;
      batchResults.push({ label: label, cached: !!result.cached, hash: result.hash || null });
    } catch (err) {
      stats.errors += 1;
      batchResults.push({ label: label, error: String(err.message || err) });
    }
    stats.processed += 1;
    cursor = advanceCursor_(cursor);
  }

  saveCursor_(cursor);
  saveStats_(stats);

  var processed = isCursorDone_(cursor) ? plan.total : cursorToFlatIndex_(cursor);
  return {
    ok: true,
    done: isCursorDone_(cursor),
    progress: processed,
    total: plan.total,
    percent: plan.total ? Math.round((processed / plan.total) * 100) : 100,
    stats: stats,
    batchResults: batchResults,
  };
}

function resetWarmupProgress_() {
  PropertiesService.getScriptProperties().deleteProperty(CURSOR_KEY);
  PropertiesService.getScriptProperties().deleteProperty(STATS_KEY);
  return { ok: true, reset: true };
}

/** Manual smoke test from the Apps Script editor. */
function warmupCacheSample(options) {
  options = options || {};
  return runWarmupBatch_({
    batchSize: Math.min(Number(options.count) || 3, 10),
    sentencesPerCell: Number(options.sentencesPerCell) || 5,
    mainGasUrl: options.mainGasUrl,
  });
}

/** Bind to a monthly time trigger if desired (runs one small batch per invocation). */
function runScheduledWarmupBatch() {
  return runWarmupBatch_({ batchSize: 10, sentencesPerCell: 10 });
}

function runMonthlyManifestCleanup() {
  throw new Error('Use the main Code.gs deployment for manifest cleanup (audio_cleanup).');
}
