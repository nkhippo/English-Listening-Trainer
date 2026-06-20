// Deployed GAS endpoints (Web App). Safe to commit — no secrets in these URLs.
export const DEFAULT_GAS_URL =
  'https://script.google.com/macros/s/AKfycbwo3MV0MPJeFUJCMw3iqyIZvmexsg3MXxITN2Gh7OYfb2O5j6iS79Yhhx4uh7J3bUuL/exec';

/** Standalone warmup batch deployment (gas/warmup/Code.gs). */
export const DEFAULT_WARMUP_GAS_URL =
  'https://script.google.com/macros/s/AKfycbzET3EXBL1owWUCrTSaDNW8RMH3ngk3TetmSxoPvZ-SY_Tjalx_7sFrJTrobW0VK4Lx/exec';

/** Default sentences cached per CEFR × shell × scene × level cell. */
export const WARMUP_SENTENCES_PER_CELL = 10;

/** Items processed per warmup API call (stay under GAS 6-minute limit). */
export const WARMUP_BATCH_SIZE = 8;
