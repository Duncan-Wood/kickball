import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTeamSheet } from '../src/sheetsReader.js';
import { withGoogle } from './support.js';

const cell = (text) => ({ formattedValue: text });
const tab = (title, rows) => ({ properties: { title }, data: [{ rowData: rows.map((row) => ({ values: row.map(cell) })) }] });
const lineupTab = (title, gameId, label, result) => tab(title, [
  ['Game #:', gameId],
  ['Label:', label],
  ['Result:', result],
  ['Name', '', '1'],
  ['Chad S', '', 'SS'],
  ['Open spots', '', ''],
]);

const tabs = [
  lineupTab('Game 1 Lineup', '1', 'Opener', 'Won 9-5'),
  lineupTab('Game 2 Lineup', '2', '', ''),
  lineupTab('P1 Lineup', 'P1', 'Semifinal', 'Playoff semifinal W, 9-5'),
  tab('Schedule', [['Game #', 'Date', 'Time', 'Location', 'Opponent', 'Label', 'Result', 'Archived'], ['1'], ['2', '', '', '', '', '', '', 'Yes'], ['P1']]),
];

function google(call) {
  if (call.address.includes('drive/v3')) return Response.json({ trashed: false });
  if (call.address.includes('includeGridData')) return Response.json({ sheets: tabs });
  return Response.json({ properties: { timeZone: 'America/New_York' }, sheets: tabs.map(({ properties }) => ({ properties })) });
}

test('a lineup shows its Label and Result from the sheet, and a game archived on the Schedule is left out', async () => {
  const { lineups } = await withGoogle(google, () => readTeamSheet('access', 'sheet-id-with-twenty-chars'));
  assert.deepEqual(lineups.map((lineup) => lineup.label), ['Opener', 'Semifinal']);
  assert.deepEqual(lineups.map((lineup) => lineup.result?.text), ['Won 9-5', 'Won 9-5']);
  assert.deepEqual(lineups.map((lineup) => lineup.played), [true, true]);
});
