import React from 'react';

/**
 * Signature visual: a row of bars that pulse only while audio is playing.
 * Quiet by default; the only colored moment in the UI.
 */
export default function Waveform({ playing }) {
  const bars = 8;
  return (
    <div className={`wave ${playing ? 'playing' : ''}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <div key={i} className="wave-bar" style={{ height: playing ? 18 : 6 }} />
      ))}
    </div>
  );
}
