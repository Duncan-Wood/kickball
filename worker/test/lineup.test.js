import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLineup, isCurrentLineupTab } from '../src/lineup.js';
import { readConfig } from '../src/config.js';
import { normalizedRows } from '../src/sheetsReader.js';

const cell = (text, extra = {}) => ({ text, strikethrough: false, serialDate: undefined, backgroundHex: '', ...extra });
const rowOf = (...texts) => texts.map((text) => (typeof text === 'string' ? cell(text) : text));

function lineupRows(playerRows) {
  return [
    rowOf('Opponent:', 'The Burning Bushes', '', ''),
    rowOf('Date:', cell('10/1/26', { serialDate: 46296 }), '', ''),
    rowOf('Time:', '7:00 PM', '', ''),
    rowOf('Location:', 'Marie Reed', '', ''),
    rowOf('Notes:', 'W, 12-0', '', ''),
    rowOf('Name', '', '1', '2'),
    ...playerRows,
    rowOf('Acceptable', '', '', ''),
  ];
}

test('only current lineup tabs are read', () => {
  assert.equal(isCurrentLineupTab('Game 2 Lineup'), true);
  assert.equal(isCurrentLineupTab('OLD - Game 3 Lineup'), false);
  assert.equal(isCurrentLineupTab('Roster'), false);
});

test('strikethrough names are not attending and keep sheet order', () => {
  const rows = lineupRows([
    rowOf('Chad S', '', 'SS', 'P'),
    rowOf(cell('Amy B', { strikethrough: true }), '', '', ''),
  ]);
  const lineup = readLineup('Game 2 Lineup', rows, '2026-10-18');
  assert.deepEqual(lineup.players.map((player) => [player.name, player.attending]), [['Chad S', true], ['Amy B', false]]);
  assert.deepEqual(lineup.innings, ['1', '2']);
  assert.equal(lineup.played, true);
});

test('kick numbers order the batting lineup and blank means absent', () => {
  const rows = lineupRows([
    rowOf('Chad S', '2', 'SS', 'P'),
    rowOf('Emma E', '1', 'P', 'SS'),
    rowOf('Amy B', '', '', ''),
  ]);
  const lineup = readLineup('Game 2 Lineup', rows, '2026-09-01');
  assert.deepEqual(lineup.players.map((player) => player.name), ['Emma E', 'Chad S', 'Amy B']);
  assert.equal(lineup.players[2].attending, false);
  assert.equal(lineup.played, false);
});

test('a missing label names the tab', () => {
  assert.throws(() => readLineup('Game 9 Lineup', [rowOf('Name', '', '1')], '2026-10-18'), /Tab "Game 9 Lineup" needs/);
});

test('a bad kick number fails loudly', () => {
  const rows = lineupRows([rowOf('Chad S', '2', 'SS', 'P'), rowOf('Emma E', 'two', 'P', 'SS')]);
  assert.throws(() => readLineup('Game 2 Lineup', rows, '2026-10-18'), /kick number for "Emma E"/);
});

test('config defaults apply without a Team Config tab and colors come from fills', () => {
  assert.equal(readConfig(null).teamName, 'My Team');
  const rows = [
    rowOf('Setting', 'Value'),
    rowOf('Team name', 'Fruity Bunts'),
    rowOf('Main color', cell('', { backgroundHex: '#d6336c' })),
    rowOf('Font', 'Comic Sans'),
  ];
  assert.throws(() => readConfig(rows), /"Font" is "Comic Sans"/);
  const valid = readConfig(rows.slice(0, 3));
  assert.equal(valid.teamName, 'Fruity Bunts');
  assert.equal(valid.theme.primary, '#d6336c');
});

test('Sheets API rows are padded and colors converted', () => {
  const rows = normalizedRows({
    data: [{ rowData: [
      { values: [{ formattedValue: 'a', effectiveFormat: { backgroundColor: { red: 1, green: 1, blue: 1 } } }] },
      { values: [{ formattedValue: 'b' }, { formattedValue: 'c' }] },
      {},
    ] }],
  });
  assert.equal(rows[0].length, 2);
  assert.equal(rows[0][0].backgroundHex, '#ffffff');
  assert.equal(rows[2][1].text, '');
});
