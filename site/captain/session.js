import { NEW_GAME_TAB_NAME, SCHEDULE_TAB_NAME } from '../template.js';
import { CONFIG_TAB_NAME } from '../teamSettings.js';
import { resetEditingState } from './fielding.js';
import { askWorkerForAccess, currentAccessToken, pickSheet, refreshTabs, requestAccessToken } from './sheetApi.js';
import { captain, element } from './state.js';
import { setStatus } from './status.js';

const CAPTAIN_DEVICE_KEY = 'kickball-captain-device';
const CAPTAIN_LINK_HASH = '#captain';

export function captainToolsOffered() {
  if (location.hash === CAPTAIN_LINK_HASH) return true;
  try {
    return localStorage.getItem(CAPTAIN_DEVICE_KEY) === 'yes';
  } catch (storageUnavailable) {
    return false;
  }
}

function rememberCaptainDevice() {
  try {
    localStorage.setItem(CAPTAIN_DEVICE_KEY, 'yes');
  } catch (storageUnavailable) {
    return;
  }
}

async function confirmEditorAccess() {
  let accessToken = await requestAccessToken('');
  let access = await askWorkerForAccess(accessToken);
  if (access.access === 'needs-pick') {
    accessToken = await currentAccessToken();
    await pickSheet(accessToken);
    access = await askWorkerForAccess(accessToken);
    if (access.access !== 'editor') throw new Error('That is not this team\'s sheet. Pick the same sheet your captain made');
  }
  return access.spreadsheetId;
}

export async function startCaptainMode() {
  const toggle = element('captain-toggle');
  toggle.disabled = true;
  try {
    const lineup = window.fieldView.currentLineup();
    if (lineup === null || lineup.editable !== true || lineup.players.some((player) => player.sheetRow === undefined)) {
      throw new Error('This lineup cannot be edited from here yet. Reload the page and try again. Sheets that number the kicking order in column B are edited in the sheet');
    }
    captain.spreadsheetId = await confirmEditorAccess();
    await refreshTabs();
    captain.canManageGames = captain.tabs.has(NEW_GAME_TAB_NAME) && captain.tabs.has(SCHEDULE_TAB_NAME);
    captain.canEditTeam = captain.tabs.has(CONFIG_TAB_NAME);
    Object.assign(captain, {
      rosterNames: null,
      rosterPlayers: null,
      openRosterRow: null,
      teamView: 'settings',
      rosterError: null,
      scheduleRows: null,
      scheduleError: null,
      openGameId: null,
      draftGameId: null,
      undoStack: [],
      active: true,
      area: 'fielding',
    });
    resetEditingState(lineup);
    rememberCaptainDevice();
    window.fieldView.rerender();
  } catch (error) {
    window.fieldView.showMessage('Captain tools', error);
  } finally {
    toggle.disabled = false;
  }
}

export function stopCaptainMode() {
  Object.assign(captain, { active: false, selectedRow: null, focus: null, accessToken: null, spreadsheetId: null, tabs: new Map(), undoStack: [] });
  setStatus('');
  window.fieldView.rerender();
}
