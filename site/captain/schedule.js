import { blankPlayerRows, cellAddress, nextGameDefaults, nextGameId, scheduleGames, scheduleIds, seasonDates, seasonProblem } from '../edits.js';
import { NEW_GAME_TAB_NAME, ROSTER_TAB_NAME, SCHEDULE_TAB_NAME } from '../template.js';
import { fetchRegularPlayerNames } from './roster.js';
import { columnValues, confirmSheetStillMatches, currentAccessToken, refreshTabs, sheetRows, sheetsRequest, writeValues } from './sheetApi.js';
import { captain } from './state.js';

const NEW_GAME_LOOKUP_ATTEMPTS = 10;
const NEW_GAME_LOOKUP_WAIT_MILLISECONDS = 2000;
const GAME_NUMBER_LABEL = 'Game #:';
const GAME_DETAIL_FIRST_COLUMN_INDEX = 1;
const GAME_DETAIL_FIELDS = ['date', 'time', 'location', 'opponent', 'label', 'result'];
const TEMPLATE_LABEL_ROWS = 80;

export async function loadSchedule() {
  captain.scheduleError = null;
  try {
    captain.scheduleRows = await sheetRows(`${SCHEDULE_TAB_NAME}!A:H`);
  } catch (error) {
    captain.scheduleRows = null;
    captain.scheduleError = error.message;
  }
  captain.panelStale = true;
  window.fieldView.rerender();
}

export function allScheduledGames() {
  return scheduleGames(captain.scheduleRows ?? [], window.fieldView.allLineups());
}

export function scheduledGames() {
  return allScheduledGames().filter((game) => !game.archived);
}

function waitMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reloadUntil(isDone, failureMessage) {
  for (let attempt = 1; attempt <= NEW_GAME_LOOKUP_ATTEMPTS; attempt += 1) {
    if (isDone(await window.fieldView.reloadLineups(undefined, await currentAccessToken()))) return;
    await waitMilliseconds(NEW_GAME_LOOKUP_WAIT_MILLISECONDS);
  }
  throw new Error(failureMessage);
}

function reloadUntilPresent(tabNames) {
  return reloadUntil((lineups) => tabNames.every((tabName) => lineups.some((lineup) => lineup.tabName === tabName)), 'The lineup tabs were created, but this page has not picked them up yet. Reload the page in a few seconds');
}

function reloadUntilGone(tabNames) {
  return reloadUntil((lineups) => tabNames.every((tabName) => !lineups.some((lineup) => lineup.tabName === tabName)), 'The lineup tabs were removed, but this page has not picked that up yet. Reload the page in a few seconds');
}

async function removeGameTabs(sheetIds, tabNames, gameIds) {
  await sheetsRequest(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: sheetIds.map((sheetId) => ({ deleteSheet: { sheetId } })) }),
  });
  await reloadUntilGone(tabNames);
  await refreshTabs();
  captain.panelStale = true;
  return () => createGameTabs(gameIds);
}

export async function createGameTabs(gameIds) {
  await refreshTabs();
  const templateTab = captain.tabs.get(NEW_GAME_TAB_NAME);
  if (templateTab === undefined) throw new Error(`The sheet needs a "${NEW_GAME_TAB_NAME}" tab to set up lineups from here`);
  const tabNames = gameIds.map((id) => `Game ${id} Lineup`);
  const existing = tabNames.find((tabName) => captain.tabs.has(tabName));
  if (existing !== undefined) throw new Error(`The sheet already has a tab named "${existing}". Rename it or use a different game number`);
  const templateLabels = await columnValues(`'${NEW_GAME_TAB_NAME}'!A1:A${TEMPLATE_LABEL_ROWS}`);
  const gameNumberRow = templateLabels.indexOf(GAME_NUMBER_LABEL) + 1;
  if (gameNumberRow === 0) throw new Error(`The "${NEW_GAME_TAB_NAME}" tab has no "${GAME_NUMBER_LABEL}" label in column A, so the new tabs need their numbers typed in the sheet`);
  const rosterNames = captain.tabs.has(ROSTER_TAB_NAME) ? await fetchRegularPlayerNames() : [];
  const playerRows = blankPlayerRows(templateLabels);
  if (rosterNames.length > playerRows.length) throw new Error(`The ${ROSTER_TAB_NAME} tab has ${rosterNames.length} players but a game tab has room for ${playerRows.length}. Add rows to the grid on the "${NEW_GAME_TAB_NAME}" tab first`);
  const { replies } = await sheetsRequest(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: tabNames.map((tabName, index) => ({ duplicateSheet: { sourceSheetId: templateTab.sheetId, insertSheetIndex: templateTab.index + index, newSheetName: tabName } })) }),
  });
  await sheetsRequest(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: replies.map(({ duplicateSheet }) => ({ updateSheetProperties: { properties: { sheetId: duplicateSheet.properties.sheetId, hidden: false }, fields: 'hidden' } })) }),
  });
  await writeValues(gameIds.map((id, index) => ({ range: cellAddress(tabNames[index], 1, gameNumberRow), values: [[id]] })));
  await writeValues(tabNames.flatMap((tabName) => rosterNames.map((name, index) => ({ range: cellAddress(tabName, 0, playerRows[index]), values: [[name]] }))), 'RAW');
  await reloadUntilPresent(tabNames);
  await refreshTabs();
  return () => removeGameTabs(replies.map(({ duplicateSheet }) => duplicateSheet.properties.sheetId), tabNames, gameIds);
}

