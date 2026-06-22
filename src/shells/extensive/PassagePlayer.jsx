import React from 'react';
import TranslationBlock from '../../components/TranslationBlock.jsx';
import { isDialogueContent } from '../../core/shared/contentLength.js';

export default function PassagePlayer({ item, showScript = true }) {
  const lines = item?.lines || [];
  const showSpeakers = isDialogueContent(item, lines);

  return (
    <div className="passage-player">
      {showScript && (
        <div className="passage-script">
          {lines.map((line, i) => (
            <p key={i} className={showSpeakers ? 'dialogue-line' : 'passage-line'}>
              {showSpeakers && <span className="speaker-tag">{line.speaker}:</span>}
              {line.text}
            </p>
          ))}
          <TranslationBlock translationJa={item.translation_ja} item={item} />
        </div>
      )}
    </div>
  );
}
