import { applyAddedPlayers, applyFieldingChanges, applyKickingMove, applyRsvp, candidatesForSpot, cellAddress, fieldingChangesForInnings, inningRangeLabel, inningsToEdit, inverseKickingMove, kickingMove, nextGameNumber, occupantsOf, playersToAdd, positionChoices, rosterNamesToAdd, rowAfterMove } from './edits.js';
import { NEW_GAME_TAB_NAME, POSITION_CODES, POSITION_NAMES, ROSTER_TAB_NAME, SCHEDULE_TAB_NAME } from './template.js';

const { workerAddress, googleClientId, googleApiKey, googleProjectNumber } = window.KICKBALL;
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SHEETS_ADDRESS = 'https://sheets.googleapis.com/v4/spreadsheets';
const SIGN_IN_SCRIPT = 'https://accounts.google.com/gsi/client';
const PICKER_SCRIPT = 'https://apis.google.com/js/api.js';
const TOKEN_EXPIRY_MARGIN_MILLISECONDS = 60000;
const DRAG_START_PIXELS = 8;
const CLICK_SUPPRESSION_MILLISECONDS = 50;
const NEW_GAME_LOOKUP_ATTEMPTS = 4;
const NEW_GAME_LOOKUP_WAIT_MILLISECONDS = 2000;
const TOAST_MILLISECONDS = 2500;
const TOAST_WITH_UNDO_MILLISECONDS = 7000;
const CAPTAIN_DEVICE_KEY = 'kickball-captain-device';
const CAPTAIN_LINK_HASH = '#captain';
const RSVP_COLUMN_INDEX = 1;
const GAME_NUMBER_LABEL = 'Game #:';
const GAME_DETAIL_FIRST_COLUMN_INDEX = 1;
const AREAS = ['fielding', 'kicking', 'players'];
const SCOPES = [
  { scope: 'inning', label: 'This inning' },
  { scope: 'rest', label: 'Rest of game' },
  { scope: 'all', label: 'All innings' },
];
const RSVP_ANSWERS = ['Yes', 'Maybe', 'No'];
const HINTS = {
  fielding: 'Tap a position to choose who plays there. Tap someone sitting to choose where they play.',
  fieldingElsewhere: 'Pick an inning above to edit the field.',
  kicking: 'Tap a kicker, then tap the spot in the order they should take.',
  players: 'Tell the lineup who is coming, or add someone from the roster.',
  playersWithoutRsvp: 'This sheet marks players who are out with strikethrough. Change that in the sheet.',
};

const element = (id) => document.getElementById(id);
const scriptLoads = new Map();

const captain = {
  active: false,
  area: 'fielding',
  scope: 'inning',
  selectedRow: null,
  saving: false,
  accessToken: null,
  accessTokenExpiresAt: 0,
  spreadsheetId: null,
  tabs: new Map(),
  canCreateGames: false,
  rosterNames: null,
  rosterError: null,
  undo: null,
};

let suppressClicksUntil = 0;
let dragState = null;
let toastTimer = null;

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
  if (captain.accessToken !== null && Date.now() < captain.accessTokenExpiresAt - TOKEN_EXPIRY_MARGIN_MILLISECONDS) return captain.accessToken;
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

