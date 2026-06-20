import React, { useState } from 'react';
import { scoreClozeBlank } from '../../core/scoring/cloze.js';
import { UI } from '../../core/shared/uiJa.js';

export default function ClozeView({ item, onFinish }) {
  const lines = item.lines || [{ speaker: 'A', text: item.sentence }];
  const blanks = item.blanks || [];
  const [inputs, setInputs] = useState(() => blanks.map(() => ''));

  function submit() {
    const results = blanks.map((b, i) => ({
      expected: b.answer,
      user: inputs[i],
      hint: b.hint,
      correct: scoreClozeBlank(inputs[i], b.answer),
    }));
    onFinish({ kind: 'cloze', results });
  }

  const blanksRemaining = [...blanks.map((b, i) => ({ ...b, originalIdx: i }))];

  return (
    <>
      <div className="cloze-line" style={{ marginBottom: 24 }}>
        {lines.map((line, lineIdx) => (
          <div className="dialogue-line" key={lineIdx}>
            {lines.length > 1 && <span className="speaker-tag">{line.speaker}:</span>}
            {renderClozeLine(line.text, blanksRemaining, inputs, setInputs, lines.length > 1 ? lineIdx : null)}
          </div>
        ))}
      </div>
      <button className="btn" onClick={submit} disabled={inputs.some((v) => !v.trim())}>
        {UI.intensive.checkAnswer}
      </button>
    </>
  );
}

function renderClozeLine(text, blanksRemaining, inputs, setInputs, lineKeyPrefix) {
  const tokens = [];
  let remaining = text;

  while (remaining.length > 0) {
    let matched = false;
    const lower = remaining.toLowerCase();
    for (let i = 0; i < blanksRemaining.length; i++) {
      const ans = blanksRemaining[i].answer.toLowerCase();
      const ws = lower.match(/^\s*/)[0];
      const after = lower.slice(ws.length);
      if (after.startsWith(ans)) {
        const endChar = after.charAt(ans.length);
        if (!endChar || /[\s.,!?;:'"]/.test(endChar)) {
          if (ws) tokens.push({ type: 'text', value: ws });
          tokens.push({ type: 'blank', blankIdx: blanksRemaining[i].originalIdx });
          remaining = remaining.slice(ws.length + ans.length);
          blanksRemaining.splice(i, 1);
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      const nextSpace = remaining.search(/\s/);
      if (nextSpace === -1) {
        tokens.push({ type: 'text', value: remaining });
        remaining = '';
      } else {
        tokens.push({ type: 'text', value: remaining.slice(0, nextSpace + 1) });
        remaining = remaining.slice(nextSpace + 1);
      }
    }
  }

  return tokens.map((t, idx) => {
    if (t.type === 'text') return <span key={`${lineKeyPrefix}-t${idx}`}>{t.value}</span>;
    return (
      <input
        key={`${lineKeyPrefix}-b${t.blankIdx}`}
        className="cloze-blank"
        value={inputs[t.blankIdx]}
        onChange={(e) => {
          const next = [...inputs];
          next[t.blankIdx] = e.target.value;
          setInputs(next);
        }}
        placeholder="___"
        autoComplete="off"
        spellCheck="false"
      />
    );
  });
}
