import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { encryptToken } from '../src/tokens.js';

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const SLUG = 'abcdefghij12';
const PENDING_ID = 'pendingpend1';

function fakeStore(entries) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    get: async (key, type) => (data.has(key) ? (type === 'json' ? JSON.parse(data.get(key)) : data.get(key)) : null),
    put: async (key, value) => { data.set(key, value); },
    delete: async (key) => { data.delete(key); },
  };
}

async function environmentWithTeam() {
  const refreshToken = await encryptToken('refresh', ENCRYPTION_KEY);
  const teams = fakeStore({
    [`team:${SLUG}`]: JSON.stringify({ spreadsheetId: 'sheet-id-with-twenty-chars', refreshToken, connectedAt: 'then' }),
    [`pending:${PENDING_ID}`]: refreshToken,
  });
  return { TEAMS: teams, TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY, ALLOWED_ORIGINS: 'https://example.test', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
}

function disconnectRequest() {
  return new Request('https://worker.test/api/disconnect', { method: 'POST', body: JSON.stringify({ pendingId: PENDING_ID, slug: SLUG }) });
}

test('disconnect deletes the team record once the sheet can be read', async () => {
  const environment = await environmentWithTeam();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (address) => (String(address).includes('oauth2')
    ? Response.json({ access_token: 'access' })
    : Response.json({ properties: { timeZone: 'America/New_York' }, sheets: [] }));
  try {
    const body = await (await worker.fetch(disconnectRequest(), environment, {})).json();
    assert.equal(body.ok, true);
    assert.equal(environment.TEAMS.data.has(`team:${SLUG}`), false);
    assert.equal(environment.TEAMS.data.has(`pending:${PENDING_ID}`), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('disconnect keeps the team record when the sheet cannot be read', async () => {
  const environment = await environmentWithTeam();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (address) => (String(address).includes('oauth2')
    ? Response.json({ access_token: 'access' })
    : new Response('{}', { status: 403 }));
  try {
    const body = await (await worker.fetch(disconnectRequest(), environment, {})).json();
    assert.equal(body.ok, false);
    assert.equal(environment.TEAMS.data.has(`team:${SLUG}`), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