async function columnValues(range) {
  const { values = [] } = await sheetsRequest(`/values/${encodeURIComponent(range)}`);
  return values.map((row) => (row[0] ?? '').trim());
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

async function saveAddedPlayers(lineup, names) {
  const additions = playersToAdd(lineup.spareRows, names);
  await confirmSheetStillMatches(additions.map(({ sheetRow }) => ({ address: cellAddress(lineup.tabName, 0, sheetRow), expected: '' })));
  await writeValues(additions.map(({ name, sheetRow }) => ({ range: cellAddress(lineup.tabName, 0, sheetRow), values: [[name]] })), 'RAW');
  Object.assign(lineup, applyAddedPlayers(lineup, additions, lineup.innings.length));
}

async function readRosterNames() {
  await refreshTabs();
  if (!captain.tabs.has(ROSTER_TAB_NAME)) throw new Error(`This sheet has no ${ROSTER_TAB_NAME} tab, so there is nobody to add from here`);
  return (await columnValues(`${ROSTER_TAB_NAME}!A2:A`)).filter((name) => name !== '');
}

async function loadRosterNames() {
  captain.rosterNames = null;
  captain.rosterError = null;
  try {
    captain.rosterNames = await readRosterNames();
  } catch (error) {
    captain.rosterError = error.message;
  }
}

async function scheduleRowFor(gameNumber) {
  const gameNumbers = await columnValues(`${SCHEDULE_TAB_NAME}!A:A`);
  const existingIndex = gameNumbers.indexOf(String(gameNumber));
  return existingIndex === -1 ? { row: gameNumbers.length + 1, isNew: true } : { row: existingIndex + 1, isNew: false };
}

function waitMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createGame(gameDetails) {
  const gameNumber = nextGameNumber(window.fieldView.allLineups());
  const tabName = `Game ${gameNumber} Lineup`;
  showToast(`Creating Game ${gameNumber}…`, { sticky: true });
  await refreshTabs();
  const templateTab = captain.tabs.get(NEW_GAME_TAB_NAME);
  if (templateTab === undefined || !captain.tabs.has(SCHEDULE_TAB_NAME)) throw new Error(`The sheet needs the "${NEW_GAME_TAB_NAME}" and "${SCHEDULE_TAB_NAME}" tabs to start a game from here`);
  if (captain.tabs.has(tabName)) throw new Error(`The sheet already has a tab named "${tabName}". Rename it or use the next number in the sheet`);
  await sheetsRequest(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: [{ duplicateSheet: { sourceSheetId: templateTab.sheetId, insertSheetIndex: templateTab.index, newSheetName: tabName } }] }),
  });
  const gameNumberRow = (await columnValues(`'${tabName}'!A1:A12`)).indexOf(GAME_NUMBER_LABEL) + 1;
  if (gameNumberRow === 0) throw new Error(`The "${NEW_GAME_TAB_NAME}" tab has no "${GAME_NUMBER_LABEL}" label in column A, so the new tab needs its number typed in the sheet`);
  const { row: scheduleRow, isNew: scheduleRowIsNew } = await scheduleRowFor(gameNumber);
  const detailWrites = [gameDetails.date, gameDetails.time, gameDetails.location, gameDetails.opponent]
    .map((value, index) => ({ range: cellAddress(SCHEDULE_TAB_NAME, GAME_DETAIL_FIRST_COLUMN_INDEX + index, scheduleRow), values: [[value]] }))
    .filter(({ values }) => values[0][0] !== '');
  await writeValues([
    { range: cellAddress(tabName, 1, gameNumberRow), values: [[gameNumber]] },
    ...(scheduleRowIsNew ? [{ range: cellAddress(SCHEDULE_TAB_NAME, 0, scheduleRow), values: [[gameNumber]] }] : []),
    ...detailWrites,
  ]);
  captain.area = 'fielding';
  for (let attempt = 1; attempt <= NEW_GAME_LOOKUP_ATTEMPTS; attempt += 1) {
    if (await window.fieldView.reloadLineups(tabName)) return undefined;
    await waitMilliseconds(NEW_GAME_LOOKUP_WAIT_MILLISECONDS);
  }
  throw new Error(`${tabName} was created, but this page has not picked it up yet. Reload the page in a few seconds`);
}

function hideToast() {
  clearTimeout(toastTimer);
  captain.undo = null;
  element('toast').hidden = true;
}

function showToast(text, { isError = false, undo = null, sticky = false } = {}) {
  clearTimeout(toastTimer);
  captain.undo = undo;
  element('toast-text').textContent = text;
  element('toast-undo').hidden = undo === null;
  element('toast').classList.toggle('error', isError);
  element('toast').hidden = false;
  if (!isError && !sticky) toastTimer = setTimeout(hideToast, undo === null ? TOAST_MILLISECONDS : TOAST_WITH_UNDO_MILLISECONDS);
}

async function saveEdit(work, { doneMessage = 'Saved', offerUndo = true } = {}) {
  captain.saving = true;
  showToast('Saving…', { sticky: true });
  try {
    const undo = await work();
    captain.selectedRow = null;
    window.fieldView.changed();
    showToast(doneMessage, { undo: offerUndo ? undo ?? null : null });
  } catch (error) {
    window.fieldView.rerender();
    showToast(error.message, { isError: true });
  } finally {
    captain.saving = false;
  }
}

function applyFielding(sourceRow, target, scope) {
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  let changes;
  try {
    changes = fieldingChangesForInnings(lineup.players, inningsToEdit(scope, inningIndex, lineup.innings.length), sourceRow, target, lineup.innings);
  } catch (error) {
    showToast(error.message, { isError: true });
    return;
  }
  if (changes.length === 0) {
    captain.selectedRow = null;
    decorate();
    return;
  }
  saveEdit(() => saveFielding(lineup, changes));
}

