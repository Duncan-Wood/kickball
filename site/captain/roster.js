import { cellAddress, firstBlankRosterRow, localIsoDate, rosterNameProblem, rosterNamesToAdd, rosterPlayerFromRow, rowsWithName, upcomingLineups } from '../edits.js';
import { ROSTER_TAB_NAME } from '../template.js';
import { columnValues, confirmSheetStillMatches, refreshTabs, sheetRows, writeValues } from './sheetApi.js';
import { inOrder, saveAddedPlayers, saveRemovedPlayers } from './lineupEdits.js';
import { captain } from './state.js';

const ROSTER_FIRST_ROW = 2;
const ROSTER_LAST_COLUMN_LETTER = 'G';
const PRONOUNS_COLUMN_INDEX = 4;
const KICKING_COLUMN_INDEX = 5;
const SUB_COLUMN_INDEX = 6;
const SUB_ANSWER = 'Yes';
const OPTIONAL_HEADERS = [[PRONOUNS_COLUMN_INDEX, 'Pronouns'], [KICKING_COLUMN_INDEX, 'Kicking'], [SUB_COLUMN_INDEX, 'Sub']];
export const BLANK_PLAYER = { name: '', prefers: '', avoids: '', notes: '', pronouns: '', kicking: '', sub: false };

export async function fetchRoster() {
  const rows = await sheetRows(`${ROSTER_TAB_NAME}!A${ROSTER_FIRST_ROW}:${ROSTER_LAST_COLUMN_LETTER}`);
  return rows.map((cells, offset) => rosterPlayerFromRow(cells, offset + ROSTER_FIRST_ROW)).filter((player) => player.name !== '');
}

export async function fetchRegularPlayerNames() {
  return (await fetchRoster()).filter((player) => !player.sub).map((player) => player.name);
}

async function refreshRoster() {
  captain.rosterPlayers = await fetchRoster();
  captain.panelStale = true;
}

