import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { SLUG, environmentWithTeam, googleWithLineups, withGoogle } from './support.js';

const context = () => ({ pending: [], waitUntil(promise) { this.pending.push(promise); } });

function googleAnswering(state, captainCanEdit) {
  return googleWithLineups([], (call) => {
    if (call.address.includes('googleapis.com/drive') && call.authorization === 'Bearer captain-token') {
      return captainCanEdit === null ? new Response('{}', { status: 404 }) : Response.json({ capabilities: { canEdit: captainCanEdit } });
    }
    if (call.address.includes('googleapis.com/drive')) return Response.json({ trashed: false });
    if (call.address.includes('sheets.googleapis.com')) return googleWithLineups(state.titles)(call);
    return undefined;
  });
}

async function readAs(request, environment) {
  const requestContext = context();
  const body = await (await worker.fetch(request, environment, requestContext)).json();
  await Promise.all(requestContext.pending);
  return body;
}

const teamRead = () => new Request(`https://worker.test/api/team/${SLUG}`);
const freshRead = (accessToken) => new Request(`https://worker.test/api/team/${SLUG}/fresh`, { method: 'POST', body: JSON.stringify({ accessToken }) });
const tabNames = (body) => body.lineups.map((lineup) => lineup.tabName);

test('an editor gets a fresh read past the cache, and players then see it too', async () => {
  const environment = await environmentWithTeam();
  const state = { titles: ['Game 1 Lineup'] };
  await withGoogle(googleAnswering(state, true), async () => {
    assert.deepEqual(tabNames(await readAs(teamRead(), environment)), ['Game 1 Lineup']);
    state.titles = ['Opening Day Lineup'];
    assert.deepEqual(tabNames(await readAs(teamRead(), environment)), ['Game 1 Lineup']);
    const fresh = await readAs(freshRead('captain-token'), environment);
    assert.equal(fresh.ok, true);
    assert.deepEqual(tabNames(fresh), ['Opening Day Lineup']);
    assert.deepEqual(tabNames(await readAs(teamRead(), environment)), ['Opening Day Lineup']);
  });
});

test('a viewer cannot ask for a fresh read', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(googleAnswering({ titles: ['Game 1 Lineup'] }, false), async (calls) => {
    const body = await readAs(freshRead('captain-token'), environment);
    assert.equal(body.ok, false);
    assert.match(body.error, /not edit/);
    assert.equal(calls.some((call) => call.address.includes('sheets.googleapis.com')), false);
  });
});

test('a fresh read needs a sign-in that has picked the team sheet', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(googleAnswering({ titles: ['Game 1 Lineup'] }, null), async (calls) => {
    const body = await readAs(freshRead('captain-token'), environment);
    assert.equal(body.ok, false);
    assert.match(body.error, /pick the team sheet/);
    assert.equal(calls.some((call) => call.address.includes('sheets.googleapis.com')), false);
  });
  await withGoogle(googleAnswering({ titles: ['Game 1 Lineup'] }, true), async (calls) => {
    const body = await readAs(freshRead(''), environment);
    assert.equal(body.ok, false);
    assert.equal(calls.length, 0);
  });
});
