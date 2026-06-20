import { DEFAULT_GAS_URL } from '../../lib/config.js';

async function fetchWarmupGas({ warmupGasUrl, action, ...fields }) {
  if (!warmupGasUrl) throw new Error('Warmup GAS URL not configured');

  const res = await fetch(warmupGasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...fields }),
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Warmup GAS returned non-JSON: ${raw.slice(0, 200)}`);
  }
  if (data.error) throw new Error(data.error);
  return data;
}

export async function getWarmupStatus({
  warmupGasUrl,
  sentencesPerCell,
}) {
  return fetchWarmupGas({
    warmupGasUrl,
    action: 'warmup_status',
    sentencesPerCell,
  });
}

export async function runWarmupBatch({
  warmupGasUrl,
  mainGasUrl = DEFAULT_GAS_URL,
  batchSize,
  sentencesPerCell,
}) {
  return fetchWarmupGas({
    warmupGasUrl,
    action: 'warmup_run',
    mainGasUrl,
    batchSize,
    sentencesPerCell,
  });
}

export async function resetWarmupProgress({ warmupGasUrl }) {
  return fetchWarmupGas({
    warmupGasUrl,
    action: 'warmup_reset',
  });
}

export function formatWarmupProgress(status) {
  if (!status) return '—';
  if (status.done) return `100% (${status.total}/${status.total})`;
  return `${status.percent ?? 0}% (${status.progress ?? 0}/${status.total ?? '?'})`;
}
