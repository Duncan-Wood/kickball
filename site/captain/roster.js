import { cellAddress, firstBlankRosterRow, rosterNameProblem, rosterNamesAreNumbers, rosterPlayerFromRow, rowsWithName } from '../edits.js';
import { ROSTER_TAB_NAME } from '../template.js';
import { columnValues, confirmSheetStillMatches, refreshTabs, sheetRows, writeValues } from './sheetApi.js';
import { captain } from './state.js';

const ROSTER_FIRST_ROW = 2;
const ROSTER_LAST_COLUMN_LETTER = 'E';
const PRONOUNS_COLUMN_INDEX = 4;
const PRONOUNS_HEADER = 'Pronouns';
const BLANK_PLAYER = { name: '', prefers: '', avoids: '', notes: '', pronouns: '' };

export async function fetchRoster() {
  const rows = await sheetRows(`${ROSTER_TAB_NAME}!A${ROSTER_FIRST_ROW}:${ROSTER_LAST_COLUMN_LETTER}`);
  if (rosterNamesAreNumbers(rows)) {
    throw new Error(`The ${ROSTER_TAB_NAME} tab has numbers in column A. Put each player's name in column A, then Prefers, Won't play, Notes and Pronouns in columns B to E, so this page can read and edit it`);
  }
  return rows.map((cells, offset) => rosterPlayerFromRow(cells, offset + ROSTER_FIRST_ROW)).filter((player) => player.name !== '');
}

export async function fetchRosterNames() {
  return (await fetchRoster()).map((player) => player.name);
}

async function refreshRoster() {
  captain.rosterPlayers = await fetchRoster();
  captain.rosterNames = captain.rosterPlayers.map((player) => player.name);
  captain.panelStale = true;
}

export async function loadRoster() {
  captain.rosterPlayers = null;
  captain.rosterNames = null;
  captain.rosterError = null;
  try {
    await refreshTabs();
    if (!captain.tabs.has(ROSTER_TAB_NAME)) throw new Error(`This sheet has no ${ROSTER_TAB_NAME} tab, so there is nobody to add from here`);
    await refreshRoster();
  } catch (error) {
    captain.rosterError = error.message;
  }
  captain.panelStale = true;
  window.fieldView.rerender();
}

function fieldsOf({ name, prefers, avoids, notes, pronouns }) {
  return { name, prefers, avoids, notes, pronouns };
}

async function writeRosterRow(row, expectedName, values, renamedFrom = null) {
  const renames = renamedFrom === null ? [] : rowsWithName(window.fieldView.allLineups(), renamedFrom);
  await confirmSheetStillMatches([
    { address: cellAddress(ROSTER_TAB_NAME, 0, row), expected: expectedName },
    ...renames.map(({ lineup, sheetRow }) => ({ address: cellAddress(lineup.tabName, 0, sheetRow), expected: renamedFrom })),
  ]);
  const pronounsHeader = values.name === '' ? PRONOUNS_HEADER : ((await columnValues(`${ROSTER_TAB_NAME}!E1:E1`))[0] ?? '');
  await writeValues([
    { range: `${cellAddress(ROSTER_TAB_NAME, 0, row)}:${ROSTER_LAST_COLUMN_LETTER}${row}`, values: [[values.name, values.prefers, values.avoids, values.notes, values.pronouns]] },
    ...(pronounsHeader === '' ? [{ range: cellAddress(ROSTER_TAB_NAME, PRONOUNS_COLUMN_INDEX, 1), values: [[PRONOUNS_HEADER]] }] : []),
    ...renames.map(({ lineup, sheetRow }) => ({ range: cellAddress(lineup.tabName, 0, sheetRow), values: [[values.name]] })),
  ], 'RAW');
  renames.forEach(({ lineup, sheetRow }) => {
    lineup.players = lineup.players.map((player) => (player.sheetRow === sheetRow ? { ...player, name: values.name } : player));
  });
  await refreshRoster();
}

export async function saveRosterPlayer(values, previous) {
  const problem = rosterNameProblem(values.name, await fetchRoster(), previous === null ? null : previous.sheetRow);
  if (problem !== null) throw new Error(problem);
  if (previous === null) {
    const row = firstBlankRosterRow(await columnValues(`${ROSTER_TAB_NAME}!A${ROSTER_FIRST_ROW}:A`));
    await writeRosterRow(row, '', values);
    return () => removeRosterPlayer({ ...values, sheetRow: row });
  }
  await writeRosterRow(previous.sheetRow, previous.name, values, previous.name === values.name ? null : previous.name);
  return () => saveRosterPlayer(fieldsOf(previous), { sheetRow: previous.sheetRow, name: values.name });
}

async function blankRosterRows(rows, names) {
  await confirmSheetStillMatches(rows.map((row, index) => ({ address: cellAddress(ROSTER_TAB_NAME, 0, row), expected: names[index] })));
  await writeValues(rows.map((row) => ({ range: `${cellAddress(ROSTER_TAB_NAME, 0, row)}:${ROSTER_LAST_COLUMN_LETTER}${row}`, values: [['', '', '', '', '']] })), 'RAW');
  await refreshRoster();
}

export async function addRosterPlayers(names) {
  const roster = await fetchRoster();
  names.forEach((name, index) => {
    const problem = rosterNameProblem(name, [...roster, ...names.slice(0, index).map((earlier) => ({ name: earlier, sheetRow: null }))], null);
    if (problem !== null) throw new Error(problem);
  });
  const firstRow = firstBlankRosterRow(await columnValues(`${ROSTER_TAB_NAME}!A${ROSTER_FIRST_ROW}:A`));
  const rows = names.map((name, index) => firstRow + index);
  await confirmSheetStillMatches(rows.map((row) => ({ address: cellAddress(ROSTER_TAB_NAME, 0, row), expected: '' })));
  const pronounsHeader = (await columnValues(`${ROSTER_TAB_NAME}!E1:E1`))[0] ?? '';
  await writeValues([
    ...rows.map((row, index) => ({ range: `${cellAddress(ROSTER_TAB_NAME, 0, row)}:${ROSTER_LAST_COLUMN_LETTER}${row}`, values: [[names[index], '', '', '', '']] })),
    ...(pronounsHeader === '' ? [{ range: cellAddress(ROSTER_TAB_NAME, PRONOUNS_COLUMN_INDEX, 1), values: [[PRONOUNS_HEADER]] }] : []),
  ], 'RAW');
  await refreshRoster();
  return () => blankRosterRows(rows, names);
}

export async function removeRosterPlayer(player) {
  await writeRosterRow(player.sheetRow, player.name, BLANK_PLAYER);
  return () => writeRosterRow(player.sheetRow, '', fieldsOf(player));
}
