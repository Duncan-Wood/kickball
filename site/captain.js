import { applyAddedPlayers, applyFieldingChanges, applyKickingMove, applyRsvp, cellAddress, fieldingChangesForInnings, inningsToEdit, kickingMove, nextGameNumber, playersToAdd, rosterNamesToAdd, rowAfterMove } from './edits.js';
import { NEW_GAME_TAB_NAME, ROSTER_TAB_NAME, SCHEDULE_TAB_NAME } from './template.js';

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
const CAPTAIN_DEVICE_KEY = 'kickball-captain-device';
const CAPTAIN_LINK_HASH = '#captain';
const RSVP_COLUMN_INDEX = 1;
const GAME_NUMBER_LABEL = 'Game #:';
const GAME_DETAIL_FIRST_COLUMN_INDEX = 1;
const AREAS = ['fielding', 'kicking', 'players'];
const SCOPES = ['inning', 'rest', 'all'];
const RSVP_ANSWERS = ['Yes', 'Maybe', 'No'];
const HINTS = {
  fielding: 'Tap a player, then tap where they should go. Tap another player to swap.',
  kicking: 'Tap a kicker, then tap who they should go next to.',
  players: 'Tap Yes, Maybe or No to record a reply, or tap a name to add them to this game.',
  newgame: 'Fill in what you know and leave the rest blank.',
};
const SCOPE_HINTS = {
  inning: '',
  rest: ' This applies to this inning and every later one.',
  all: ' This applies to every inning.',
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
};

let suppressClicksUntil = 0;
let dragState = null;

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
  await confirmSheetStillMatches([
    ...nameExpectations(lineup, changes.map(({ sheetRow }) => sheetRow)),
    ...changes.map(({ sheetRow, inningIndex }) => ({ address: cellAddress(lineup.tabName, lineup.inningColumns[inningIndex], sheetRow), expected: lineupPlayer(lineup, sheetRow).positions[inningIndex] })),
  ]);
  await writeValues(changes.map(({ sheetRow, inningIndex, value }) => ({ range: cellAddress(lineup.tabName, lineup.inningColumns[inningIndex], sheetRow), values: [[value]] })));
  lineup.players = applyFieldingChanges(lineup.players, changes);
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
}

async function saveRsvp(lineup, player, answer) {
  await confirmSheetStillMatches([
    ...nameExpectations(lineup, [player.sheetRow]),
    { address: cellAddress(lineup.tabName, RSVP_COLUMN_INDEX, player.sheetRow), expected: player.rsvp },
  ]);
  await writeValues([{ range: cellAddress(lineup.tabName, RSVP_COLUMN_INDEX, player.sheetRow), values: [[answer]] }]);
  lineup.players = lineup.players.map((candidate) => (candidate.sheetRow === player.sheetRow ? applyRsvp(candidate, answer.toLowerCase()) : candidate));
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
  window.fieldView.rerender();
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
  setStatus(`Creating Game ${gameNumber}…`);
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
    if (await window.fieldView.reloadLineups(tabName)) return;
    await waitMilliseconds(NEW_GAME_LOOKUP_WAIT_MILLISECONDS);
  }
  throw new Error(`${tabName} was created, but this page has not picked it up yet. Reload the page in a few seconds`);
}

function setStatus(text, isError = false) {
  const status = element('captain-status');
  status.textContent = text;
  status.classList.toggle('error', isError);
}

function hintFor(area) {
  return area === 'fielding' ? HINTS.fielding + SCOPE_HINTS[captain.scope] : HINTS[area];
}

async function saveEdit(work) {
  captain.saving = true;
  setStatus('Saving…');
  try {
    await work();
    captain.selectedRow = null;
    captain.scope = 'inning';
    window.fieldView.changed();
    setStatus('Saved');
  } catch (error) {
    window.fieldView.rerender();
    setStatus(error.message, true);
  } finally {
    captain.saving = false;
  }
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
  const occupants = lineup.players.filter((player) => player.attending && player.positions[inningIndex] === target.position);
  return occupants.length === 0 ? null : occupants[occupants.length - 1].sheetRow;
}

function chooseFrom(target) {
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  const sourceRow = sourceRowFor(target, lineup, inningIndex);
  if (sourceRow === null) {
    setStatus(hintFor(captain.area));
    return;
  }
  captain.selectedRow = sourceRow;
  setStatus(`${lineupPlayer(lineup, sourceRow).name} selected. ${captain.area === 'fielding' ? 'Tap where they should go.' : 'Tap who they should go next to.'}`);
  decorate();
}

