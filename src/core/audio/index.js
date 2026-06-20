export {
  fetchTTS,
  base64ToAudioUrl,
  resolveAudioUrl,
  normalizeItem,
  resolveItemAudio,
  generateCustomSpeechTtsInstructions,
  buildCustomSpeechTtsInstructions,
} from './ttsClient.js';
export { fetchAudio, computeCacheHash, computeAudioCacheKey } from './driveCache.js';
export {
  recordAudioFetch,
  getLastAudioFetch,
  describeAudioSource,
  verifyDriveAudioCache,
  fetchAudioManifestStats,
  runAudioManifestCleanup,
} from './audioCacheStatus.js';
