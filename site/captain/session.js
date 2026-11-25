import { NEW_GAME_TAB_NAME, ROSTER_TAB_NAME, SCHEDULE_TAB_NAME } from '../template.js';
import { CONFIG_TAB_NAME } from '../teamSettings.js';
import { resetEditingState } from './fielding.js';
import { loadRoster } from './roster.js';
import { loadSchedule } from './schedule.js';
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

export function firstAreaWithoutLineup() {
  if (captain.canManageGames) return 'games';
  return captain.canEditRoster ? 'roster' : 'team';
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
    captain.spreadsheetId = await confirmEditorAccess();
    await refreshTabs();
    captain.canManageGames = captain.tabs.has(NEW_GAME_TAB_NAME) && captain.tabs.has(SCHEDULE_TAB_NAME);
    captain.canEditTeam = captain.tabs.has(CONFIG_TAB_NAME);
    captain.canEditRoster = captain.tabs.has(ROSTER_TAB_NAME);
    Object.assign(captain, {
      rosterPlayers: null,
      openRosterRow: null,
      rosterError: null,
      scheduleRows: null,
      scheduleError: null,
      openGameId: null,
      seasonFormOpen: false,
      newGameFormOpen: false,
      addingSeveral: false,
      addingSub: false,
      subDraft: '',
      undoStack: [],
      redoStack: [],
      previewing: false,
      active: true,
      area: lineup === null ? firstAreaWithoutLineup() : 'lineup',
    });
    if (lineup !== null) resetEditingState(lineup);
    if (captain.canEditRoster) loadRoster();
    if (captain.canManageGames) loadSchedule();
    rememberCaptainDevice();
    window.fieldView.rerender();
  } catch (error) {
    window.fieldView.showMessage('Captain tools', error);
  } finally {
    toggle.disabled = false;
  }
}

export function toggleCaptainView() {
  if (!captain.active) {
    startCaptainMode();
    return;
  }
  if (!captain.previewing && captain.area === 'team') window.fieldView.previewConfig(window.fieldView.currentConfig());
  Object.assign(captain, { previewing: !captain.previewing, panelStale: true, focus: null });
  setStatus('');
  window.fieldView.rerender();
}
