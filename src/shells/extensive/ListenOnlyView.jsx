import React, { useState } from 'react';
import TranslationBlock from '../../components/TranslationBlock.jsx';
import { UI } from '../../core/shared/uiJa.js';

export default function ListenOnlyView({ item }) {
  const [showTranslation, setShowTranslation] = useState(false);

  return (
    <div className="listen-only-view" onClick={() => setShowTranslation((v) => !v)}>
      <p className="field-hint">{UI.extensive.tapTranslation}{showTranslation ? UI.extensive.hide : UI.extensive.show}</p>
      {showTranslation && (
        <TranslationBlock translationJa={item.translation_ja} item={item} />
      )}
    </div>
  );
}
