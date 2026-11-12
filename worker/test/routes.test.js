import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { decryptToken } from '../src/tokens.js';
import { ALLOWED_ORIGIN, ENCRYPTION_KEY, SLUG, SPREADSHEET_ID, environmentWithTeam, googleWithLineups, noContext, withGoogle } from './support.js';

const post = (path, body, origin = ALLOWED_ORIGIN) => new Request(`https://worker.test${path}`, { method: 'POST', headers: { Origin: origin }, body: JSON.stringify(body) });
const answer = async (request, environment) => (await worker.fetch(request, environment, noContext)).json();

test('a listed origin is echoed back and an unlisted origin is not', async () => {
  const environment = await environmentWithTeam();
  const listed = await worker.fetch(new Request('https://worker.test/api/signin', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8766' } }), environment, noContext);
  assert.equal(listed.status, 204);
  assert.equal(listed.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8766');
  const unlisted = await worker.fetch(new Request('https://worker.test/api/signin', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } }), environment, noContext);
  assert.equal(unlisted.headers.get('Access-Control-Allow-Origin'), ALLOWED_ORIGIN);
});

test('unknown paths and malformed team codes are 404s that still carry the API version', async () => {
  const environment = await environmentWithTeam();
  for (const path of ['/', '/api/nothing', '/api/team/short', '/api/team/ABCDEFGHIJ12', '/api/team/abcdefghij12/extra']) {
    const response = await worker.fetch(new Request(`https://worker.test${path}`), environment, noContext);
    const body = await response.json();
    assert.equal(response.status, 404, path);
    assert.equal(body.ok, false);
    assert.equal(typeof body.apiVersion, 'number');
  }
});

test('a team code nobody connected is refused without calling Google', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(googleWithLineups([]), async (calls) => {
    const body = await answer(new Request('https://worker.test/api/team/zzzzzzzzzzzz'), environment);
    assert.equal(body.ok, false);
    assert.match(body.error, /not recognized/);
    assert.equal(body.unknown, true);
    assert.equal(calls.length, 0);
  });
});

test('signing in stores only an encrypted refresh token and hands back the access token', async () => {
  const environment = await environmentWithTeam();
  const google = (call) => (call.address.includes('oauth2') ? Response.json({ access_token: 'access', refresh_token: 'refresh-from-google' }) : undefined);
  await withGoogle(google, async () => {
    const body = await answer(post('/api/signin', { code: 'auth-code' }), environment);
    assert.equal(body.ok, true);
    assert.equal(body.accessToken, 'access');
    const stored = environment.TEAMS.data.get(`pending:${body.pendingId}`);
    assert.equal(stored.includes('refresh-from-google'), false);
    assert.equal(await decryptToken(stored, ENCRYPTION_KEY), 'refresh-from-google');
  });
});

test('signing in without a code, or when Google sends no refresh token, is refused', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(() => Response.json({ access_token: 'access' }), async () => {
    assert.match((await answer(post('/api/signin', {}), environment)).error, /Missing sign-in code/);
    assert.match((await answer(post('/api/signin', { code: 'auth-code' }), environment)).error, /long-lived sign-in/);
  });
});

test('connecting needs a live sign-in and a plausible sheet id', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(googleWithLineups([]), async (calls) => {
    assert.match((await answer(post('/api/connect', { pendingId: 'nope', spreadsheetId: SPREADSHEET_ID }), environment)).error, /Missing sign-in or sheet/);
    assert.match((await answer(post('/api/connect', { pendingId: 'pendingpend1', spreadsheetId: SPREADSHEET_ID }), environment)).error, /expired/);
    assert.equal(calls.length, 0);
  });
});

test('connecting a readable sheet creates a team, spends the sign-in and returns a new code', async () => {
  const environment = await environmentWithTeam();
  const refreshToken = environment.TEAMS.data.get(`team:${SLUG}`) && JSON.parse(environment.TEAMS.data.get(`team:${SLUG}`)).refreshToken;
  await environment.TEAMS.put('pending:pendingpend1', refreshToken);
  await withGoogle(googleWithLineups(['Game 1 Lineup']), async () => {
    const body = await answer(post('/api/connect', { pendingId: 'pendingpend1', spreadsheetId: SPREADSHEET_ID }), environment);
    assert.equal(body.ok, true);
    assert.match(body.slug, /^[a-hjkmnp-z2-9]{12}$/);
    assert.equal(JSON.parse(environment.TEAMS.data.get(`team:${body.slug}`)).spreadsheetId, SPREADSHEET_ID);
    assert.equal(environment.TEAMS.data.has('pending:pendingpend1'), false);
  });
});

test('an expired Google connection tells the page to offer a reconnect', async () => {
  const environment = await environmentWithTeam();
  const google = (call) => (call.address.includes('oauth2') ? Response.json({ error: 'invalid_grant' }, { status: 400 }) : undefined);
  await withGoogle(google, async () => {
    const body = await answer(new Request(`https://worker.test/api/team/${SLUG}`), environment);
    assert.equal(body.ok, false);
    assert.equal(body.reconnect, true);
  });
});

test('asking for one tab returns just that lineup, and an unknown tab is refused', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(googleWithLineups(['Game 1 Lineup']), async () => {
    const found = await answer(new Request(`https://worker.test/api/team/${SLUG}?tab=${encodeURIComponent('Game 1 Lineup')}`), environment);
    assert.equal(found.lineup.tabName, 'Game 1 Lineup');
    assert.equal(found.lineups, undefined);
    const missing = await answer(new Request(`https://worker.test/api/team/${SLUG}?tab=Roster`), environment);
    assert.match(missing.error, /no longer a current lineup tab/);
  });
});

test('only lineup tabs and the config are requested from the sheet', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(googleWithLineups(['Game 1 Lineup', 'Roster', 'Comments']), async (calls) => {
    await answer(new Request(`https://worker.test/api/team/${SLUG}`), environment);
    const detail = decodeURIComponent(calls.find((call) => call.address.includes('includeGridData')).address);
    assert.match(detail, /ranges='Game\+1\+Lineup'/);
    assert.doesNotMatch(detail, /ranges='Roster'|ranges='Comments'/);
  });
});
