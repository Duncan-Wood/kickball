import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formattingRequests, saveTeamLinks, teamSheetDefinition } from '../../site/template.js';
import { isCurrentLineupTab, readLineup } from '../src/lineup.js';

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LC', 'CF', 'RC', 'RF'];

function parserRows(rowData) {
  return rowData.map(({ values }) => values.map((cellData) => {
    const entered = cellData.userEnteredValue ?? {};
    const text = entered.stringValue ?? (entered.numberValue === undefined ? '' : String(entered.numberValue));
    return { text, serialDate: entered.numberValue, backgroundHex: '' };
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

test('the sheet counts only Yes and Maybe players when it lists open spots and flags doubled positions', () => {
  const gameSheet = templateSheet('New game (copy me)');
  const openSpotsRow = gameSheet.rowData.find(({ values }) => values[0]?.userEnteredValue?.stringValue === 'Open spots');
  const openSpotsFormula = openSpotsRow.values[2].userEnteredValue.formulaValue;
  const doubledFormula = formattingRequests()
    .map((request) => request.addConditionalFormatRule?.rule.booleanRule.condition.values[0].userEnteredValue ?? '')
    .find((formula) => formula.includes('COUNTIFS'));
  [openSpotsFormula, doubledFormula].forEach((formula) => {
    assert.match(formula, /"Yes"/);
    assert.match(formula, /"Maybe"/);
    assert.doesNotMatch(formula, /<>No/);
  });
});

test('each Team Config dropdown sits on the row of its own setting', () => {
  const configSheet = templateSheet('Team Config');
  const labelAtRow = (rowIndex) => configSheet.rowData[rowIndex].values[0].userEnteredValue.stringValue;
  const dropdowns = formattingRequests().filter((request) => request.setDataValidation?.range.sheetId === configSheet.properties.sheetId);
  const choicesByLabel = Object.fromEntries(dropdowns.map(({ setDataValidation }) => [labelAtRow(setDataValidation.range.startRowIndex), setDataValidation.rule.condition.values.map(({ userEnteredValue }) => userEnteredValue)]));
  assert.deepEqual(Object.keys(choicesByLabel), ['Stripe', 'Font', 'Suggestion box']);
  assert.ok(choicesByLabel.Stripe.includes('Pride'));
});

function templateSheet(title) {
  return teamSheetDefinition('Test Team', 'Fall 2026').sheets.find(({ properties }) => properties.title === title);
}

test('Team Config comes first and no helper tab is mistaken for a game', () => {
  const titles = teamSheetDefinition('Test Team', 'Fall 2026').sheets.map(({ properties }) => properties.title);
  assert.deepEqual(titles, ['Team Config', 'Roster', 'Schedule', 'New game (copy me)']);
  assert.deepEqual(titles.filter(isCurrentLineupTab), []);
});

test('open spots list the positions inside the formula, with no Positions tab to edit', () => {
  const openSpotsRow = templateSheet('New game (copy me)').rowData.find(({ values }) => values[0]?.userEnteredValue?.stringValue === 'Open spots');
  const formula = openSpotsRow.values[2].userEnteredValue.formulaValue;
  assert.ok(formula.includes(`{${POSITIONS.map((code) => `"${code}"`).join(';')}}`));
  assert.doesNotMatch(formula, /Positions!/);
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
  assert.deepEqual(Object.keys(hiddenByTitle).filter((title) => hiddenByTitle[title]), ['New game (copy me)']);
  assert.equal(hiddenByTitle['Team Config'], false);
  assert.equal(hiddenByTitle.Roster, false);
});

const cellTexts = (title) => templateSheet(title).rowData.map(({ values }) => values.map((cell) => cell.userEnteredValue?.stringValue ?? ''));

test('a new sheet has no example players or games, only headers', () => {
  assert.equal(cellTexts('Roster').length, 1);
  assert.deepEqual(cellTexts('Roster')[0], ['Name', 'Prefers', 'Rather not', 'Notes', 'Pronouns', 'Kicking', 'Sub']);
  assert.equal(cellTexts('Schedule').length, 1);
  assert.deepEqual(cellTexts('Schedule')[0], ['Game #', 'Date', 'Time', 'Location', 'Opponent', 'Label', 'Result', 'Archived']);
  assert.deepEqual(cellTexts('New game (copy me)').slice(0, 8).map((row) => row[0]), ['Game #:', 'Date:', 'Time:', 'Location:', 'Opponent:', 'Label:', 'Result:', 'Name']);
});

test('Team Config ends with the team link and the Captain link, ready to be written', () => {
  const rows = cellTexts('Team Config');
  assert.deepEqual(rows.slice(-2).map((row) => row.slice(0, 2)), [['Team link', ''], ['Captain link', '']]);
});

test('saving the team links writes the team link and the Captain link, and clearing blanks both', async () => {
  const sent = [];
  const originalFetch = globalThis.fetch;
  const labels = [['Setting'], ['Team name'], ['Season label'], ['Icon'], ['Main color'], ['Second color'], ['Stripe'], ['Font'], ['Suggestion box'], [], ['Team link'], ['Captain link']];
  globalThis.fetch = async (address, options) => {
    if (options.method === 'GET') return Response.json({ values: labels });
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
  assert.deepEqual(saved.map(({ values }) => values), [[['https://example.test/?team=abc']], [['https://example.test/?team=abc#captain']]]);
  assert.match(saved[0].range, /Team Config.!B11$/);
  assert.match(saved[1].range, /Team Config.!B12$/);
  assert.deepEqual(cleared.map(({ values }) => values), [[['']], [['']]]);
});
