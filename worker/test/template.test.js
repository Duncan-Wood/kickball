import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamSheetDefinition } from '../../site/template.js';
import { readLineup } from '../src/lineup.js';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LC', 'CF', 'RC', 'RF'];

function parserRows(rowData) {
  return rowData.map(({ values }) => values.map((cellData) => {
    const entered = cellData.userEnteredValue ?? {};
    const text = entered.stringValue ?? (entered.numberValue === undefined ? '' : String(entered.numberValue));
    return { text, strikethrough: false, serialDate: entered.numberValue, backgroundHex: '' };
  }));
}

function sampleLineup() {
  const gameSheet = teamSheetDefinition('Test Team', 'Fall 2026').sheets.find(({ properties }) => properties.title === 'Game 1 Lineup');
  return readLineup('Game 1 Lineup', parserRows(gameSheet.rowData), '2026-10-18');
}

test('the template game tab is readable and marks Rowan absent and Jamie maybe', () => {
  const lineup = sampleLineup();
  assert.equal(lineup.gameNumber, 1);
  assert.deepEqual(lineup.innings, ['1', '2', '3', '4', '5']);
  assert.equal(lineup.players.length, 12);
  assert.deepEqual(lineup.players.filter((player) => !player.attending).map((player) => player.name), ['Rowan']);
});

test('the template lineup fills every position once in every inning', () => {
  const lineup = sampleLineup();
  lineup.innings.forEach((inning, inningIndex) => {
    const filled = lineup.players.filter((player) => player.attending).map((player) => player.positions[inningIndex]);
    assert.deepEqual([...filled].sort(), [...POSITIONS].sort());
  });
});
