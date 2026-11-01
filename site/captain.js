import { applyAddedPlayers, applyFieldingChanges, applyKickingMove, applyRemovedPlayers, applyRsvp, candidatesForSpot, cellAddress, describeInnings, fieldingChangesForInnings, inningsForPreset, inningsHaveDifferentLineups, inverseKickingMove, isoDateFromDisplayed, isoTimeFromDisplayed, kickingMove, nextGameNumber, occupantsOf, playersToAdd, rosterNamesToAdd, rowAfterMove, scheduleGames } from './edits.js';
import { NEW_GAME_TAB_NAME, POSITION_CODES, POSITION_NAMES, ROSTER_TAB_NAME, SCHEDULE_TAB_NAME } from './template.js';

const { workerAddress, googleClientId, googleApiKey, googleProjectNumber } = window.KICKBALL;
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SHEETS_ADDRESS = 'https://sheets.googleapis.com/v4/spreadsheets';
const SIGN_IN_SCRIPT = 'https://accounts.google.com/gsi/client';
const PICKER_SCRIPT = 'https://apis.google.com/js/api.js';
const TOKEN_EXPIRY_MILLISECONDS_MARGIN = 60000;
const DRAG_START_PIXELS = 8;
const CLICK_SUPPRESSION_MILLISECONDS = 50;
const NEW_GAME_LOOKUP_ATTEMPTS = 4;
const NEW_GAME_LOOKUP_WAIT_MILLISECONDS = 2000;
const STATUS_MILLISECONDS = 3000;
const UNDO_LIMIT = 30;
const DOCK_CLEARANCE_PIXELS = 16;
const CAPTAIN_DEVICE_KEY = 'kickball-captain-device';
const CAPTAIN_LINK_HASH = '#captain';
const RSVP_COLUMN_INDEX = 1;
const GAME_NUMBER_LABEL = 'Game #:';
const GAME_DETAIL_FIRST_COLUMN_INDEX = 1;
const AREAS = ['fielding', 'kicking', 'players', 'games'];
const RSVP_ANSWERS = ['Yes', 'Maybe', 'No'];
const INNING_PRESETS = [
  { preset: 'odd', label: 'Odd' },
  { preset: 'even', label: 'Even' },
  { preset: 'all', label: 'All' },
];
const HINTS = {
  fielding: 'Tap a position or a sitting player to edit.',
  fieldingElsewhere: 'Pick an inning above to edit the field.',
  fieldingEmpty: 'Nobody is in this game yet. Add players on the Players tab first.',
  kicking: 'Tap a kicker, then tap the spot in the order they should take.',
  players: 'Tell the lineup who is coming, or add someone from the roster.',
  playersWithoutRsvp: 'This sheet marks players who are out with strikethrough. Change that in the sheet.',
  games: 'Fill in the season here, then set up a lineup tab for every game at once.',
};

const element = (id) => document.getElementById(id);
const scriptLoads = new Map();

const captain = {
  active: false,
  area: 'fielding',
  selectedRow: null,
  focus: null,
  editInnings: new Set([0]),
  viewedInning: 0,
  tabName: null,
  saving: false,
  accessToken: null,
  accessTokenExpiresAt: 0,
  spreadsheetId: null,
  tabs: new Map(),
  canManageGames: false,
  rosterNames: null,
  rosterError: null,
  scheduleRows: null,
  scheduleError: null,
  openGameNumber: null,
  draftGameNumber: null,
  gamesDirty: false,
  undoStack: [],
};

let suppressClicksUntil = 0;
let dragState = null;
let statusTimer = null;

function loadScript(address) {
  if (!scriptLoads.has(address)) {
    scriptLoads.set(address, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = address;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection and try again'));
      document.head.append(script);
    }));
  }
  return scriptLoads.get(address);
}

function captainToolsOffered() {
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

async function requestAccessToken(prompt) {
  await loadScript(SIGN_IN_SCRIPT);
  return new Promise((resolve, reject) => {
    google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: DRIVE_FILE_SCOPE,
      prompt,
      callback: (response) => {
        if (response.error) {
          reject(new Error(`Google sign-in was not completed (${response.error})`));
          return;
        }
        captain.accessToken = response.access_token;
        captain.accessTokenExpiresAt = Date.now() + Number(response.expires_in) * 1000;
        resolve(captain.accessToken);
      },
      error_callback: (error) => reject(new Error(`Google sign-in was not completed (${error.type})`)),
    }).requestAccessToken();
  });
}

async function currentAccessToken() {
  if (captain.accessToken !== null && Date.now() < captain.accessTokenExpiresAt - TOKEN_EXPIRY_MILLISECONDS_MARGIN) return captain.accessToken;
  return requestAccessToken('');
}

async function askWorkerForAccess(accessToken) {
  const response = await fetch(`${workerAddress}/api/team/${window.fieldView.teamCode}/captain`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ accessToken }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data;
}

async function pickSheet(accessToken) {
  await Promise.all([loadScript(PICKER_SCRIPT), loadScript(SIGN_IN_SCRIPT)]);
  await new Promise((resolve) => gapi.load('picker', resolve));
  return new Promise((resolve, reject) => {
    new google.picker.PickerBuilder()
      .setAppId(googleProjectNumber)
      .setDeveloperKey(googleApiKey)
      .setOAuthToken(accessToken)
      .addView(new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setMode(google.picker.DocsViewMode.LIST))
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) resolve();
        if (data.action === google.picker.Action.CANCEL) reject(new Error('No sheet was picked'));
      })
      .build()
      .setVisible(true);
  });
}

