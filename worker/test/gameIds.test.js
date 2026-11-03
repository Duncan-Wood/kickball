import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameIdProblem, nextGameId, scheduleGames } from '../../site/edits.js';
import { orderedLineups } from '../src/lineup.js';

test('a playoff row on the schedule finds its tab by the text in the Game # cell', () => {
  const rows = [['Game #', 'Date'], ['6', '10/29/26'], ['P1'], ['P2', '11/12/26']];
  const games = scheduleGames(rows, [{ gameId: 'P2', tabName: 'Playoff Semifinals (11/12/26) Lineup' }]);
  assert.deepEqual(games.map((game) => [game.id, game.tabName]), [['6', null], ['P2', 'Playoff Semifinals (11/12/26) Lineup']]);
});

test('the next game number ignores playoff ids and passes both the schedule and the lineups', () => {
  const games = [{ id: '6' }, { id: 'P1' }, { id: '7' }];
  assert.equal(nextGameId(games, [{ gameNumber: 6 }]), '8');
  assert.equal(nextGameId([], []), '1');
});

test('a new game id must be filled in, plain, and not already on the schedule', () => {
  assert.match(gameIdProblem('', []), /Enter a game number/);
  assert.match(gameIdProblem('P/1', []), /letters, numbers/);
  assert.match(gameIdProblem('p2', ['P2']), /already on the schedule/);
  assert.equal(gameIdProblem('P3', ['P2']), null);
});

test('two tabs with the same playoff id hide the later one with a named problem', () => {
  const lineups = [{ tabName: 'Playoff A Lineup', gameId: 'P2', gameNumber: null }, { tabName: 'Playoff B Lineup', gameId: 'P2', gameNumber: null }];
  const { lineups: visible, problems } = orderedLineups(lineups);
  assert.deepEqual(visible.map((lineup) => lineup.tabName), ['Playoff A Lineup']);
  assert.match(problems[0], /both Game P2/);
});
