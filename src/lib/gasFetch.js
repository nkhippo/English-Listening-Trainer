// Serialized GAS Web App fetch with retry for transient network errors.

let queue = Promise.resolve();

function isRetryableGasError(err) {
  const msg = String(err?.message || err).toLowerCase();
  return msg.includes('failed to fetch')
    || msg.includes('network')
    || msg.includes('load failed')
    || msg.includes('connection refused')
    || msg.includes('connection');
}

function formatGasNetworkError() {
  return '音声サーバーに接続できません。ネットワークを確認して再試行してください。';
}

async function gasFetchOnce(gasUrl, body, { retries = 2, nonJsonLabel = 'GAS' } = {}) {
  if (!gasUrl) throw new Error('GAS endpoint URL not configured');

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });

      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`${nonJsonLabel} returned non-JSON: ${raw.slice(0, 200)}`);
      }
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetryableGasError(err)) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        continue;
      }
      break;
    }
  }

  if (isRetryableGasError(lastErr)) {
    throw new Error(formatGasNetworkError());
  }
  throw lastErr;
}

/** POST JSON to a GAS Web App. Requests are serialized to avoid overload. */
export async function gasFetch(gasUrl, body, options = {}) {
  const run = () => gasFetchOnce(gasUrl, body, options);
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}
