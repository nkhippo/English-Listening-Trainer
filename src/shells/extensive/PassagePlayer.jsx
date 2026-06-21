import React from 'react';
import TranslationBlock from '../../components/TranslationBlock.jsx';

export default function PassagePlayer({ item, showScript = true }) {
  const lines = item?.lines || [];

  return (
    <div className="passage-player">
      {showScript && (
        <div className="passage-script">
          {lines.map((line, i) => (
            <p key={i} className="dialogue-line">
              {lines.length > 1 && <span className="speaker-tag">{line.speaker}:</span>}
              {line.text}
            </p>
          ))}
          <TranslationBlock translationJa={item.translation_ja} />
        </div>
      )}
    </div>
  );
}
