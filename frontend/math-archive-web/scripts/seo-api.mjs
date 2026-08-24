const transientStatusCodes = new Set([502, 503, 504]);
const defaultRetryDelays = [1000, 3000];

export class TransientSeoApiError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'TransientSeoApiError';
  }
}

export async function fetchDocuments({
  apiBaseUrl,
  fetchImpl = fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  retryDelays = defaultRetryDelays,
  requestTimeoutMs = 10000,
  logger = console
}) {
  const totalAttempts = retryDelays.length + 1;
  const requestUrl = `${apiBaseUrl}/api/documents?page=1&pageSize=1000`;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    let response;

    try {
      response = await fetchImpl(requestUrl, {
        signal: AbortSignal.timeout(requestTimeoutMs),
        headers: { Accept: 'application/json' }
      });
    } catch (error) {
      if (attempt === totalAttempts) {
        throw createTransientError(`${describeRequestFailure(error)} after ${totalAttempts} attempts`, error);
      }

      await retryAfter({
        attempt,
        totalAttempts,
        delay: retryDelays[attempt - 1],
        reason: describeRequestFailure(error),
        logger,
        sleep
      });
      continue;
    }

    if (transientStatusCodes.has(response.status)) {
      if (attempt === totalAttempts) {
        throw createTransientError(`API returned HTTP ${response.status} after ${totalAttempts} attempts`);
      }

      await retryAfter({
        attempt,
        totalAttempts,
        delay: retryDelays[attempt - 1],
        reason: `HTTP ${response.status}`,
        logger,
        sleep
      });
      continue;
    }

    if (!response.ok) {
      throw createFinalError(`API returned HTTP ${response.status}`);
    }

    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw createFinalError('API returned invalid JSON', error);
    }

    if (!result || typeof result !== 'object' || !Array.isArray(result.items)) {
      throw createFinalError('API returned an invalid document payload');
    }

    return result.items;
  }

  throw createFinalError('API request failed unexpectedly');
}

async function retryAfter({ attempt, totalAttempts, delay, reason, logger, sleep }) {
  logger.warn(
    `SEO API request attempt ${attempt} of ${totalAttempts} failed with ${reason}; retrying in ${delay} ms.`
  );
  await sleep(delay);
}

function describeRequestFailure(error) {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    ? 'a request timeout'
    : 'a temporary network error';
}

function createFinalError(message, cause) {
  return new Error(`Unable to generate material pages from the public API: ${message}`, cause ? { cause } : undefined);
}

function createTransientError(message, cause) {
  return new TransientSeoApiError(
    `Unable to generate material pages from the public API: ${message}`,
    cause ? { cause } : undefined
  );
}
