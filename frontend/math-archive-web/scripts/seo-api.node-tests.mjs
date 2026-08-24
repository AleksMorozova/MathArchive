import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchDocuments, TransientSeoApiError } from './seo-api.mjs';

const apiBaseUrl = 'https://example.test';
const documentPayload = { items: [{ id: 'document-1', title: 'Алгебра' }] };

test('returns documents after a successful response', async () => {
  const fetchImpl = mockFetch([response(200, documentPayload)]);

  const documents = await fetchDocuments({ apiBaseUrl, fetchImpl });

  assert.deepEqual(documents, documentPayload.items);
  assert.equal(fetchImpl.calls, 1);
});

test('retries a transient 502 and then succeeds', async () => {
  const fetchImpl = mockFetch([response(502), response(200, documentPayload)]);
  const delays = [];
  const warnings = [];

  const documents = await fetchDocuments({
    apiBaseUrl,
    fetchImpl,
    sleep: async (delay) => delays.push(delay),
    logger: { warn: (message) => warnings.push(message) }
  });

  assert.deepEqual(documents, documentPayload.items);
  assert.equal(fetchImpl.calls, 2);
  assert.deepEqual(delays, [1000]);
  assert.match(warnings[0], /attempt 1 of 3 failed with HTTP 502/);
  assert.doesNotMatch(warnings[0], /example\.test/);
});

test('classifies exhausted transient responses for best-effort generation', async () => {
  const fetchImpl = mockFetch([response(502), response(502), response(502)]);
  const delays = [];

  await assert.rejects(
    fetchDocuments({
      apiBaseUrl,
      fetchImpl,
      sleep: async (delay) => delays.push(delay),
      logger: { warn: () => {} }
    }),
    (error) => error instanceof TransientSeoApiError && /API returned HTTP 502 after 3 attempts/.test(error.message)
  );

  assert.equal(fetchImpl.calls, 3);
  assert.deepEqual(delays, [1000, 3000]);
});

test('fails immediately for a permanent 404 response', async () => {
  const fetchImpl = mockFetch([response(404)]);
  let warningCount = 0;

  await assert.rejects(
    fetchDocuments({
      apiBaseUrl,
      fetchImpl,
      sleep: async () => assert.fail('404 must not be retried'),
      logger: { warn: () => warningCount++ }
    }),
    /API returned HTTP 404$/
  );

  assert.equal(fetchImpl.calls, 1);
  assert.equal(warningCount, 0);
});

test('retries a network failure and rejects invalid payloads without retrying', async () => {
  const networkFetch = mockFetch([new TypeError('fetch failed'), response(200, documentPayload)]);
  const invalidPayloadFetch = mockFetch([response(200, { documents: [] })]);

  const documents = await fetchDocuments({
    apiBaseUrl,
    fetchImpl: networkFetch,
    sleep: async () => {},
    logger: { warn: () => {} }
  });
  assert.deepEqual(documents, documentPayload.items);
  assert.equal(networkFetch.calls, 2);

  await assert.rejects(
    fetchDocuments({ apiBaseUrl, fetchImpl: invalidPayloadFetch }),
    /invalid document payload/
  );
  assert.equal(invalidPayloadFetch.calls, 1);
});

function response(status, payload = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function mockFetch(results) {
  let calls = 0;
  const fetchImpl = async () => {
    const result = results[calls++];
    if (result instanceof Error) {
      throw result;
    }
    return result;
  };
  Object.defineProperty(fetchImpl, 'calls', { get: () => calls });
  return fetchImpl;
}