export async function loadRoster() {
  captain.rosterPlayers = null;
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

function fieldsOf({ name, prefers, avoids, notes, pronouns, kicking, sub }) {
  return { name, prefers, avoids, notes, pronouns, kicking, sub };
}

function rowValues({ name, prefers, avoids, notes, pronouns, kicking, sub }) {
  return [name, prefers, avoids, notes, pronouns, kicking, sub ? SUB_ANSWER : ''];
}

async function missingHeaderWrites() {
  const [headerRow = []] = await sheetRows(`${ROSTER_TAB_NAME}!E1:G1`);
  return OPTIONAL_HEADERS
    .filter(([columnIndex]) => (headerRow[columnIndex - PRONOUNS_COLUMN_INDEX] ?? '').trim() === '')
    .map(([columnIndex, header]) => ({ range: cellAddress(ROSTER_TAB_NAME, columnIndex, 1), values: [[header]] }));
}

async function writeRosterRow(row, expectedName, values, renamedFrom = null) {
  const renames = renamedFrom === null ? [] : rowsWithName(window.fieldView.allLineups(), renamedFrom);
  await confirmSheetStillMatches([
    { address: cellAddress(ROSTER_TAB_NAME, 0, row), expected: expectedName },
    ...renames.map(({ lineup, sheetRow }) => ({ address: cellAddress(lineup.tabName, 0, sheetRow), expected: renamedFrom })),
  ]);
  const headerWrites = values.name === '' ? [] : await missingHeaderWrites();
  await writeValues([
    { range: `${cellAddress(ROSTER_TAB_NAME, 0, row)}:${ROSTER_LAST_COLUMN_LETTER}${row}`, values: [rowValues(values)] },
    ...headerWrites,
    ...renames.map(({ lineup, sheetRow }) => ({ range: cellAddress(lineup.tabName, 0, sheetRow), values: [[values.name]] })),
  ], 'RAW');
  renames.forEach(({ lineup, sheetRow }) => {
    lineup.players = lineup.players.map((player) => (player.sheetRow === sheetRow ? { ...player, name: values.name } : player));
  });
  await refreshRoster();
}

async function changeRosterRow(row, before, after) {
  const renamedFrom = before.name !== '' && after.name !== '' && before.name !== after.name ? before.name : null;
  await writeRosterRow(row, before.name, after, renamedFrom);
  return () => changeRosterRow(row, after, before);
}

function upcomingGames() {
  return upcomingLineups(window.fieldView.allLineups(), localIsoDate(new Date()));
}

async function addToUpcomingGames(names) {
  const additions = upcomingGames()
    .map((lineup) => ({ lineup, missing: rosterNamesToAdd(names, lineup.players) }))
    .filter(({ missing }) => missing.length > 0);
  const full = additions.find(({ lineup, missing }) => missing.length > lineup.spareRows.length);
  if (full !== undefined) throw new Error(`${full.lineup.label} has no empty rows left. Add rows to its grid in the sheet first`);
  return Promise.all(additions.map(({ lineup, missing }) => saveAddedPlayers(lineup, missing, '')));
}

const hasNotReplied = (player) => player.rsvp === '' && player.positions.every((position) => position === '');

async function removeFromUpcomingGames(name, { onlyWithoutReply = false } = {}) {
  const removals = upcomingGames()
    .map((lineup) => ({
      lineup,
      sheetRows: lineup.players
        .filter((player) => player.name.toLowerCase() === name.toLowerCase() && (!onlyWithoutReply || hasNotReplied(player)))
        .map((player) => player.sheetRow),
    }))
    .filter(({ sheetRows }) => sheetRows.length > 0);
  return Promise.all(removals.map(({ lineup, sheetRows }) => saveRemovedPlayers(lineup, sheetRows)));
}

export async function saveRosterPlayer(values, previous) {
  const problem = rosterNameProblem(values.name, await fetchRoster(), previous === null ? null : previous.sheetRow);
  if (problem !== null) throw new Error(problem);
  const row = previous === null ? firstBlankRosterRow(await columnValues(`${ROSTER_TAB_NAME}!A${ROSTER_FIRST_ROW}:A`)) : previous.sheetRow;
  const before = previous === null ? BLANK_PLAYER : fieldsOf(previous);
  const steps = [await changeRosterRow(row, before, values)];
  const wasRegular = previous !== null && !before.sub;
  const isRegular = !values.sub;
  if (isRegular && !wasRegular) steps.push(...await addToUpcomingGames([values.name]));
  if (wasRegular && !isRegular) steps.push(...await removeFromUpcomingGames(values.name, { onlyWithoutReply: true }));
  return inOrder(steps.reverse());
}

async function blankRosterRows(rows, names, sub) {
  await confirmSheetStillMatches(rows.map((row, index) => ({ address: cellAddress(ROSTER_TAB_NAME, 0, row), expected: names[index] })));
  await writeValues(rows.map((row) => ({ range: `${cellAddress(ROSTER_TAB_NAME, 0, row)}:${ROSTER_LAST_COLUMN_LETTER}${row}`, values: [rowValues(BLANK_PLAYER)] })), 'RAW');
  await refreshRoster();
  return () => fillRosterRows(rows, names, sub);
}

async function fillRosterRows(rows, names, sub) {
  await confirmSheetStillMatches(rows.map((row) => ({ address: cellAddress(ROSTER_TAB_NAME, 0, row), expected: '' })));
  await writeValues([
    ...rows.map((row, index) => ({ range: `${cellAddress(ROSTER_TAB_NAME, 0, row)}:${ROSTER_LAST_COLUMN_LETTER}${row}`, values: [rowValues({ ...BLANK_PLAYER, name: names[index], sub })] })),
    ...(await missingHeaderWrites()),
  ], 'RAW');
  await refreshRoster();
  return () => blankRosterRows(rows, names, sub);
}

export async function addRosterPlayers(names, { sub = false } = {}) {
  const roster = await fetchRoster();
  names.forEach((name, index) => {
    const problem = rosterNameProblem(name, [...roster, ...names.slice(0, index).map((earlier) => ({ name: earlier, sheetRow: null }))], null);
    if (problem !== null) throw new Error(problem);
  });
  const firstRow = firstBlankRosterRow(await columnValues(`${ROSTER_TAB_NAME}!A${ROSTER_FIRST_ROW}:A`));
  const steps = [await fillRosterRows(names.map((name, index) => firstRow + index), names, sub)];
  if (!sub) steps.push(...await addToUpcomingGames(names));
  return inOrder(steps.reverse());
}

export async function removeRosterPlayer(player) {
  const steps = await removeFromUpcomingGames(player.name);
  steps.push(await changeRosterRow(player.sheetRow, fieldsOf(player), BLANK_PLAYER));
  return inOrder(steps.reverse());
}