async function sheetsRequest(path, options = {}, alreadyRetried = false) {
  const accessToken = await currentAccessToken();
  const response = await fetch(`${SHEETS_ADDRESS}/${captain.spreadsheetId}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  if (response.status === 401 && !alreadyRetried) {
    captain.accessToken = null;
    return sheetsRequest(path, options, true);
  }
  if (response.status === 403 || response.status === 404) throw new Error('Google says you can no longer edit this sheet');
  if (!response.ok) throw new Error(`Google could not save the change (${response.status})`);
  return response.json();
}

async function refreshTabs() {
  const overview = await sheetsRequest('?fields=sheets.properties(sheetId,title,index)');
  captain.tabs = new Map(overview.sheets.map(({ properties }) => [properties.title, properties]));
}

async function sheetIdFor(tabName) {
  if (!captain.tabs.has(tabName)) await refreshTabs();
  if (!captain.tabs.has(tabName)) throw new Error(`The tab "${tabName}" is no longer in the sheet`);
  return captain.tabs.get(tabName).sheetId;
}

async function sheetRows(range) {
  const { values = [] } = await sheetsRequest(`/values/${encodeURIComponent(range)}`);
  return values;
}

async function columnValues(range) {
  return (await sheetRows(range)).map((row) => (row[0] ?? '').trim());
}

async function writeValues(data, valueInputOption = 'USER_ENTERED') {
  await sheetsRequest('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption, data }) });
}

async function currentCellValues(addresses) {
  const query = addresses.map((address) => `ranges=${encodeURIComponent(address)}`).join('&');
  const { valueRanges } = await sheetsRequest(`/values:batchGet?${query}`);
  return valueRanges.map((range) => (range.values?.[0]?.[0] ?? '').trim());
}

async function confirmSheetStillMatches(expectations) {
  const current = await currentCellValues(expectations.map(({ address }) => address));
  const changedIndex = expectations.findIndex(({ expected }, index) => expected.toLowerCase() !== current[index].toLowerCase());
  if (changedIndex !== -1) {
    window.fieldView.refreshNow();
    throw new Error('The sheet changed since this page last updated, so nothing was saved. Look at the lineup and try again');
  }
}

function lineupPlayer(lineup, sheetRow) {
  return lineup.players.find((player) => player.sheetRow === sheetRow);
}

function nameExpectations(lineup, sheetRows) {
  return [...new Set(sheetRows)].map((sheetRow) => ({ address: cellAddress(lineup.tabName, 0, sheetRow), expected: lineupPlayer(lineup, sheetRow).name }));
}

async function saveFielding(lineup, changes) {
  const reversal = changes.map(({ sheetRow, inningIndex }) => ({ sheetRow, inningIndex, value: lineupPlayer(lineup, sheetRow).positions[inningIndex] }));
  await confirmSheetStillMatches([
    ...nameExpectations(lineup, changes.map(({ sheetRow }) => sheetRow)),
    ...changes.map(({ sheetRow, inningIndex }) => ({ address: cellAddress(lineup.tabName, lineup.inningColumns[inningIndex], sheetRow), expected: lineupPlayer(lineup, sheetRow).positions[inningIndex] })),
  ]);
  await writeValues(changes.map(({ sheetRow, inningIndex, value }) => ({ range: cellAddress(lineup.tabName, lineup.inningColumns[inningIndex], sheetRow), values: [[value]] })));
  lineup.players = applyFieldingChanges(lineup.players, changes);
  return () => saveFielding(lineup, reversal);
}

async function saveKickingMove(lineup, move, sourceRow, targetRow) {
  await confirmSheetStillMatches(nameExpectations(lineup, [sourceRow, targetRow]));
  const sheetId = await sheetIdFor(lineup.tabName);
  await sheetsRequest(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ moveDimension: { source: { sheetId, dimension: 'ROWS', startIndex: move.fromRow - 1, endIndex: move.fromRow }, destinationIndex: move.destinationIndex } }],
    }),
  });
  lineup.players = applyKickingMove(lineup.players, move);
  lineup.spareRows = lineup.spareRows.map((sheetRow) => rowAfterMove(sheetRow, move)).sort((first, second) => first - second);
  return () => saveKickingMove(lineup, inverseKickingMove(move), move.finalRow, move.fromRow);
}

async function saveRsvp(lineup, sheetRow, answer) {
  const player = lineupPlayer(lineup, sheetRow);
  const previousAnswer = RSVP_ANSWERS.find((candidate) => candidate.toLowerCase() === player.rsvp) ?? '';
  await confirmSheetStillMatches([
    ...nameExpectations(lineup, [sheetRow]),
    { address: cellAddress(lineup.tabName, RSVP_COLUMN_INDEX, sheetRow), expected: player.rsvp },
  ]);
  await writeValues([{ range: cellAddress(lineup.tabName, RSVP_COLUMN_INDEX, sheetRow), values: [[answer]] }]);
  lineup.players = lineup.players.map((candidate) => (candidate.sheetRow === sheetRow ? applyRsvp(candidate, answer.toLowerCase()) : candidate));
  return () => saveRsvp(lineup, sheetRow, previousAnswer);
}

async function saveRemovedPlayers(lineup, sheetRows) {
  await confirmSheetStillMatches(nameExpectations(lineup, sheetRows));
  await writeValues(sheetRows.map((sheetRow) => ({ range: cellAddress(lineup.tabName, 0, sheetRow), values: [['']] })), 'RAW');
  Object.assign(lineup, applyRemovedPlayers(lineup, sheetRows));
}

async function saveAddedPlayers(lineup, names) {
  const additions = playersToAdd(lineup.spareRows, names);
  await confirmSheetStillMatches(additions.map(({ sheetRow }) => ({ address: cellAddress(lineup.tabName, 0, sheetRow), expected: '' })));
  await writeValues(additions.map(({ name, sheetRow }) => ({ range: cellAddress(lineup.tabName, 0, sheetRow), values: [[name]] })), 'RAW');
  Object.assign(lineup, applyAddedPlayers(lineup, additions, lineup.innings.length));
  return () => saveRemovedPlayers(lineup, additions.map(({ sheetRow }) => sheetRow));
}

async function loadRosterNames() {
  captain.rosterNames = null;
  captain.rosterError = null;
  try {
    await refreshTabs();
    if (!captain.tabs.has(ROSTER_TAB_NAME)) throw new Error(`This sheet has no ${ROSTER_TAB_NAME} tab, so there is nobody to add from here`);
    captain.rosterNames = (await columnValues(`${ROSTER_TAB_NAME}!A2:A`)).filter((name) => name !== '');
  } catch (error) {
    captain.rosterError = error.message;
  }
  window.fieldView.rerender();
}

async function loadSchedule() {
  captain.scheduleError = null;
  try {
    captain.scheduleRows = await sheetRows(`${SCHEDULE_TAB_NAME}!A:F`);
  } catch (error) {
    captain.scheduleRows = null;
    captain.scheduleError = error.message;
  }
  captain.gamesDirty = true;
  window.fieldView.rerender();
}

function scheduledGames() {
  return scheduleGames(captain.scheduleRows ?? [], window.fieldView.allLineups());
}

function waitMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function reloadUntilPresent(tabNames) {
  for (let attempt = 1; attempt <= NEW_GAME_LOOKUP_ATTEMPTS; attempt += 1) {
    const lineups = await window.fieldView.reloadLineups();
    if (tabNames.every((tabName) => lineups.some((lineup) => lineup.tabName === tabName))) return;
    await waitMilliseconds(NEW_GAME_LOOKUP_WAIT_MILLISECONDS);
  }
  throw new Error('The lineup tabs were created, but this page has not picked them up yet. Reload the page in a few seconds');
}

async function createGameTabs(gameNumbers) {
  await refreshTabs();
  const templateTab = captain.tabs.get(NEW_GAME_TAB_NAME);
  if (templateTab === undefined) throw new Error(`The sheet needs a "${NEW_GAME_TAB_NAME}" tab to set up lineups from here`);
  const tabNames = gameNumbers.map((number) => `Game ${number} Lineup`);
  const existing = tabNames.find((tabName) => captain.tabs.has(tabName));
  if (existing !== undefined) throw new Error(`The sheet already has a tab named "${existing}". Rename it or use a different game number`);
  const gameNumberRow = (await columnValues(`'${NEW_GAME_TAB_NAME}'!A1:A12`)).indexOf(GAME_NUMBER_LABEL) + 1;
  if (gameNumberRow === 0) throw new Error(`The "${NEW_GAME_TAB_NAME}" tab has no "${GAME_NUMBER_LABEL}" label in column A, so the new tabs need their numbers typed in the sheet`);
  await sheetsRequest(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: tabNames.map((tabName, index) => ({ duplicateSheet: { sourceSheetId: templateTab.sheetId, insertSheetIndex: templateTab.index + index, newSheetName: tabName } })) }),
  });
  await writeValues(gameNumbers.map((number, index) => ({ range: cellAddress(tabNames[index], 1, gameNumberRow), values: [[number]] })));
  await reloadUntilPresent(tabNames);
  await refreshTabs();
}

async function saveGameDetails(game, values, initialValues) {
  const gameNumbers = await columnValues(`${SCHEDULE_TAB_NAME}!A:A`);
  const existingIndex = gameNumbers.indexOf(String(game.number));
  const row = existingIndex === -1 ? gameNumbers.length + 1 : existingIndex + 1;
  const fields = ['date', 'time', 'location', 'opponent', 'notes'];
  const writes = fields
    .filter((field) => values[field] !== initialValues[field])
    .map((field) => ({ range: cellAddress(SCHEDULE_TAB_NAME, GAME_DETAIL_FIRST_COLUMN_INDEX + fields.indexOf(field), row), values: [[values[field]]] }));
  await writeValues([{ range: cellAddress(SCHEDULE_TAB_NAME, 0, row), values: [[game.number]] }, ...writes]);
  captain.openGameNumber = null;
  captain.draftGameNumber = null;
  await loadSchedule();
}

function setStatus(text, { isError = false, sticky = false } = {}) {
  clearTimeout(statusTimer);
  const status = element('captain-status');
  status.textContent = text;
  status.classList.toggle('empty', text === '');
  status.classList.toggle('error', isError);
  if (text !== '' && !isError && !sticky) statusTimer = setTimeout(() => setStatus(''), STATUS_MILLISECONDS);
}

function updateUndoButton() {
  const undoButton = element('captain-undo');
  const latest = captain.undoStack[captain.undoStack.length - 1];
  undoButton.disabled = latest === undefined || captain.saving;
  undoButton.title = latest === undefined ? 'Nothing to undo' : `Undo: ${latest.label}`;
}

async function saveEdit(work, label) {
  captain.saving = true;
  setStatus('Saving…', { sticky: true });
  updateUndoButton();
  try {
    const undo = await work();
    captain.selectedRow = null;
    if (typeof undo === 'function') captain.undoStack = [...captain.undoStack, { label, run: undo }].slice(-UNDO_LIMIT);
    window.fieldView.changed();
    setStatus(label === undefined ? 'Saved' : `Saved: ${label}`);
    return true;
  } catch (error) {
    window.fieldView.rerender();
    setStatus(error.message, { isError: true });
    return false;
  } finally {
    captain.saving = false;
    updateUndoButton();
  }
}

async function undoLatest() {
  const entry = captain.undoStack[captain.undoStack.length - 1];
  if (entry === undefined || captain.saving) return;
  captain.undoStack = captain.undoStack.slice(0, -1);
  captain.saving = true;
  setStatus('Undoing…', { sticky: true });
  updateUndoButton();
  try {
    await entry.run();
    window.fieldView.changed();
    setStatus(`Undone: ${entry.label}`);
  } catch (error) {
    window.fieldView.rerender();
    setStatus(error.message, { isError: true });
  } finally {
    captain.saving = false;
    updateUndoButton();
  }
}

function editedInnings() {
  return [...captain.editInnings].sort((first, second) => first - second);
}

function advanceFocusAfterFilling(filledPosition) {
  captain.focus = null;
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  const openPositions = POSITION_CODES.filter((position) => occupantsOf(lineup.players, inningIndex, position).length === 0);
  const filledIndex = POSITION_CODES.indexOf(filledPosition);
  const next = openPositions.find((position) => POSITION_CODES.indexOf(position) > filledIndex) ?? openPositions[0];
  if (next !== undefined) captain.focus = { kind: 'spot', position: next };
  window.fieldView.rerender();
}

function applyFielding(sourceRow, target) {
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  let changes;
  try {
    changes = fieldingChangesForInnings(lineup.players, editedInnings(), sourceRow, target, lineup.innings);
  } catch (error) {
    setStatus(error.message, { isError: true });
    return;
  }
  if (changes.length === 0) {
    captain.selectedRow = null;
    captain.focus = null;
    window.fieldView.rerender();
    return;
  }
  const sourceName = lineupPlayer(lineup, sourceRow).name;
  const label = target.kind === 'bench' ? `${sourceName} sits` : target.kind === 'spot' ? `${sourceName} to ${target.position}` : `${sourceName} swapped`;
  const fillsOpenSpot = target.kind === 'spot' && occupantsOf(lineup.players, inningIndex, target.position).length === 0;
  saveEdit(() => saveFielding(lineup, changes), label).then((saved) => {
    if (!saved) return;
    if (fillsOpenSpot) advanceFocusAfterFilling(target.position);
    else {
      captain.focus = null;
      window.fieldView.rerender();
    }
  });
}

function moveKicker(sourceRow, targetRow) {
  const lineup = window.fieldView.currentLineup();
  const move = kickingMove(lineup.players, sourceRow, targetRow);
  if (move === null) {
    captain.selectedRow = null;
    window.fieldView.rerender();
    return;
  }
  const slot = lineup.players.filter((player) => player.attending).findIndex((player) => player.sheetRow === targetRow) + 1;
  saveEdit(() => saveKickingMove(lineup, move, sourceRow, targetRow), `${lineupPlayer(lineup, sourceRow).name} to spot ${slot}`);
}

function node(tag, className, text) {
  const created = document.createElement(tag);
  if (className) created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

function button(text, className, onClick) {
  const created = node('button', className, text);
  created.type = 'button';
  created.addEventListener('click', () => {
    if (!captain.saving) onClick();
  });
  return created;
}

function describeTarget(targetElement) {
  const holder = targetElement.closest('[data-edit-kind]');
  if (holder === null) return null;
  const { editKind, position, row } = holder.dataset;
  if (editKind === 'spot') return { kind: 'spot', position };
  if (editKind === 'bench') return { kind: 'bench' };
  return { kind: 'player', sheetRow: Number(row) };
}

function sourceRowFor(target, lineup, inningIndex) {
  if (target.kind === 'player') return target.sheetRow;
  if (target.kind !== 'spot') return null;
  const occupants = occupantsOf(lineup.players, inningIndex, target.position);
  return occupants.length === 0 ? null : occupants[occupants.length - 1].sheetRow;
}

function handleTap(targetElement) {
  if (captain.saving || Date.now() < suppressClicksUntil) return;
  const target = describeTarget(targetElement);
  if (target === null) return;
  const focus = captain.focus;
  if (focus !== null && focus.kind === 'player' && target.kind === 'spot') {
    applyFielding(focus.sheetRow, target);
    return;
  }
  const isFocused = focus !== null && ((focus.kind === 'spot' && target.kind === 'spot' && focus.position === target.position) || (focus.kind === 'player' && target.kind === 'player' && focus.sheetRow === target.sheetRow));
  captain.focus = isFocused ? null : target.kind === 'spot' ? { kind: 'spot', position: target.position } : { kind: 'player', sheetRow: target.sheetRow };
  window.fieldView.rerender();
}

function editableElements() {
  return [...document.querySelectorAll('#chips .chip, #bench li')];
}

function startDrag(event, sourceElement) {
  if (event.pointerType === 'touch' || event.button !== 0 || captain.saving) return;
  dragState = { sourceElement, startX: event.clientX, startY: event.clientY, dragging: false, ghost: null };
}

function moveDrag(event) {
  if (dragState === null) return;
  if (!dragState.dragging) {
    if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < DRAG_START_PIXELS) return;
    const target = describeTarget(dragState.sourceElement);
    const sourceRow = target === null ? null : sourceRowFor(target, window.fieldView.currentLineup(), window.fieldView.currentInningIndex());
    if (sourceRow === null) {
      dragState = null;
      return;
    }
    captain.selectedRow = sourceRow;
    dragState.dragging = true;
    dragState.ghost = node('div', 'drag-ghost', lineupPlayer(window.fieldView.currentLineup(), sourceRow).name);
    document.body.append(dragState.ghost);
    decorate();
  }
  dragState.ghost.style.left = `${event.clientX + 12}px`;
  dragState.ghost.style.top = `${event.clientY + 12}px`;
}

function endDrag(event) {
  if (dragState === null) return;
  const { dragging, ghost, sourceElement } = dragState;
  dragState = null;
  if (!dragging) return;
  ghost.remove();
  suppressClicksUntil = Date.now() + CLICK_SUPPRESSION_MILLISECONDS;
  const target = describeTarget(document.elementFromPoint(event.clientX, event.clientY) ?? sourceElement);
  const sourceRow = captain.selectedRow;
  if (target === null || sourceRow === null) {
    captain.selectedRow = null;
    decorate();
    return;
  }
  applyFielding(sourceRow, target);
}

function decorate() {
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  document.querySelectorAll('.edit-selected').forEach((marked) => marked.classList.remove('edit-selected'));
  if (!captain.active || lineup === null || captain.area !== 'fielding') return;
  const focus = captain.focus;
  editableElements().forEach((editable) => {
    const target = describeTarget(editable);
    if (target === null) return;
    const isFocused = focus !== null && ((focus.kind === 'spot' && target.kind === 'spot' && focus.position === target.position) || (focus.kind === 'player' && target.kind === 'player' && focus.sheetRow === target.sheetRow));
    const isDragged = captain.selectedRow !== null && target.kind !== 'bench' && sourceRowFor(target, lineup, inningIndex) === captain.selectedRow;
    editable.classList.toggle('edit-selected', isFocused || isDragged);
  });
}

function bindEditable(editable) {
  editable.addEventListener('click', () => handleTap(editable));
  editable.addEventListener('pointerdown', (event) => startDrag(event, editable));
}

function pickChip(player, inningIndex, onPick) {
  const current = player.positions[inningIndex];
  const chip = button('', 'pick-chip', onPick);
  chip.append(node('span', 'pick-name', player.name));
  if (current !== '') chip.append(node('span', 'pick-badge', current));
  return chip;
}

function dockContent(lineup, inningIndex) {
  const focus = captain.focus;
  const close = button('×', 'dock-close', () => {
    captain.focus = null;
    window.fieldView.rerender();
  });
  close.setAttribute('aria-label', 'Close');
  if (focus.kind === 'player') {
    const player = lineupPlayer(lineup, focus.sheetRow);
    const current = player.positions[inningIndex];
    const header = node('div', 'dock-header');
    const title = node('div', 'dock-title');
    title.append(node('strong', undefined, player.name), node('span', 'dock-sub', current === '' ? 'Sitting. Tap a position on the field.' : `At ${POSITION_NAMES[POSITION_CODES.indexOf(current)]}. Tap another position, or sit them.`));
    header.append(title);
    if (current !== '') header.append(button('Sit out', 'dock-action', () => applyFielding(focus.sheetRow, { kind: 'bench' })));
    header.append(close);
    return [header];
  }
  const occupants = occupantsOf(lineup.players, inningIndex, focus.position);
  const header = node('div', 'dock-header');
  const title = node('div', 'dock-title');
  title.append(node('strong', undefined, POSITION_NAMES[POSITION_CODES.indexOf(focus.position)]), node('span', 'dock-sub', occupants.length === 0 ? 'Open. Who plays here?' : `${occupants.map((occupant) => occupant.name).join(' and ')} ${occupants.length === 1 ? 'is' : 'are'} here. Pick a swap.`));
  header.append(title);
  occupants.forEach((occupant) => header.append(button(occupants.length === 1 ? 'Sit out' : `Sit ${occupant.name}`, 'dock-action', () => applyFielding(occupant.sheetRow, { kind: 'bench' }))));
  header.append(close);
  const candidates = candidatesForSpot(lineup.players, inningIndex, focus.position);
  const sitting = candidates.filter((candidate) => candidate.positions[inningIndex] === '');
  const playing = candidates.filter((candidate) => candidate.positions[inningIndex] !== '');
  const pick = (candidate) => pickChip(candidate, inningIndex, () => applyFielding(candidate.sheetRow, { kind: 'spot', position: focus.position }));
  const body = node('div', 'dock-body');
  [['Sitting', sitting], ['Playing', playing]].filter(([, group]) => group.length > 0).forEach(([heading, group]) => {
    const chips = node('div', 'dock-chips');
    chips.append(...group.map(pick));
    body.append(node('p', 'dock-group', heading), chips);
  });
  return [header, body];
}

function renderDock(lineup, inField) {
  const dock = element('captain-dock');
  const focus = captain.focus;
  const stale = focus !== null && focus.kind === 'player' && lineup !== null && lineupPlayer(lineup, focus.sheetRow) === undefined;
  if (stale) captain.focus = null;
  const shows = captain.active && captain.area === 'fielding' && inField && lineup !== null && captain.focus !== null && lineup.players.some((player) => player.attending);
  dock.hidden = !shows;
  document.body.classList.toggle('captain-placing', shows && captain.focus.kind === 'player');
  if (!shows) {
    dock.replaceChildren();
    document.body.style.paddingBottom = '';
    return;
  }
  dock.replaceChildren(...dockContent(lineup, window.fieldView.currentInningIndex()));
  document.body.style.paddingBottom = `${dock.offsetHeight}px`;
  const focusedChip = document.querySelector('#chips .chip.edit-selected');
  const hiddenBy = focusedChip === null ? 0 : focusedChip.getBoundingClientRect().bottom - (window.innerHeight - dock.offsetHeight - DOCK_CLEARANCE_PIXELS);
  if (hiddenBy > 0) window.scrollBy({ top: hiddenBy });
}

function setEditInnings(inningIndexes) {
  captain.editInnings = new Set(inningIndexes);
  const first = Math.min(...inningIndexes);
  captain.viewedInning = first;
  if (window.fieldView.currentInningIndex() !== first) window.fieldView.selectInning(first);
  else window.fieldView.rerender();
}

function toggleInning(inningIndex) {
  const selected = new Set(captain.editInnings);
  if (selected.has(inningIndex)) {
    if (selected.size === 1) return;
    selected.delete(inningIndex);
  } else selected.add(inningIndex);
  setEditInnings([...selected]);
}

function fieldingPanel(lineup, inField) {
  if (!inField) return [node('p', 'captain-hint', HINTS.fieldingElsewhere)];
  if (!lineup.players.some((player) => player.attending)) return [node('p', 'captain-hint', HINTS.fieldingEmpty)];
  const parts = [node('p', 'captain-hint', HINTS.fielding)];
  if (lineup.innings.length < 2) return parts;
  const row = node('div', 'innings-edit');
  row.append(node('span', 'innings-edit-label', 'Edit innings'));
  const chips = node('div', 'innings-edit-chips');
  chips.append(...lineup.innings.map((label, index) => {
    const chip = button(label, 'inning-toggle', () => toggleInning(index));
    chip.setAttribute('aria-pressed', String(captain.editInnings.has(index)));
    return chip;
  }));
  row.append(chips);
  const presets = node('div', 'innings-edit-presets');
  presets.append(...INNING_PRESETS.map(({ preset, label }) => button(label, 'inning-preset', () => setEditInnings(inningsForPreset(preset, lineup.innings.length)))));
  row.append(presets);
  parts.push(row);
  if (captain.editInnings.size > 1) {
    const together = editedInnings();
    const differs = inningsHaveDifferentLineups(lineup.players, together);
    parts.push(node('p', 'innings-edit-caption', `Changes apply to ${describeInnings(together, lineup.innings)}.${differs ? ' Their lineups differ, so each one changes on its own.' : ''}`));
  }
  return parts;
}

function kickingPanel(lineup) {
  const kickers = lineup.players.filter((player) => player.attending);
  const list = node('ol', 'order-list');
  kickers.forEach((player, index) => {
    const isMoving = player.sheetRow === captain.selectedRow;
    const row = button('', isMoving ? 'order-row moving' : 'order-row', () => {
      if (captain.selectedRow === null) captain.selectedRow = player.sheetRow;
      else if (isMoving) captain.selectedRow = null;
      else {
        moveKicker(captain.selectedRow, player.sheetRow);
        return;
      }
      window.fieldView.rerender();
    });
    row.append(node('span', 'order-slot', String(index + 1)), node('span', 'order-name', player.name));
    const item = node('li');
    item.append(row);
    list.append(item);
  });
  const moving = kickers.find((player) => player.sheetRow === captain.selectedRow);
  return [node('p', 'captain-hint', moving === undefined ? HINTS.kicking : `Now tap the spot ${moving.name} should take, or tap ${moving.name} again to cancel.`), list];
}

function rosterSection(lineup) {
  if (captain.rosterError !== null) return [node('p', 'captain-hint', captain.rosterError)];
  if (captain.rosterNames === null) return [node('p', 'captain-hint', 'Loading the roster…')];
  const names = rosterNamesToAdd(captain.rosterNames, lineup.players);
  if (names.length === 0) return [node('p', 'captain-hint', `Everyone on the ${ROSTER_TAB_NAME} tab is in this game.`)];
  const chips = node('div', 'roster-chips');
  chips.append(...names.map((name) => button(name, 'roster-chip', () => saveEdit(() => saveAddedPlayers(lineup, [name]), `Added ${name}`))));
  return [chips, ...(names.length > 1 ? [button(`Add all ${names.length}`, 'panel-action', () => saveEdit(() => saveAddedPlayers(lineup, names), `Added ${names.length} players`))] : [])];
}

function playersPanel(lineup) {
  const parts = [node('p', 'captain-hint', lineup.usesRsvp ? HINTS.players : HINTS.playersWithoutRsvp)];
  if (lineup.usesRsvp && lineup.players.length > 0) {
    const list = node('div', 'player-list');
    list.append(...lineup.players.map((player) => {
      const answers = node('div', 'rsvp');
      answers.append(...RSVP_ANSWERS.map((answer) => {
        const choice = button(answer, answer.toLowerCase() === 'yes' ? '' : answer.toLowerCase(), () => saveEdit(() => saveRsvp(lineup, player.sheetRow, player.rsvp === answer.toLowerCase() ? '' : answer), `${player.name}: ${player.rsvp === answer.toLowerCase() ? 'no reply' : answer}`));
        choice.setAttribute('aria-pressed', String(player.rsvp === answer.toLowerCase()));
        return choice;
      }));
      const row = node('div', 'player-row');
      row.append(node('span', undefined, player.name), answers);
      return row;
    }));
    parts.push(list);
  }
  parts.push(node('p', 'captain-subheading', 'Add from the roster'), ...rosterSection(lineup));
  return parts;
}

function formField(labelText, type, name, value) {
  const label = node('label', undefined, labelText);
  const input = node('input');
  input.type = type;
  input.name = name;
  input.value = value;
  label.append(input);
  return label;
}

function gameEditor(game) {
  const initialValues = {
    date: isoDateFromDisplayed(game.date),
    time: isoTimeFromDisplayed(game.time),
    location: game.location,
    opponent: game.opponent,
    notes: game.notes,
  };
  const form = node('form', 'game-editor');
  form.append(
    formField('Date', 'date', 'date', initialValues.date),
    formField('Time', 'time', 'time', initialValues.time),
    formField('Location', 'text', 'location', initialValues.location),
    formField('Opponent', 'text', 'opponent', initialValues.opponent),
    formField('Result or notes', 'text', 'notes', initialValues.notes),
  );
  const actions = node('div', 'game-actions');
  const save = node('button', 'panel-action primary', 'Save');
  save.type = 'submit';
  actions.append(save);
  if (game.tabName !== null) actions.append(button('Open lineup', 'panel-action', () => {
    window.fieldView.showLineup(game.tabName);
    chooseArea('fielding');
  }));
  else if (game.row !== null) actions.append(button('Set up lineup', 'panel-action', () => saveEdit(async () => {
    await createGameTabs([game.number]);
    captain.gamesDirty = true;
  }, `Set up Game ${game.number}`)));
  actions.append(button('Cancel', 'panel-action', () => {
    captain.openGameNumber = null;
    captain.draftGameNumber = null;
    captain.gamesDirty = true;
    window.fieldView.rerender();
  }));
  form.append(actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (captain.saving) return;
    const fields = new FormData(form);
    const values = { date: fields.get('date'), time: fields.get('time'), location: fields.get('location').trim(), opponent: fields.get('opponent').trim(), notes: fields.get('notes').trim() };
    saveEdit(() => saveGameDetails(game, values, initialValues), `Game ${game.number} saved`);
  });
  return form;
}

function gameCard(game) {
  const isOpen = captain.openGameNumber === game.number;
  const card = node('div', isOpen ? 'game-card open' : 'game-card');
  const summary = button('', 'game-summary', () => {
    captain.openGameNumber = isOpen ? null : game.number;
    captain.gamesDirty = true;
    window.fieldView.rerender();
  });
  summary.setAttribute('aria-expanded', String(isOpen));
  const details = [game.date, game.time, game.location, game.notes].filter((detail) => detail !== '').join(' · ');
  const text = node('span', 'game-text');
  text.append(node('strong', undefined, `Game ${game.number}${game.opponent === '' ? '' : ` vs ${game.opponent}`}`), node('span', 'game-meta', details === '' ? 'No date yet' : details));
  summary.append(text, node('span', game.tabName === null ? 'game-state' : 'game-state ready', game.tabName === null ? 'No lineup' : 'Lineup ready'));
  card.append(summary);
  if (isOpen) card.append(gameEditor(game));
  return card;
}

function gamesPanel() {
  if (captain.scheduleError !== null) return [node('p', 'captain-hint', captain.scheduleError)];
  if (captain.scheduleRows === null) return [node('p', 'captain-hint', 'Loading the schedule…')];
  const games = scheduledGames();
  const draft = captain.draftGameNumber === null ? [] : [{ number: captain.draftGameNumber, row: null, date: '', time: '', location: '', opponent: '', notes: '', tabName: null }];
  const needsLineup = games.filter((game) => game.tabName === null && game.date !== '');
  const list = node('div', 'game-list');
  list.append(...[...games, ...draft].map(gameCard));
  const parts = [node('p', 'captain-hint', HINTS.games), list];
  parts.push(button('Add a game', 'panel-action', () => {
    captain.draftGameNumber = Math.max(nextGameNumber(window.fieldView.allLineups()), ...games.map((game) => game.number + 1));
    captain.openGameNumber = captain.draftGameNumber;
    captain.gamesDirty = true;
    window.fieldView.rerender();
  }));
  if (needsLineup.length > 0) parts.push(button(`Set up lineups for ${needsLineup.length} ${needsLineup.length === 1 ? 'game' : 'games'}`, 'panel-action primary', () => saveEdit(async () => {
    await createGameTabs(needsLineup.map((game) => game.number));
    captain.gamesDirty = true;
  }, `Set up ${needsLineup.length} ${needsLineup.length === 1 ? 'lineup' : 'lineups'}`)));
  return parts;
}

function renderPanel(lineup, inField) {
  const panel = element('captain-panel');
  panel.hidden = !captain.active || lineup === null;
  if (panel.hidden) {
    panel.replaceChildren();
    delete panel.dataset.area;
    return;
  }
  if (captain.area === 'games') {
    if (panel.dataset.area === 'games' && !captain.gamesDirty) return;
    captain.gamesDirty = false;
    panel.dataset.area = 'games';
    panel.replaceChildren(...gamesPanel());
    return;
  }
  panel.dataset.area = captain.area;
  if (captain.area === 'kicking') panel.replaceChildren(...kickingPanel(lineup));
  else if (captain.area === 'players') panel.replaceChildren(...playersPanel(lineup));
  else panel.replaceChildren(...fieldingPanel(lineup, inField));
}

function resetEditingState(lineup) {
  captain.tabName = lineup.tabName;
  captain.focus = null;
  captain.selectedRow = null;
  captain.viewedInning = window.fieldView.currentInningIndex();
  captain.editInnings = new Set([captain.viewedInning]);
}

function afterRender() {
  const bar = element('captain-bar');
  const inField = window.fieldView.inFieldMode();
  const isFielding = captain.area === 'fielding';
  bar.hidden = !captain.active;
  document.body.classList.toggle('captain-active', captain.active && inField && isFielding);
  document.body.classList.toggle('captain-list', captain.active && !isFielding);
  element('captain-toggle').hidden = captain.active || !captainToolsOffered();
  element('captain-status').hidden = !captain.active;
  if (!captain.active) {
    renderDock(null, false);
    return;
  }
  const lineup = window.fieldView.currentLineup();
  if (lineup !== null && captain.tabName !== lineup.tabName) resetEditingState(lineup);
  else if (lineup !== null && captain.viewedInning !== window.fieldView.currentInningIndex()) {
    captain.viewedInning = window.fieldView.currentInningIndex();
    captain.editInnings = new Set([captain.viewedInning]);
    captain.focus = null;
  }
  if (lineup === null || (captain.selectedRow !== null && lineupPlayer(lineup, captain.selectedRow) === undefined)) captain.selectedRow = null;
  AREAS.forEach((area) => element(`area-${area}`).setAttribute('aria-pressed', String(captain.area === area)));
  element('area-games').hidden = !captain.canManageGames;
  updateUndoButton();
  renderPanel(lineup, inField);
  if (isFielding && inField) {
    editableElements().forEach(bindEditable);
    decorate();
  }
  renderDock(lineup, inField);
}

async function startCaptainMode() {
  const toggle = element('captain-toggle');
  toggle.disabled = true;
  try {
    const lineup = window.fieldView.currentLineup();
    if (lineup === null || lineup.editable !== true || lineup.players.some((player) => player.sheetRow === undefined)) {
      throw new Error('This lineup cannot be edited from here yet. Reload the page and try again. Sheets that number the kicking order in column B are edited in the sheet');
    }
    let accessToken = await requestAccessToken('');
    let access = await askWorkerForAccess(accessToken);
    if (access.access === 'needs-pick') {
      accessToken = await currentAccessToken();
      await pickSheet(accessToken);
      access = await askWorkerForAccess(accessToken);
      if (access.access !== 'editor') throw new Error('That is not this team\'s sheet. Pick the same sheet your captain made');
    }
    captain.spreadsheetId = access.spreadsheetId;
    await refreshTabs();
    captain.canManageGames = captain.tabs.has(NEW_GAME_TAB_NAME) && captain.tabs.has(SCHEDULE_TAB_NAME);
    captain.rosterNames = null;
    captain.rosterError = null;
    captain.scheduleRows = null;
    captain.scheduleError = null;
    captain.openGameNumber = null;
    captain.draftGameNumber = null;
    captain.undoStack = [];
    captain.active = true;
    captain.area = 'fielding';
    resetEditingState(lineup);
    rememberCaptainDevice();
    window.fieldView.rerender();
  } catch (error) {
    window.fieldView.showMessage('Captain tools', error);
  } finally {
    toggle.disabled = false;
  }
}

function stopCaptainMode() {
  captain.active = false;
  captain.selectedRow = null;
  captain.focus = null;
  captain.accessToken = null;
  captain.spreadsheetId = null;
  captain.tabs = new Map();
  captain.undoStack = [];
  setStatus('');
  window.fieldView.rerender();
}

function chooseArea(area) {
  captain.area = area;
  captain.selectedRow = null;
  captain.focus = null;
  if (area === 'players') loadRosterNames();
  if (area === 'games') loadSchedule();
  window.fieldView.rerender();
}

element('captain-toggle').addEventListener('pointerdown', () => loadScript(SIGN_IN_SCRIPT));
element('captain-toggle').addEventListener('click', startCaptainMode);
element('captain-done').addEventListener('click', stopCaptainMode);
element('captain-undo').addEventListener('click', undoLatest);
AREAS.forEach((area) => element(`area-${area}`).addEventListener('click', () => chooseArea(area)));
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || captain.focus === null) return;
  captain.focus = null;
  window.fieldView.rerender();
});
window.addEventListener('hashchange', () => {
  if (window.fieldView.currentLineup() !== null) window.fieldView.rerender();
});
document.addEventListener('pointermove', moveDrag);
document.addEventListener('pointerup', endDrag);
window.captainTools = { afterRender };
if (window.fieldView.currentLineup() !== null) window.fieldView.rerender();
