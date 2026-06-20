import { normalize } from './normalize.js';

function tokenize(text) {
  return normalize(text).split(' ').filter(Boolean);
}

export function compareWithScript(recognizedText, expectedText) {
  const expected = tokenize(expectedText);
  const recognized = tokenize(recognizedText);

  const perWord = expected.map((word, i) => {
    const rec = recognized[i] ?? null;
    const matched = rec !== null && rec === word;
    return { expected: word, recognized: rec, matched };
  });

  const matchedCount = perWord.filter((w) => w.matched).length;
  const matchScore = expected.length ? matchedCount / expected.length : 0;

  return {
    recognized_text: recognizedText,
    match_score: matchScore,
    per_word: perWord,
  };
}

/**
 * Live Web Speech API recognition (Chrome / Safari).
 */
export function createSpeechRecognizer({ onResult, onError, onEnd }) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = '';

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const part = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) finalTranscript += `${part} `;
      else interim += part;
    }
    onResult?.({ final: finalTranscript.trim(), interim, text: `${finalTranscript}${interim}`.trim() });
  };

  recognition.onerror = (event) => onError?.(new Error(event.error || 'Recognition failed'));
  recognition.onend = () => onEnd?.(finalTranscript.trim());

  return { recognition, getTranscript: () => finalTranscript.trim() };
}

export async function compareWithScriptFromBlob(audioBlob, expectedText) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    throw new Error('Web Speech API not supported in this browser');
  }

  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(audioBlob);
    audio.src = url;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    let transcript = '';

    recognition.onresult = (event) => {
      transcript = event.results[0]?.[0]?.transcript || '';
    };

    recognition.onerror = (event) => {
      URL.revokeObjectURL(url);
      reject(new Error(event.error || 'Recognition failed'));
    };

    recognition.onend = () => {
      URL.revokeObjectURL(url);
      resolve(compareWithScript(transcript, expectedText));
    };

    audio.onplay = () => recognition.start();
    audio.onended = () => {
      setTimeout(() => {
        try { recognition.stop(); } catch { /* noop */ }
      }, 400);
    };
    audio.play().catch((err) => {
      URL.revokeObjectURL(url);
      reject(err);
    });
  });
}

const STAGE_THRESHOLD = 0.8;

export function isStageComplete(matchScore) {
  return matchScore >= STAGE_THRESHOLD;
}

export { STAGE_THRESHOLD };