function moveKicker(sourceRow, targetRow) {
  const lineup = window.fieldView.currentLineup();
  const move = kickingMove(lineup.players, sourceRow, targetRow);
  if (move === null) {
    captain.selectedRow = null;
    window.fieldView.rerender();
    return;
  }
  saveEdit(() => saveKickingMove(lineup, move, sourceRow, targetRow));
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

function openSheet({ title, subtitle, body, footer = null }) {
  hideToast();
  element('sheet-title').textContent = title;
  element('sheet-subtitle').textContent = subtitle;
  element('sheet-body').replaceChildren(...body);
  element('sheet-footer').replaceChildren(...(footer ?? []));
  element('sheet-footer').hidden = footer === null;
  element('sheet-backdrop').hidden = false;
  element('captain-sheet').hidden = false;
  element('captain-sheet').focus();
}

function closeSheet() {
  element('captain-sheet').hidden = true;
  element('sheet-backdrop').hidden = true;
  delete element('captain-sheet').dataset.kind;
}

function pickRow(label, badge, onPick, { quietBadge = false, note = null, badgeFirst = false } = {}) {
  const row = button('', badgeFirst ? 'pick badge-first' : 'pick', onPick);
  const badgeElement = badge === null ? null : node('span', quietBadge ? 'pick-badge quiet' : 'pick-badge', badge);
  const end = node('span', 'pick-end');
  if (note !== null) end.append(node('span', 'pick-note', note));
  if (badgeElement !== null && !badgeFirst) end.append(badgeElement);
  if (badgeElement !== null && badgeFirst) row.append(badgeElement);
  row.append(node('span', 'pick-name', label), end);
  return row;
}

function scopeFooter(lineup, inningIndex) {
  if (lineup.innings.length === 1) return null;
  const caption = node('p', 'scope-caption');
  const choices = node('div', 'segmented');
  const isMiddleInning = inningIndex > 0 && inningIndex < lineup.innings.length - 1;
  const distinctScopes = SCOPES.filter(({ scope }) => scope !== 'rest' || isMiddleInning);
  const refresh = () => {
    caption.textContent = `Applies to ${inningRangeLabel(inningsToEdit(captain.scope, inningIndex, lineup.innings.length), lineup.innings).toLowerCase()}`;
    choices.querySelectorAll('button').forEach((choice, index) => choice.setAttribute('aria-pressed', String(distinctScopes[index].scope === captain.scope)));
  };
  choices.append(...distinctScopes.map(({ scope, label }) => {
    const choice = button(label, '', () => {
      captain.scope = scope;
      refresh();
    });
    return choice;
  }));
  refresh();
  return [caption, choices];
}

function openSpotSheet(position) {
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  captain.scope = 'inning';
  const occupants = occupantsOf(lineup.players, inningIndex, position);
  const place = (sourceRow, target) => {
    closeSheet();
    applyFielding(sourceRow, target, captain.scope);
  };
  const holderRows = occupants.map((occupant) => pickRow(`${occupant.name} is here`, null, () => place(occupant.sheetRow, { kind: 'bench' }), { note: 'Sit out' }));
  const candidateRows = candidatesForSpot(lineup.players, inningIndex, position).map((candidate) => {
    const current = candidate.positions[inningIndex];
    return pickRow(candidate.name, current === '' ? 'Sitting' : current, () => place(candidate.sheetRow, { kind: 'spot', position }), { quietBadge: current === '' });
  });
  openSheet({
    title: POSITION_NAMES[POSITION_CODES.indexOf(position)],
    subtitle: occupants.length === 0 ? `Open in inning ${lineup.innings[inningIndex]}` : `Inning ${lineup.innings[inningIndex]}`,
    body: [...holderRows, ...(candidateRows.length === 0 ? [] : [node('p', 'sheet-section', occupants.length === 0 ? 'Put someone here' : 'Or swap in someone else'), ...candidateRows])],
    footer: scopeFooter(lineup, inningIndex),
  });
}

function openPlayerSheet(sheetRow) {
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  const player = lineupPlayer(lineup, sheetRow);
  const current = player.positions[inningIndex];
  captain.scope = 'inning';
  const place = (target) => {
    closeSheet();
    applyFielding(sheetRow, target, captain.scope);
  };
  const sitRow = current === '' ? [] : [pickRow('Sit out', null, () => place({ kind: 'bench' }), { note: `now at ${current}` })];
  const positionRows = positionChoices(lineup.players, inningIndex, current).map(({ position, occupants }) => pickRow(
    POSITION_NAMES[POSITION_CODES.indexOf(position)],
    position,
    () => place({ kind: 'spot', position }),
    { note: occupants.length === 0 ? 'open' : occupants.map((occupant) => occupant.name).join(' and '), badgeFirst: true },
  ));
  openSheet({
    title: player.name,
    subtitle: `${current === '' ? 'Sitting' : `At ${POSITION_NAMES[POSITION_CODES.indexOf(current)]}`} in inning ${lineup.innings[inningIndex]}`,
    body: [...sitRow, node('p', 'sheet-section', 'Where should they play?'), ...positionRows],
    footer: scopeFooter(lineup, inningIndex),
  });
}

function renderRosterSheet() {
  const sheet = element('captain-sheet');
  if (sheet.hidden || sheet.dataset.kind !== 'roster') return;
  const lineup = window.fieldView.currentLineup();
  const body = [];
  let footer = null;
  if (captain.rosterError !== null) {
    body.push(node('p', 'sheet-section', captain.rosterError));
  } else if (captain.rosterNames === null) {
    body.push(node('p', 'sheet-section', 'Loading the roster…'));
  } else {
    const names = rosterNamesToAdd(captain.rosterNames, lineup.players);
    if (names.length === 0) body.push(node('p', 'sheet-section', `Everyone on the ${ROSTER_TAB_NAME} tab is already in this game.`));
    body.push(...names.map((name) => pickRow(name, null, () => saveEdit(() => saveAddedPlayers(lineup, [name])).then(renderRosterSheet), { note: 'Add' })));
    if (names.length > 1) footer = [button('Add everyone', 'panel-action primary', () => saveEdit(() => saveAddedPlayers(lineup, names)).then(renderRosterSheet))];
  }
  element('sheet-body').replaceChildren(...body);
  element('sheet-footer').replaceChildren(...(footer ?? []));
  element('sheet-footer').hidden = footer === null;
}

function openRosterSheet() {
  openSheet({ title: 'Add players', subtitle: `From the ${ROSTER_TAB_NAME} tab. They go in the next empty rows.`, body: [] });
  element('captain-sheet').dataset.kind = 'roster';
  captain.rosterNames = null;
  captain.rosterError = null;
  renderRosterSheet();
  loadRosterNames().then(renderRosterSheet);
}

function formField(labelText, type, name) {
  const label = node('label', undefined, labelText);
  const input = node('input');
  input.type = type;
  input.name = name;
  label.append(input);
  return label;
}

function openNewGameSheet() {
  const gameNumber = nextGameNumber(window.fieldView.allLineups());
  const form = node('form', 'captain-form');
  const submit = node('button', 'panel-action primary', `Create Game ${gameNumber}`);
  submit.type = 'submit';
  form.append(formField('Date', 'date', 'date'), formField('Time', 'time', 'time'), formField('Location', 'text', 'location'), formField('Opponent', 'text', 'opponent'), submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (captain.saving) return;
    const fields = new FormData(form);
    closeSheet();
    saveEdit(() => createGame({ date: fields.get('date'), time: fields.get('time'), location: fields.get('location').trim(), opponent: fields.get('opponent').trim() }));
  });
  openSheet({ title: 'New game', subtitle: 'Fill in what you know. You can change it later on the Schedule tab.', body: [form] });
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
  if (target.kind === 'spot') openSpotSheet(target.position);
  if (target.kind === 'player') openPlayerSheet(target.sheetRow);
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
  applyFielding(sourceRow, target, 'inning');
}

