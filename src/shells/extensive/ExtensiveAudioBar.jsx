import React from 'react';
import Waveform from '../../components/Waveform.jsx';
import ExtensivePlayPauseButton from './ExtensivePlayPauseButton.jsx';
import { usePassagePlayback } from './usePassagePlayback.js';

export default function ExtensiveAudioBar({
  item, audioUrl, itemId, audioPlayer, playbackRate = 1,
  onEnded, autoPlayAfterMs = 0, onAutoPlayStarted,
}) {
  const { startPlayback, playedRef } = usePassagePlayback({
    audioUrl,
    itemId,
    item,
    audioPlayer,
    playbackRate,
    onEnded,
    autoPlayAfterMs,
    onAutoPlayStarted,
  });

  return (
    <div className="passage-transport-play">
      <ExtensivePlayPauseButton
        itemId={itemId}
        audioPlayer={audioPlayer}
        onPlayStart={() => {
          playedRef.current = true;
          startPlayback();
        }}
      />
      <Waveform playing={audioPlayer.playing && audioPlayer.activeKey === itemId} />
    </div>
  );
}
