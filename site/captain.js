import { applyFieldingChanges, applyKickingMove, cellAddress, fieldingChanges, kickingMove } from './edits.js';

const { workerAddress, googleClientId, googleApiKey, googleProjectNumber } = window.KICKBALL;
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SHEETS_ADDRESS = 'https://sheets.googleapis.com/v4/spreadsheets';
const SIGN_IN_SCRIPT = 'https://accounts.google.com/gsi/client';
const PICKER_SCRIPT = 'https://apis.google.com/js/api.js';
const TOKEN_EXPIRY_MARGIN_MILLISECONDS = 60000;
const DRAG_START_PIXELS = 8;
const CLICK_SUPPRESSION_MILLISECONDS = 50;
const HINTS = {
  fielding: 'Tap a player, then tap where they should go. Tap another player to swap.',
  kicking: 'Tap a kicker, then tap who they should go next to.',
};

const element = (id) => document.getElementById(id);
const scriptLoads = new Map();

const captain = {
  active: false,
  area: 'fielding',
  selectedRow: null,
  saving: false,
  accessToken: null,
  accessTokenExpiresAt: 0,
  spreadsheetId: null,
  sheetIds: new Map(),
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

async function sheetIdFor(tabName) {
  if (!captain.sheetIds.has(tabName)) {
    const overview = await sheetsRequest('?fields=sheets.properties(sheetId,title)');
    overview.sheets.forEach(({ properties }) => captain.sheetIds.set(properties.title, properties.sheetId));
  }
  if (!captain.sheetIds.has(tabName)) throw new Error(`The tab "${tabName}" is no longer in the sheet`);
  return captain.sheetIds.get(tabName);
}

async function currentCellValues(addresses) {
  const query = addresses.map((address) => `ranges=${encodeURIComponent(address)}`).join('&');
  const { valueRanges } = await sheetsRequest(`/values:batchGet?${query}`);
  return valueRanges.map((range) => (range.values?.[0]?.[0] ?? '').trim());
}

async function confirmSheetStillMatches(expectations) {
  const current = await currentCellValues(expectations.map(({ address }) => address));
  const changedIndex = expectations.findIndex(({ expected }, index) => expected !== current[index]);
  if (changedIndex !== -1) {
    window.fieldView.refreshNow();
    throw new Error('The sheet changed since this page last updated, so nothing was saved. Look at the lineup and try again');
  }
}

function lineupPlayer(lineup, sheetRow) {
  return lineup.players.find((player) => player.sheetRow === sheetRow);
}

async function saveFielding(lineup, inningIndex, changes) {
  const column = lineup.inningColumns[inningIndex];
  await confirmSheetStillMatches(changes.flatMap(({ sheetRow }) => {
    const player = lineupPlayer(lineup, sheetRow);
    return [
      { address: cellAddress(lineup.tabName, 0, sheetRow), expected: player.name },
      { address: cellAddress(lineup.tabName, column, sheetRow), expected: player.positions[inningIndex] },
    ];
  }));
  await sheetsRequest('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: changes.map(({ sheetRow, value }) => ({ range: cellAddress(lineup.tabName, column, sheetRow), values: [[value]] })),
    }),
  });
  lineup.players = applyFieldingChanges(lineup.players, inningIndex, changes);
}

async function saveKickingMove(lineup, move, sourceRow, targetRow) {
  await confirmSheetStillMatches([sourceRow, targetRow].map((sheetRow) => ({ address: cellAddress(lineup.tabName, 0, sheetRow), expected: lineupPlayer(lineup, sheetRow).name })));
  const sheetId = await sheetIdFor(lineup.tabName);
  await sheetsRequest(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ moveDimension: { source: { sheetId, dimension: 'ROWS', startIndex: move.fromRow - 1, endIndex: move.fromRow }, destinationIndex: move.destinationIndex } }],
    }),
  });
  lineup.players = applyKickingMove(lineup.players, move);
}

function setStatus(text, isError = false) {
  const status = element('captain-status');
  status.textContent = text;
  status.classList.toggle('error', isError);
}

async function saveEdit(work) {
  captain.saving = true;
  setStatus('Saving…');
  try {
    await work();
    captain.selectedRow = null;
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
    setStatus(HINTS[captain.area]);
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
    changes = fieldingChanges(lineup.players, inningIndex, sourceRow, target);
  } catch (error) {
    setStatus(error.message, true);
    return;
  }
  if (changes.length === 0) {
    captain.selectedRow = null;
    decorate();
    return;
  }
  saveEdit(() => saveFielding(lineup, inningIndex, changes));
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
    setStatus(HINTS[captain.area]);
    decorate();
    return;
  }
  if (target.kind === 'spot' && sourceRowFor(target, window.fieldView.currentLineup(), window.fieldView.currentInningIndex()) === captain.selectedRow) {
    captain.selectedRow = null;
    setStatus(HINTS[captain.area]);
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

function afterRender() {
  const bar = element('captain-bar');
  const inField = window.fieldView.inFieldMode();
  bar.hidden = !captain.active;
  document.body.classList.toggle('captain-active', captain.active && inField);
  document.body.classList.toggle('captain-kicking', captain.active && inField && captain.area === 'kicking');
  element('captain-toggle').hidden = captain.active;
  if (!captain.active) return;
  const lineup = window.fieldView.currentLineup();
  if (lineup === null || (captain.selectedRow !== null && lineupPlayer(lineup, captain.selectedRow) === undefined)) captain.selectedRow = null;
  element('area-fielding').classList.toggle('selected', captain.area === 'fielding');
  element('area-kicking').classList.toggle('selected', captain.area === 'kicking');
  element('sit-target').hidden = captain.area !== 'fielding' || !inField;
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
    captain.active = true;
    captain.area = 'fielding';
    captain.selectedRow = null;
    setStatus(HINTS.fielding);
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
  setStatus('');
  window.fieldView.rerender();
}

function chooseArea(area) {
  captain.area = area;
  captain.selectedRow = null;
  setStatus(HINTS[area]);
  window.fieldView.rerender();
}

bindEditable(element('sit-target'));
element('captain-toggle').addEventListener('pointerdown', () => loadScript(SIGN_IN_SCRIPT));
element('captain-toggle').addEventListener('click', startCaptainMode);
element('captain-done').addEventListener('click', stopCaptainMode);
element('area-fielding').addEventListener('click', () => chooseArea('fielding'));
element('area-kicking').addEventListener('click', () => chooseArea('kicking'));
document.addEventListener('pointermove', moveDrag);
document.addEventListener('pointerup', endDrag);
window.captainTools = { afterRender };
