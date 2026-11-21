import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiedLineup, nextGameDefaults, nextGameId, scheduleGames, scheduleIds } from '../../site/edits.js';
import { orderedLineups } from '../src/lineup.js';

test('a playoff row on the schedule finds its tab by the text in the Game # cell', () => {
  const rows = [['Game #', 'Date'], ['6', '10/29/26'], ['P1'], ['P2', '11/12/26']];
  const games = scheduleGames(rows, [{ gameId: 'P2', tabName: 'Playoff Semifinals (11/12/26) Lineup' }]);
  assert.deepEqual(games.map((game) => [game.id, game.tabName]), [['6', null], ['P2', 'Playoff Semifinals (11/12/26) Lineup']]);
});

test('the next game number ignores playoff ids and passes both the schedule and the lineups', () => {
  assert.equal(nextGameId(['6', 'P1', '7'], [{ gameNumber: 6 }]), '8');
  assert.equal(nextGameId([], []), '1');
});

test('the next game number also passes schedule rows that are hidden from the list', () => {
  const rows = [['Game #', 'Date'], ['6', '10/29/26'], ['7'], [''], ['P1']];
  assert.deepEqual(scheduleGames(rows, []).map((game) => game.id), ['6']);
  assert.deepEqual(scheduleIds(rows), ['6', '7', 'P1']);
  assert.equal(nextGameId(scheduleIds(rows), []), '8');
});

test('a game with only a label or a result still shows on the schedule', () => {
  const rows = [['Game #', 'Date', 'Time', 'Location', 'Opponent', 'Label', 'Result'], ['8', '', '', '', '', 'Semifinal'], ['9', '', '', '', '', '', 'Rained out']];
  assert.deepEqual(scheduleGames(rows, []).map((game) => game.id), ['8', '9']);
});

test('a new game defaults to a week after the latest dated game, at its time and place', () => {
  const games = [
    { date: '11/20/26', time: '7:00 PM', location: 'Stead Park' },
    { date: '12/4/26', time: '6:30 PM', location: 'Turtle Park' },
    { date: '11/27/26', time: '6:00 PM', location: 'Elsewhere' },
    { date: '', time: '', location: '' },
  ];
  assert.deepEqual(nextGameDefaults(games), { date: '2026-12-11', time: '18:30', location: 'Turtle Park' });
  assert.deepEqual(nextGameDefaults([{ date: '', time: '', location: 'Field' }]), { date: '', time: '', location: '' });
});

test('copying a lineup brings over positions and kicking order for players in both games', () => {
  const player = (name, sheetRow, positions, attending = true) => ({ name, sheetRow, attending, rsvp: attending ? 'yes' : 'no', positions });
  const source = [player('Sam', 9, ['C', 'P']), player('Alex', 10, ['P', 'C']), player('Gone', 11, ['1B', '1B']), player('Out', 12, ['SS', 'SS'], false)];
  const target = [player('alex', 9, ['', '']), player('New', 10, ['', '']), player('No Show', 11, ['', ''], false), player('Sam', 12, ['', '']), player('Out', 13, ['', ''])];
  assert.deepEqual(copiedLineup(target, source, 2).map((each) => [each.sheetRow, each.name, each.positions.join('/')]), [
    [9, 'Sam', 'C/P'],
    [10, 'alex', 'P/C'],
    [11, 'No Show', '/'],
    [12, 'New', '/'],
    [13, 'Out', '/'],
  ]);
});

test('two tabs with the same playoff id hide the later one with a named problem', () => {
  const lineups = [{ tabName: 'Playoff A Lineup', gameId: 'P2', gameNumber: null }, { tabName: 'Playoff B Lineup', gameId: 'P2', gameNumber: null }];
  const { lineups: visible, problems } = orderedLineups(lineups);
  assert.deepEqual(visible.map((lineup) => lineup.tabName), ['Playoff A Lineup']);
  assert.match(problems[0], /both Game P2/);
});

test('every lineup the reader returns carries its Game # text, so tabs are not mistaken for duplicates', async () => {
  const { readLineup } = await import('../src/lineup.js');
  const cell = (text) => ({ text, serialDate: undefined, backgroundHex: '' });
  const tabRows = (gameId) => [
    [cell('Game #:'), cell(gameId)],
    [cell('Name'), cell('RSVP'), cell('1')],
    [cell('Chad S'), cell(''), cell('SS')],
    [cell('Open spots'), cell(''), cell('')],
  ];
  const lineups = [['Game 5 Lineup', '5'], ['Game 6 Lineup', '6'], ['Playoff Lineup', 'P2'], ['Extra Lineup', '']].map(([tabName, gameId]) => readLineup(tabName, tabRows(gameId)));
  assert.deepEqual(lineups.map((lineup) => lineup.gameId), ['5', '6', 'P2', '']);
  const { lineups: visible, problems } = orderedLineups(lineups);
  assert.equal(visible.length, 4);
  assert.deepEqual(problems, []);
});

test('a game marked Yes in the Archived column is flagged, and any other value is not', () => {
  const rows = [['Game #', 'Date', 'Time', 'Location', 'Opponent', 'Label', 'Result', 'Archived'], ['1', '10/1/26', '', '', 'Rowdies', '', '', 'Yes'], ['2', '10/8/26', '', '', 'Sliders', '', '', ''], ['3', '10/15/26', '', '', 'Bunts', '', '', 'no']];
  const games = scheduleGames(rows, []);
  assert.deepEqual(games.map((game) => [game.id, game.archived]), [['1', true], ['2', false], ['3', false]]);
});