function dropOn(target) {
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  const sourceRow = captain.selectedRow;
  if (captain.area === 'kicking') {
    if (target.kind !== 'player') return;
    let move;
    try {
      move = kickingMove(lineup.players, sourceRow, target.sheetRow);
    } catch (error) {
      setStatus(error.message, true);
      return;
    }
    if (move === null) {
      captain.selectedRow = null;
      decorate();
      return;
    }
    saveEdit(() => saveKickingMove(lineup, move, sourceRow, target.sheetRow));
    return;
  }
  let changes;
  try {
    changes = fieldingChangesForInnings(lineup.players, inningsToEdit(captain.scope, inningIndex, lineup.innings.length), sourceRow, target, lineup.innings);
  } catch (error) {
    setStatus(error.message, true);
    return;
  }
  if (changes.length === 0) {
    captain.selectedRow = null;
    decorate();
    return;
  }
  saveEdit(() => saveFielding(lineup, changes));
}

function handleTap(targetElement) {
  if (captain.saving || Date.now() < suppressClicksUntil) return;
  const target = describeTarget(targetElement);
  if (target === null) return;
  if (captain.selectedRow === null) {
    chooseFrom(target);
    return;
  }
  if (target.kind === 'player' && target.sheetRow === captain.selectedRow) {
    captain.selectedRow = null;
    setStatus(hintFor(captain.area));
    decorate();
    return;
  }
  if (target.kind === 'spot' && sourceRowFor(target, window.fieldView.currentLineup(), window.fieldView.currentInningIndex()) === captain.selectedRow) {
    captain.selectedRow = null;
    setStatus(hintFor(captain.area));
    decorate();
    return;
  }
  dropOn(target);
}

function editableElements() {
  if (captain.area === 'kicking') return [...document.querySelectorAll('#kicking-order li')];
  return [...document.querySelectorAll('#chips .chip, #bench li, #sit-target')];
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
    dragState.ghost = document.createElement('div');
    dragState.ghost.className = 'drag-ghost';
    dragState.ghost.textContent = lineupPlayer(window.fieldView.currentLineup(), sourceRow).name;
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
  if (target === null) {
    captain.selectedRow = null;
    decorate();
    return;
  }
  dropOn(target);
}

function decorate() {
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  document.querySelectorAll('.edit-selected').forEach((marked) => marked.classList.remove('edit-selected'));
  if (!captain.active || lineup === null) return;
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

function panelButton(text, onClick, isSelected = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.classList.toggle('selected', isSelected);
  button.addEventListener('click', () => {
    if (!captain.saving) onClick();
  });
  return button;
}

function panelHeading(text) {
  const heading = document.createElement('h2');
  heading.textContent = text;
  return heading;
}

function panelNote(text) {
  const note = document.createElement('p');
  note.className = 'captain-status';
  note.textContent = text;
  return note;
}

function rsvpRows(lineup) {
  return lineup.players.map((player) => {
    const row = document.createElement('div');
    row.className = 'captain-player';
    const answers = document.createElement('div');
    answers.className = 'captain-answers';
    answers.append(...RSVP_ANSWERS.map((answer) => panelButton(answer, () => saveEdit(() => saveRsvp(lineup, player, player.rsvp === answer.toLowerCase() ? '' : answer)), player.rsvp === answer.toLowerCase())));
    row.append(player.name, answers);
    return row;
  });
}

function addPlayersSection(lineup) {
  if (captain.rosterError !== null) return [panelNote(captain.rosterError)];
  if (captain.rosterNames === null) return [panelNote('Loading the roster…')];
  const names = rosterNamesToAdd(captain.rosterNames, lineup.players);
  if (names.length === 0) return [panelNote(`Everyone on the ${ROSTER_TAB_NAME} tab is already in this game.`)];
  const chips = document.createElement('div');
  chips.className = 'captain-chips';
  chips.append(...names.map((name) => panelButton(name, () => saveEdit(() => saveAddedPlayers(lineup, [name])))));
  return [chips, panelButton('Add everyone', () => saveEdit(() => saveAddedPlayers(lineup, names)))];
}

function playersPanel(lineup) {
  const attendance = lineup.usesRsvp
    ? [panelHeading('Who is playing'), ...rsvpRows(lineup)]
    : [panelNote('This sheet marks players who are out with strikethrough. Change that in the sheet.')];
  return [...attendance, panelHeading('Add to this game'), ...addPlayersSection(lineup)];
}

function formField(labelText, type, name) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  label.append(input);
  return label;
}

