import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formattingRequests, saveTeamLinks, teamSheetDefinition } from '../../site/template.js';
import { isCurrentLineupTab, readLineup } from '../src/lineup.js';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LC', 'CF', 'RC', 'RF'];

function parserRows(rowData) {
  return rowData.map(({ values }) => values.map((cellData) => {
    const entered = cellData.userEnteredValue ?? {};
    const text = entered.stringValue ?? (entered.numberValue === undefined ? '' : String(entered.numberValue));
    return { text, strikethrough: false, serialDate: entered.numberValue, backgroundHex: '' };
  }));
}

test('every Prefers and Won\'t play lookup reads the name on its own row', () => {
  const gameSheet = templateSheet('New game (copy me)');
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
  assert.deepEqual(titles.filter(isCurrentLineupTab), []);
});

test('the New game tab has no players, RSVPs or game number, and reads as an empty lineup once renamed', () => {
  const lineup = readLineup('Game 2 Lineup', parserRows(templateSheet('New game (copy me)').rowData));
  assert.equal(lineup.gameNumber, null);
  assert.deepEqual(lineup.players, []);
  assert.deepEqual(lineup.innings, ['1', '2', '3', '4', '5']);
});

test('the game tab freezes the name column and warns when a formula cell is typed over', () => {
  ['New game (copy me)'].forEach((title) => {
    const { properties } = templateSheet(title);
    assert.equal(properties.gridProperties.frozenColumnCount, 1);
    const warnings = formattingRequests()
      .filter((request) => request.setDataValidation?.range.sheetId === properties.sheetId && request.setDataValidation.rule.condition.type === 'CUSTOM_FORMULA')
      .map((request) => request.setDataValidation.rule);
    assert.equal(warnings.length, 3);
    warnings.forEach((rule) => {
      assert.equal(rule.strict, false);
      assert.match(rule.condition.values[0].userEnteredValue, /^=ISFORMULA\([A-Z]+\d+\)$/);
    });
  });
});

test('the tabs the page manages are hidden and the tabs a captain uses are not', () => {
  const hiddenByTitle = Object.fromEntries(teamSheetDefinition('Test Team', 'Fall 2026').sheets.map(({ properties }) => [properties.title, properties.hidden]));
  assert.deepEqual(Object.keys(hiddenByTitle).filter((title) => hiddenByTitle[title]).sort(), ['New game (copy me)', 'Positions', 'Team Config']);
  assert.equal(hiddenByTitle['Start here'], false);
  assert.equal(hiddenByTitle.Roster, false);
});

const cellTexts = (title) => templateSheet(title).rowData.map(({ values }) => values.map((cell) => cell.userEnteredValue?.stringValue ?? ''));

test('a new sheet has no example players or games, only headers', () => {
  assert.equal(cellTexts('Roster').length, 1);
  assert.deepEqual(cellTexts('Roster')[0], ['Name', 'Prefers', "Won't play", 'Notes', 'Pronouns']);
  assert.equal(cellTexts('Schedule').length, 1);
  assert.deepEqual(cellTexts('Schedule')[0], ['Game #', 'Date', 'Time', 'Location', 'Opponent', 'Notes', 'Archived']);
});

test('Start here holds only the two links, with room to write them', () => {
  const rows = cellTexts('Start here');
  assert.equal(rows.length, 4);
  assert.equal(rows[2][0], 'Team link');
  assert.equal(rows[3][0], 'Captain link');
  assert.equal(rows[2][1], '');
  assert.equal(rows[3][1], '');
});

test('saving the team links writes the team link and the Captain link, and clearing blanks both', async () => {
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (address, options) => {
    sent.push({ address: String(address), body: JSON.parse(options.body) });
    return Response.json({});
  };
  try {
    await saveTeamLinks('token', 'sheet-id', 'https://example.test/?team=abc');
    await saveTeamLinks('token', 'sheet-id', '');
  } finally {
    globalThis.fetch = originalFetch;
  }
  const [saved, cleared] = sent.map(({ body }) => body.data);
  assert.deepEqual(saved.map(({ values }) => values), [[['https://example.test/?team=abc']], [['https://example.test/?team=abc'], ['https://example.test/?team=abc#captain']]]);
  assert.match(saved[1].range, /Start here.!B3:B4/);
  assert.deepEqual(cleared.map(({ values }) => values), [[['']], [[''], ['']]]);
});
