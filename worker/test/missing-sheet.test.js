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

async function withGoogleAnswering(sheetsStatus, work) {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  globalThis.fetch = async (address) => (String(address).includes('oauth2') ? Response.json({ access_token: 'access' }) : new Response('{}', { status: sheetsStatus }));
  try {
    return await work();
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
}

const teamRequest = () => new Request(`https://worker.test/api/team/${SLUG}`);
const disconnectRequest = () => new Request('https://worker.test/api/disconnect', { method: 'POST', body: JSON.stringify({ pendingId: PENDING_ID, slug: SLUG }) });
const noContext = { waitUntil: () => {} };

test('a deleted sheet removes the team record and tells the page it is gone', async () => {
  const environment = await environmentWithTeam();
  const body = await withGoogleAnswering(404, async () => (await worker.fetch(teamRequest(), environment, noContext)).json());
  assert.equal(body.ok, false);
  assert.equal(body.gone, true);
  assert.match(body.error, /sheet was deleted/);
  assert.equal(environment.TEAMS.data.has(`team:${SLUG}`), false);
});

test('a sheet Google refuses to open keeps the team record', async () => {
  const environment = await environmentWithTeam();
  const body = await withGoogleAnswering(403, async () => (await worker.fetch(teamRequest(), environment, noContext)).json());
  assert.equal(body.ok, false);
  assert.equal(body.gone, undefined);
  assert.equal(environment.TEAMS.data.has(`team:${SLUG}`), true);
});

test('stop sharing works once the sheet is deleted and says the sheet is gone', async () => {
  const environment = await environmentWithTeam();
  const body = await withGoogleAnswering(404, async () => (await worker.fetch(disconnectRequest(), environment, noContext)).json());
  assert.equal(body.ok, true);
  assert.equal(body.sheetGone, true);
  assert.equal(environment.TEAMS.data.has(`team:${SLUG}`), false);
  assert.equal(environment.TEAMS.data.has(`pending:${PENDING_ID}`), false);
});

test('reconnecting a deleted sheet removes the team record and fails', async () => {
  const environment = await environmentWithTeam();
  const request = new Request('https://worker.test/api/reconnect', { method: 'POST', body: JSON.stringify({ pendingId: PENDING_ID, slug: SLUG }) });
  const body = await withGoogleAnswering(404, async () => (await worker.fetch(request, environment, noContext)).json());
  assert.equal(body.ok, false);
  assert.equal(body.gone, true);
  assert.equal(environment.TEAMS.data.has(`team:${SLUG}`), false);
});