function newGamePanel() {
  const gameNumber = nextGameNumber(window.fieldView.allLineups());
  const form = document.createElement('form');
  form.className = 'captain-form';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'primary';
  submit.textContent = `Create Game ${gameNumber}`;
  form.append(formField('Date', 'date', 'date'), formField('Time', 'time', 'time'), formField('Location', 'text', 'location'), formField('Opponent', 'text', 'opponent'), submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (captain.saving) return;
    const fields = new FormData(form);
    saveEdit(() => createGame({ date: fields.get('date'), time: fields.get('time'), location: fields.get('location').trim(), opponent: fields.get('opponent').trim() }));
  });
  return [form];
}

function renderPanel(lineup) {
  const panel = element('captain-panel');
  const showsPanel = captain.active && lineup !== null && (captain.area === 'players' || captain.area === 'newgame');
  panel.hidden = !showsPanel;
  if (!showsPanel) {
    delete panel.dataset.area;
    panel.replaceChildren();
    return;
  }
  if (captain.area === 'newgame' && panel.dataset.area === 'newgame') return;
  panel.dataset.area = captain.area;
  panel.replaceChildren(...(captain.area === 'players' ? playersPanel(lineup) : newGamePanel()));
}

function afterRender() {
  const bar = element('captain-bar');
  const inField = window.fieldView.inFieldMode();
  const editsGrid = captain.area === 'fielding' || captain.area === 'kicking';
  bar.hidden = !captain.active;
  document.body.classList.toggle('captain-active', captain.active && inField && editsGrid);
  document.body.classList.toggle('captain-kicking', captain.active && inField && captain.area === 'kicking');
  element('captain-toggle').hidden = captain.active || !captainToolsOffered();
  if (!captain.active) return;
  const lineup = window.fieldView.currentLineup();
  if (lineup === null || (captain.selectedRow !== null && lineupPlayer(lineup, captain.selectedRow) === undefined)) captain.selectedRow = null;
  AREAS.forEach((area) => element(`area-${area}`).classList.toggle('selected', captain.area === area));
  SCOPES.forEach((scope) => {
    element(`scope-${scope}`).hidden = captain.area !== 'fielding';
    element(`scope-${scope}`).classList.toggle('selected', captain.scope === scope);
  });
  element('scope-label').hidden = captain.area !== 'fielding';
  element('area-new-game').hidden = !captain.canCreateGames;
  element('area-new-game').classList.toggle('selected', captain.area === 'newgame');
  element('captain-options').hidden = captain.area !== 'fielding' && !captain.canCreateGames;
  element('sit-target').hidden = captain.area !== 'fielding' || !inField;
  renderPanel(lineup);
  if (!editsGrid) return;
  if (!inField) {
    setStatus('Pick an inning to edit the field');
    return;
  }
  editableElements().filter((editable) => editable.id !== 'sit-target').forEach(bindEditable);
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
    setStatus(hintFor('fielding'));
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
  setStatus('');
  window.fieldView.rerender();
}

function chooseArea(area) {
  captain.area = area;
  captain.scope = 'inning';
  captain.selectedRow = null;
  setStatus(hintFor(area));
  if (area === 'players') loadRosterNames();
  window.fieldView.rerender();
}

function chooseScope(scope) {
  captain.scope = scope;
  setStatus(hintFor('fielding'));
  window.fieldView.rerender();
}

bindEditable(element('sit-target'));
element('captain-toggle').addEventListener('pointerdown', () => loadScript(SIGN_IN_SCRIPT));
element('captain-toggle').addEventListener('click', startCaptainMode);
element('captain-done').addEventListener('click', stopCaptainMode);
AREAS.forEach((area) => element(`area-${area}`).addEventListener('click', () => chooseArea(area)));
element('area-new-game').addEventListener('click', () => chooseArea('newgame'));
SCOPES.forEach((scope) => element(`scope-${scope}`).addEventListener('click', () => chooseScope(scope)));
window.addEventListener('hashchange', () => {
  if (window.fieldView.currentLineup() !== null) window.fieldView.rerender();
});
document.addEventListener('pointermove', moveDrag);
document.addEventListener('pointerup', endDrag);
window.captainTools = { afterRender };
