import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const SLUG = 'abcdefghij12';
const SPREADSHEET_ID = 'sheet-id-with-twenty-chars';

function environmentWithTeam() {
  const data = new Map([[`team:${SLUG}`, JSON.stringify({ spreadsheetId: SPREADSHEET_ID })]]);
  return { TEAMS: { get: async (key, type) => (data.has(key) ? (type === 'json' ? JSON.parse(data.get(key)) : data.get(key)) : null) }, ALLOWED_ORIGINS: 'https://example.test' };
}

function captainRequest(body) {
  return new Request(`https://worker.test/api/team/${SLUG}/captain`, { method: 'POST', body: JSON.stringify(body) });
}

async function askAs(accessToken, driveResponse) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (address, options) => {
    calls.push({ address: String(address), authorization: options.headers.Authorization });
    return driveResponse;
  };
  try {
    const body = await (await worker.fetch(captainRequest({ accessToken }), environmentWithTeam(), {})).json();
    return { body, calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('an editor of the sheet is told which sheet it is, using their own token', async () => {
  const { body, calls } = await askAs('captain-token', Response.json({ capabilities: { canEdit: true } }));
  assert.equal(body.ok, true);
  assert.equal(body.access, 'editor');
  assert.equal(body.spreadsheetId, SPREADSHEET_ID);
  assert.equal(calls[0].authorization, 'Bearer captain-token');
  assert.match(calls[0].address, new RegExp(`/files/${SPREADSHEET_ID}\\?`));
});

test('a signed-in user the app cannot see the sheet for is asked to pick it, without learning its id', async () => {
  const { body } = await askAs('co-captain-token', new Response('{}', { status: 404 }));
  assert.equal(body.ok, true);
  assert.equal(body.access, 'needs-pick');
  assert.equal(body.spreadsheetId, undefined);
});

test('a viewer who cannot edit is refused', async () => {
  const { body } = await askAs('viewer-token', Response.json({ capabilities: { canEdit: false } }));
  assert.equal(body.ok, false);
  assert.match(body.error, /not edit/);
  assert.equal(body.spreadsheetId, undefined);
});

test('a missing token is refused before Google is asked', async () => {
  const { body, calls } = await askAs('', Response.json({}));
  assert.equal(body.ok, false);
  assert.equal(calls.length, 0);
});

test('an unknown team is refused', async () => {
  const request = new Request('https://worker.test/api/team/zzzzzzzzzzzz/captain', { method: 'POST', body: JSON.stringify({ accessToken: 'token' }) });
  const body = await (await worker.fetch(request, environmentWithTeam(), {})).json();
  assert.equal(body.ok, false);
  assert.match(body.error, /not recognized/);
});
