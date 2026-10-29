import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formattingRequests, teamSheetDefinition } from '../../site/template.js';
import { isCurrentLineupTab, readLineup } from '../src/lineup.js';

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

test('every Prefers and Won\'t play lookup reads the name on its own row', () => {
  const gameSheet = teamSheetDefinition('Test Team', 'Fall 2026').sheets.find(({ properties }) => properties.title === 'Game 1 Lineup');
  const firstPlayerRowIndex = 8;
  const playerRows = gameSheet.rowData.slice(firstPlayerRowIndex, firstPlayerRowIndex + 22);
  playerRows.forEach(({ values }, offset) => {
    const rowNumber = firstPlayerRowIndex + offset + 1;
    assert.match(values[7].userEnteredValue.formulaValue, new RegExp(`TRIM\\(\\$A${rowNumber}\\)`));
    assert.match(values[8].userEnteredValue.formulaValue, new RegExp(`TRIM\\(\\$A${rowNumber}\\)`));
  });
});

function templateSheet(title) {
  return teamSheetDefinition('Test Team', 'Fall 2026').sheets.find(({ properties }) => properties.title === title);
}

test('Start here comes first and no helper tab is mistaken for a game', () => {
  const titles = teamSheetDefinition('Test Team', 'Fall 2026').sheets.map(({ properties }) => properties.title);
  assert.equal(titles[0], 'Start here');
  assert.deepEqual(titles.filter(isCurrentLineupTab), ['Game 1 Lineup']);
});

test('the New game tab has no players, RSVPs or game number, and reads as an empty lineup once renamed', () => {
  const lineup = readLineup('Game 2 Lineup', parserRows(templateSheet('New game (copy me)').rowData), '2026-10-18');
  assert.equal(lineup.gameNumber, null);
  assert.deepEqual(lineup.players, []);
  assert.deepEqual(lineup.innings, ['1', '2', '3', '4', '5']);
});

test('both game tabs freeze the name column and warn before formulas are overwritten', () => {
  ['Game 1 Lineup', 'New game (copy me)'].forEach((title) => {
    const { properties } = templateSheet(title);
    assert.equal(properties.gridProperties.frozenColumnCount, 1);
    const protectedRanges = formattingRequests().filter((request) => request.addProtectedRange?.protectedRange.range.sheetId === properties.sheetId);
    assert.equal(protectedRanges.length, 3);
    assert.ok(protectedRanges.every((request) => request.addProtectedRange.protectedRange.warningOnly === true));
  });
});
