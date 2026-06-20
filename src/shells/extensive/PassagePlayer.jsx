import React, { useState, useEffect, useRef, useCallback } from 'react';
import Waveform from '../../components/Waveform.jsx';
import TranslationBlock from '../../components/TranslationBlock.jsx';
import ExtensivePlayPauseButton from './ExtensivePlayPauseButton.jsx';
import { passageMediaMetadata } from '../../core/audio/mediaSession.js';

export default function PassagePlayer({
  item, audioUrl, itemId, audioPlayer, showScript = true, onEnded, playbackRate = 1,
  autoPlayAfterMs = 0, onAutoPlayStarted,
}) {
  const lines = item?.lines || [];
  const playedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const attachEndedHandler = useCallback((audio) => {
    if (!audio) return undefined;
    const handler = () => onEndedRef.current?.();
    audio.addEventListener('ended', handler);
    return () => audio.removeEventListener('ended', handler);
  }, []);

  const startPlayback = useCallback(() => {
    const audio = audioPlayer.play(audioUrl, itemId, {
      showProgress: true,
      playbackRate,
      metadata: passageMediaMetadata(item),
    });
    onAutoPlayStarted?.();
    return attachEndedHandler(audio);
  }, [audioUrl, itemId, item, audioPlayer, playbackRate, attachEndedHandler, onAutoPlayStarted]);

  useEffect(() => {
    if (!audioUrl) return;
    const existing = audioPlayer.audioRef?.current;
    if (audioPlayer.activeKey === itemId && existing && !existing.paused && !existing.ended) {
      playedRef.current = true;
      return attachEndedHandler(existing);
    }
    if (playedRef.current) return;
    playedRef.current = true;

    const delay = autoPlayAfterMs > 0 ? autoPlayAfterMs : 0;
    const timer = setTimeout(() => startPlayback(), delay);
    return () => clearTimeout(timer);
  }, [audioUrl, itemId, audioPlayer, autoPlayAfterMs, attachEndedHandler, startPlayback]);

  return (
    <div className="passage-player">
      <div className="audio-stage">
        <div className="audio-controls">
          <ExtensivePlayPauseButton
            itemId={itemId}
            audioPlayer={audioPlayer}
            onPlayStart={() => {
              playedRef.current = true;
              startPlayback();
            }}
          />
        </div>
        <Waveform playing={audioPlayer.playing && audioPlayer.activeKey === itemId} />
      </div>

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
