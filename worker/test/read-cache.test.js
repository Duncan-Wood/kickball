import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { encryptToken } from '../src/tokens.js';

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const SLUG = 'abcdefghij12';

async function environmentWithTeam() {
  const refreshToken = await encryptToken('refresh', ENCRYPTION_KEY);
  const stored = JSON.stringify({ spreadsheetId: 'sheet-id-with-twenty-chars', refreshToken, connectedAt: 'then' });
  return {
    TEAMS: { get: async (key, type) => (key === `team:${SLUG}` ? (type === 'json' ? JSON.parse(stored) : stored) : null), delete: async () => {} },
    TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
    ALLOWED_ORIGINS: 'https://example.test',
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
  };
}

function fakeEdgeCache() {
  const entries = new Map();
  return {
    forget: (kind) => entries.delete(`https://cache.invalid/${kind}/${SLUG}`),
    default: {
      match: async (request) => (entries.has(request.url) ? new Response(entries.get(request.url)) : undefined),
      put: async (request, response) => { entries.set(request.url, await response.text()); },
    },
  };
}

function sheetAnswer(titles) {
  return { properties: { timeZone: 'America/New_York' }, sheets: titles.map((title) => ({ properties: { title }, data: [{ rowData: [] }] })) };
}

async function withGoogle(sheetsHandler, work) {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const edgeCache = fakeEdgeCache();
  const sheetsCalls = [];
  globalThis.caches = edgeCache;
  globalThis.fetch = async (address) => {
    if (String(address).includes('oauth2')) return Response.json({ access_token: 'access' });
    sheetsCalls.push(String(address));
    return sheetsHandler(sheetsCalls.length);
  };
  try {
    return await work({ edgeCache, sheetsCalls });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
}

const teamRequest = () => new Request(`https://worker.test/api/team/${SLUG}`);
const settle = () => new Promise((resolve) => setImmediate(resolve));
const context = () => ({ pending: [], waitUntil(promise) { this.pending.push(promise); } });

async function read(environment) {
  const requestContext = context();
  const body = await (await worker.fetch(teamRequest(), environment, requestContext)).json();
  await Promise.all(requestContext.pending);
  return body;
}

test('simultaneous requests for one team share a single Google read', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(() => Response.json(sheetAnswer([])), async ({ sheetsCalls }) => {
    const bodies = await Promise.all([read(environment), read(environment), read(environment)]);
    assert.ok(bodies.every((body) => body.ok === true));
    assert.equal(sheetsCalls.length, 2);
  });
});

test('a fresh cached read is served without asking Google again', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(() => Response.json(sheetAnswer([])), async ({ sheetsCalls }) => {
    const first = await read(environment);
    const second = await read(environment);
    assert.equal(sheetsCalls.length, 2);
    assert.equal(second.readAt, first.readAt);
  });
});

test('when Google limits reads, the last good lineup is served with its original read time', async () => {
  const environment = await environmentWithTeam();
  await withGoogle((callNumber) => (callNumber <= 2 ? Response.json(sheetAnswer([])) : new Response('{}', { status: 429 })), async ({ edgeCache, sheetsCalls }) => {
    const first = await read(environment);
    edgeCache.forget('team');
    const second = await read(environment);
    assert.equal(second.ok, true);
    assert.equal(second.readAt, first.readAt);
    edgeCache.forget('team');
    await read(environment);
    assert.equal(sheetsCalls.length, 3);
  });
});

test('when Google limits reads and nothing was cached, the page is told to wait', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(() => new Response('{}', { status: 429 }), async () => {
    const body = await read(environment);
    assert.equal(body.ok, false);
    assert.match(body.error, /limiting reads/);
  });
});

test('other Google failures are not hidden behind the cached lineup', async () => {
  const environment = await environmentWithTeam();
  await withGoogle((callNumber) => (callNumber <= 2 ? Response.json(sheetAnswer([])) : new Response('{}', { status: 500 })), async ({ edgeCache }) => {
    await read(environment);
    edgeCache.forget('team');
    await settle();
    const body = await read(environment);
    assert.equal(body.ok, false);
    assert.match(body.error, /500/);
  });
});
