import React from 'react';
import { splitTranslationLines } from '../core/shared/translationJa.js';

export default function TranslationBlock({ translationJa, className = 'passage-translation' }) {
  if (!translationJa) return null;

  const lines = splitTranslationLines(translationJa);
  if (lines.length <= 1) {
    return <p className={className}>{translationJa}</p>;
  }

  return (
    <div className={className}>
      {lines.map((line, i) => {
        const match = line.match(/^([AB]):\s*(.+)$/);
        if (match) {
          return (
            <p key={i} className="dialogue-line">
              <span className="speaker-tag">{match[1]}:</span>
              {match[2]}
            </p>
          );
        }
        return <p key={i} className="dialogue-line">{line}</p>;
      })}
    </div>
  );
}