async function refreshScheduleRows() {
  captain.scheduleRows = await sheetRows(`${SCHEDULE_TAB_NAME}!A:H`);
}

export async function saveGameField(game, field, value, previousValue) {
  const cell = cellAddress(SCHEDULE_TAB_NAME, GAME_DETAIL_FIRST_COLUMN_INDEX + GAME_DETAIL_FIELDS.indexOf(field), game.row);
  await confirmSheetStillMatches([{ address: cellAddress(SCHEDULE_TAB_NAME, 0, game.row), expected: game.id }]);
  const write = async (text) => {
    await writeValues([{ range: cell, values: [[text]] }]);
    await refreshScheduleRows();
  };
  const putBack = async () => {
    await write(previousValue);
    captain.panelStale = true;
    return putAgain;
  };
  const putAgain = async () => {
    await write(value);
    captain.panelStale = true;
    return putBack;
  };
  await write(value);
  return putBack;
}

const SEASON_COLUMN_LETTER = 'D';

async function addScheduleRows(rowValues) {
  const firstRow = (await columnValues(`${SCHEDULE_TAB_NAME}!A:A`)).length + 1;
  const rows = rowValues.map((unused, index) => firstRow + index);
  await confirmSheetStillMatches(rows.map((row) => ({ address: cellAddress(SCHEDULE_TAB_NAME, 0, row), expected: '' })));
  const ids = rowValues.map(([id]) => id);
  const writeRows = (valuesFor) => writeValues(rows.map((row, index) => ({ range: `${cellAddress(SCHEDULE_TAB_NAME, 0, row)}:${SEASON_COLUMN_LETTER}${row}`, values: [valuesFor(index)] })));
  const add = async () => {
    await writeRows((index) => rowValues[index]);
    let removeTabs;
    try {
      removeTabs = await createGameTabs(ids);
    } catch (error) {
      await writeRows(() => ['', '', '', '']);
      await loadSchedule();
      throw error;
    }
    await loadSchedule();
    return async () => {
      await removeTabs();
      await writeRows(() => ['', '', '', '']);
      await loadSchedule();
      return add;
    };
  };
  return add();
}

function nextId() {
  return nextGameId(scheduleIds(captain.scheduleRows ?? []), window.fieldView.allLineups());
}

export function newGamePreview() {
  return { id: nextId(), ...nextGameDefaults(allScheduledGames()) };
}

export async function addGame() {
  const { id, date, time, location } = newGamePreview();
  const undo = await addScheduleRows([[id, date, time, location]]);
  captain.openGameId = id;
  return undo;
}

export async function addSeasonGames({ firstDate, count, time, location }) {
  const problem = seasonProblem(firstDate, count);
  if (problem !== null) throw new Error(problem);
  const firstId = Number(nextId());
  const dates = seasonDates(firstDate, count);
  return addScheduleRows(dates.map((date, index) => [String(firstId + index), date, time, location]));
}

const ARCHIVE_COLUMN_INDEX = 7;
const ARCHIVE_HEADER = 'Archived';

async function setArchived(game, archived) {
  const flag = { range: cellAddress(SCHEDULE_TAB_NAME, ARCHIVE_COLUMN_INDEX, game.row), values: [[archived ? 'Yes' : '']] };
  const header = (await columnValues(`${SCHEDULE_TAB_NAME}!H1:H1`))[0] ?? '';
  await writeValues([flag, ...(header === '' ? [{ range: cellAddress(SCHEDULE_TAB_NAME, ARCHIVE_COLUMN_INDEX, 1), values: [[ARCHIVE_HEADER]] }] : [])], 'RAW');
}

export async function archiveGame(game) {
  const { tabName } = game;
  await setArchived(game, true);
  if (tabName !== null) await reloadUntilGone([tabName]);
  captain.openGameId = null;
  await loadSchedule();
  return async () => {
    await setArchived(game, false);
    if (tabName !== null) await reloadUntilPresent([tabName]);
    await loadSchedule();
    return () => archiveGame(game);
  };
}

export async function unarchiveGame(game) {
  await setArchived(game, false);
  await refreshTabs();
  const tabName = `Game ${game.id} Lineup`;
  if (captain.tabs.has(tabName)) await reloadUntilPresent([tabName]);
  await loadSchedule();
  const shown = allScheduledGames().find((scheduled) => scheduled.id === game.id) ?? game;
  return () => archiveGame(shown);
}
