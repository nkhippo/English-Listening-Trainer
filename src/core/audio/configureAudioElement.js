/** iOS Safari: inline + background-friendly audio element setup. */
export function configureAudioElement(audio) {
  if (!audio) return;
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
}
