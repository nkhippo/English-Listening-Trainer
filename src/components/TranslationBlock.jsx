import React from 'react';
import { splitTranslationLines } from '../core/shared/translationJa.js';
import { isDialogueContent } from '../core/shared/contentLength.js';

export default function TranslationBlock({ translationJa, item, className = 'passage-translation' }) {
  if (!translationJa) return null;

  const lines = splitTranslationLines(translationJa);
  const showSpeakers = isDialogueContent(item);
  if (lines.length <= 1) {
    return <p className={className}>{translationJa}</p>;
  }

  return (
    <div className={className}>
      {lines.map((line, i) => {
        const match = showSpeakers ? line.match(/^([AB]):\s*(.+)$/) : null;
        if (match) {
          return (
            <p key={i} className="dialogue-line">
              <span className="speaker-tag">{match[1]}:</span>
              {match[2]}
            </p>
          );
        }
        return <p key={i} className="passage-line">{line}</p>;
      })}
    </div>
  );
}