function decorate() {
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  document.querySelectorAll('.edit-selected').forEach((marked) => marked.classList.remove('edit-selected'));
  if (!captain.active || lineup === null || captain.area !== 'fielding') return;
  editableElements().forEach((editable) => {
    const target = describeTarget(editable);
    const isSelected = captain.selectedRow !== null && target !== null && sourceRowFor(target, lineup, inningIndex) === captain.selectedRow && target.kind !== 'bench';
    editable.classList.toggle('edit-selected', isSelected);
  });
}

function bindEditable(editable) {
  editable.addEventListener('click', () => handleTap(editable));
  editable.addEventListener('pointerdown', (event) => startDrag(event, editable));
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

function playersPanel(lineup) {
  const list = node('div', 'player-list');
  if (lineup.usesRsvp) {
    list.append(...lineup.players.map((player) => {
      const answers = node('div', 'rsvp');
      answers.append(...RSVP_ANSWERS.map((answer) => {
        const choice = button(answer, answer.toLowerCase() === 'yes' ? '' : answer.toLowerCase(), () => saveEdit(() => saveRsvp(lineup, player.sheetRow, player.rsvp === answer.toLowerCase() ? '' : answer)));
        choice.setAttribute('aria-pressed', String(player.rsvp === answer.toLowerCase()));
        return choice;
      }));
      const row = node('div', 'player-row');
      row.append(node('span', undefined, player.name), answers);
      return row;
    }));
  }
  return [
    node('p', 'captain-hint', lineup.usesRsvp ? HINTS.players : HINTS.playersWithoutRsvp),
    ...(lineup.usesRsvp ? [list] : []),
    button('Add from roster', 'panel-action', openRosterSheet),
  ];
}

function renderPanel(lineup, inField) {
  const panel = element('captain-panel');
  panel.hidden = !captain.active || lineup === null;
  if (panel.hidden) {
    panel.replaceChildren();
    return;
  }
  if (captain.area === 'kicking') panel.replaceChildren(...kickingPanel(lineup));
  else if (captain.area === 'players') panel.replaceChildren(...playersPanel(lineup));
  else panel.replaceChildren(node('p', 'captain-hint', inField ? HINTS.fielding : HINTS.fieldingElsewhere));
}

function afterRender() {
  const bar = element('captain-bar');
  const inField = window.fieldView.inFieldMode();
  bar.hidden = !captain.active;
  document.body.classList.toggle('captain-active', captain.active && inField && captain.area === 'fielding');
  document.body.classList.toggle('captain-list', captain.active && captain.area !== 'fielding');
  element('captain-toggle').hidden = captain.active || !captainToolsOffered();
  element('new-game').hidden = !captain.active || !captain.canCreateGames;
  if (!captain.active) return;
  const lineup = window.fieldView.currentLineup();
  if (lineup === null || (captain.selectedRow !== null && lineupPlayer(lineup, captain.selectedRow) === undefined)) captain.selectedRow = null;
  AREAS.forEach((area) => element(`area-${area}`).setAttribute('aria-pressed', String(captain.area === area)));
  renderPanel(lineup, inField);
  if (captain.area !== 'fielding' || !inField) return;
  editableElements().forEach(bindEditable);
  decorate();
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
    captain.canCreateGames = captain.tabs.has(NEW_GAME_TAB_NAME) && captain.tabs.has(SCHEDULE_TAB_NAME);
    captain.rosterNames = null;
    captain.rosterError = null;
    captain.active = true;
    captain.area = 'fielding';
    captain.scope = 'inning';
    captain.selectedRow = null;
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
  captain.accessToken = null;
  captain.spreadsheetId = null;
  captain.tabs = new Map();
  closeSheet();
  hideToast();
  window.fieldView.rerender();
}

function chooseArea(area) {
  captain.area = area;
  captain.selectedRow = null;
  window.fieldView.rerender();
}

element('toast').addEventListener('click', (event) => {
  if (event.target === element('toast-undo')) return;
  if (element('toast').classList.contains('error')) hideToast();
});
element('toast-undo').addEventListener('click', () => {
  const undo = captain.undo;
  hideToast();
  if (undo !== null && !captain.saving) saveEdit(undo, { doneMessage: 'Undone', offerUndo: false });
});
element('captain-toggle').addEventListener('pointerdown', () => loadScript(SIGN_IN_SCRIPT));
element('captain-toggle').addEventListener('click', startCaptainMode);
element('captain-done').addEventListener('click', stopCaptainMode);
element('new-game').addEventListener('click', openNewGameSheet);
element('sheet-close').addEventListener('click', closeSheet);
element('sheet-backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSheet();
});
AREAS.forEach((area) => element(`area-${area}`).addEventListener('click', () => chooseArea(area)));
window.addEventListener('hashchange', () => {
  if (window.fieldView.currentLineup() !== null) window.fieldView.rerender();
});
document.addEventListener('pointermove', moveDrag);
document.addEventListener('pointerup', endDrag);
window.captainTools = { afterRender };
if (window.fieldView.currentLineup() !== null) window.fieldView.rerender();
