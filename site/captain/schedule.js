import { blankPlayerRows, cellAddress, scheduleGames } from '../edits.js';
import { NEW_GAME_TAB_NAME, ROSTER_TAB_NAME, SCHEDULE_TAB_NAME } from '../template.js';
import { fetchRosterNames } from './roster.js';
import { columnValues, refreshTabs, sheetRows, sheetsRequest, writeValues } from './sheetApi.js';
import { captain } from './state.js';

const NEW_GAME_LOOKUP_ATTEMPTS = 10;
const NEW_GAME_LOOKUP_WAIT_MILLISECONDS = 2000;
const GAME_NUMBER_LABEL = 'Game #:';
const GAME_DETAIL_FIRST_COLUMN_INDEX = 1;
const GAME_DETAIL_FIELDS = ['date', 'time', 'location', 'opponent', 'notes'];
const TEMPLATE_LABEL_ROWS = 80;

export async function loadSchedule() {
  captain.scheduleError = null;
  try {
    captain.scheduleRows = await sheetRows(`${SCHEDULE_TAB_NAME}!A:F`);
  } catch (error) {
    captain.scheduleRows = null;
    captain.scheduleError = error.message;
  }
  captain.panelStale = true;
  window.fieldView.rerender();
}

export function scheduledGames() {
  return scheduleGames(captain.scheduleRows ?? [], window.fieldView.allLineups());
}

function waitMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reloadUntil(isDone, failureMessage) {
  for (let attempt = 1; attempt <= NEW_GAME_LOOKUP_ATTEMPTS; attempt += 1) {
    if (isDone(await window.fieldView.reloadLineups())) return;
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

async function removeGameTabs(sheetIds, tabNames) {
  await sheetsRequest(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: sheetIds.map((sheetId) => ({ deleteSheet: { sheetId } })) }),
  });
  await reloadUntilGone(tabNames);
  await refreshTabs();
  captain.panelStale = true;
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
  const rosterNames = captain.tabs.has(ROSTER_TAB_NAME) ? await fetchRosterNames() : [];
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
  return () => removeGameTabs(replies.map(({ duplicateSheet }) => duplicateSheet.properties.sheetId), tabNames);
}

export async function saveGameDetails(game, values, initialValues) {
  const scheduledIds = await columnValues(`${SCHEDULE_TAB_NAME}!A:A`);
  const existingIndex = scheduledIds.indexOf(game.id);
  const row = existingIndex === -1 ? scheduledIds.length + 1 : existingIndex + 1;
  const changedFields = GAME_DETAIL_FIELDS.filter((field) => values[field] !== initialValues[field]);
  const detailCell = (field) => cellAddress(SCHEDULE_TAB_NAME, GAME_DETAIL_FIRST_COLUMN_INDEX + GAME_DETAIL_FIELDS.indexOf(field), row);
  await writeValues([
    { range: cellAddress(SCHEDULE_TAB_NAME, 0, row), values: [[game.id]] },
    ...changedFields.map((field) => ({ range: detailCell(field), values: [[values[field]]] })),
  ]);
  captain.openGameId = null;
  captain.draftGameId = null;
  await loadSchedule();
  return async () => {
    await writeValues([
      ...(existingIndex === -1 ? [{ range: cellAddress(SCHEDULE_TAB_NAME, 0, row), values: [['']] }] : []),
      ...changedFields.map((field) => ({ range: detailCell(field), values: [[initialValues[field]]] })),
    ]);
    await loadSchedule();
  };
}
