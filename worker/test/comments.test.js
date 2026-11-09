import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { COMMENTS_PER_HOUR } from '../src/comments.js';
import { SLUG, environmentWithTeam, googleWithLineups, noContext, withGoogle } from './support.js';

const TAB = 'Game 1 Lineup';
const comment = (tab, text) => new Request(`https://worker.test/api/team/${SLUG}/comment`, { method: 'POST', body: JSON.stringify({ action: 'comment', tab, text }) });
const send = async (environment, tab, text) => (await worker.fetch(comment(tab, text), environment, noContext)).json();
const appends = (calls) => calls.filter((call) => call.method === 'POST' && call.address.includes(':append'));

test('a suggestion is appended to the Comments tab with the game name and no author', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(googleWithLineups([TAB]), async (calls) => {
    const body = await send(environment, TAB, '  Try Dana at short  ');
    assert.equal(body.ok, true);
    const [row] = JSON.parse(appends(calls)[0].body).values;
    assert.equal(row.length, 3);
    assert.deepEqual(row.slice(1), ['Game 1', 'Try Dana at short']);
  });
});

test('empty, oversized and wrong-tab suggestions never reach the sheet', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(googleWithLineups([TAB, 'Roster']), async (calls) => {
    assert.match((await send(environment, TAB, '   ')).error, /empty/);
    assert.match((await send(environment, TAB, 'x'.repeat(1001))).error, /longer than 1000/);
    assert.match((await send(environment, 'Roster', 'hi')).error, /no longer a current lineup tab/);
    assert.equal(appends(calls).length, 0);
  });
});

test('a bad action is refused', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(googleWithLineups([TAB]), async () => {
    const request = new Request(`https://worker.test/api/team/${SLUG}/comment`, { method: 'POST', body: JSON.stringify({ action: 'delete', tab: TAB, text: 'hi' }) });
    assert.match((await (await worker.fetch(request, environment, noContext)).json()).error, /Unknown action/);
  });
});

test('suggestions beyond the hourly limit are refused without writing to the sheet', async () => {
  const environment = await environmentWithTeam();
  await withGoogle(googleWithLineups([TAB]), async (calls) => {
    for (let count = 0; count < COMMENTS_PER_HOUR; count += 1) assert.equal((await send(environment, TAB, `note ${count}`)).ok, true);
    const refused = await send(environment, TAB, 'one too many');
    assert.equal(refused.ok, false);
    assert.match(refused.error, /Too many suggestions/);
    assert.equal(appends(calls).length, COMMENTS_PER_HOUR);
  });
});

test('a failed save is reported to the player', async () => {
  const environment = await environmentWithTeam();
  const failing = googleWithLineups([TAB], (call) => (call.address.includes(':append') ? new Response('{}', { status: 500 }) : undefined));
  await withGoogle(failing, async () => {
    assert.match((await send(environment, TAB, 'hello')).error, /Could not save the comment \(500\)/);
  });
});
