import { candidatesForSpot, describeInnings, fieldingChangesForInnings, inningsForPreset, inningsHaveDifferentLineups, lineupPlayer, occupantsOf } from '../edits.js';
import { POSITION_CODES, POSITION_NAMES } from '../template.js';
import { button, node } from './dom.js';
import { saveFielding } from './lineupEdits.js';
import { captain, element } from './state.js';
import { saveEdit, setStatus } from './status.js';

const DRAG_START_PIXELS = 8;
const CLICK_SUPPRESSION_MILLISECONDS = 50;
const DOCK_CLEARANCE_PIXELS = 16;
const INNING_PRESETS = [
  { preset: 'odd', label: 'Odd' },
  { preset: 'even', label: 'Even' },
  { preset: 'all', label: 'All' },
];
const HINTS = {
  fielding: 'Tap a position, then pick a player.',
  elsewhere: 'Pick an inning above to edit the field.',
  empty: 'Nobody is in this game yet. Add players on the Players tab first.',
};

let suppressClicksUntil = 0;
let dragState = null;
let keyboardNavigating = false;
let lastEditableKey = null;

function editedInnings() {
  return [...captain.editInnings].sort((first, second) => first - second);
}

function rerender() {
  window.fieldView.rerender();
}

function clearFocus() {
  captain.focus = null;
  rerender();
}

function focusFromTarget(target) {
  return target.kind === 'spot' ? { kind: 'spot', position: target.position } : { kind: 'player', sheetRow: target.sheetRow };
}

function targetIsFocused(target) {
  const { focus } = captain;
  if (focus === null) return false;
  if (focus.kind === 'spot') return target.kind === 'spot' && focus.position === target.position;
  return target.kind === 'player' && focus.sheetRow === target.sheetRow;
}

function advanceFocusAfterFilling(filledPosition) {
  captain.focus = null;
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  const openPositions = POSITION_CODES.filter((position) => occupantsOf(lineup.players, inningIndex, position).length === 0);
  const filledIndex = POSITION_CODES.indexOf(filledPosition);
  const next = openPositions.find((position) => POSITION_CODES.indexOf(position) > filledIndex) ?? openPositions[0];
  if (next !== undefined) captain.focus = { kind: 'spot', position: next };
  rerender();
}

function fieldingLabel(sourceName, target) {
  if (target.kind === 'bench') return `${sourceName} sits`;
  return target.kind === 'spot' ? `${sourceName} to ${target.position}` : `${sourceName} swapped`;
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
    clearFocus();
    return;
  }
  const fillsOpenSpot = target.kind === 'spot' && occupantsOf(lineup.players, inningIndex, target.position).length === 0;
  saveEdit(() => saveFielding(lineup, changes), fieldingLabel(lineupPlayer(lineup, sourceRow).name, target)).then((saved) => {
    if (!saved) return;
    if (fillsOpenSpot) advanceFocusAfterFilling(target.position);
    else clearFocus();
  });
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
  if (captain.focus !== null && captain.focus.kind === 'player' && target.kind === 'spot') {
    applyFielding(captain.focus.sheetRow, target);
    return;
  }
  captain.focus = targetIsFocused(target) ? null : focusFromTarget(target);
  rerender();
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
  editableElements().forEach((editable) => {
    const target = describeTarget(editable);
    if (target === null) return;
    const isDragged = captain.selectedRow !== null && target.kind !== 'bench' && sourceRowFor(target, lineup, inningIndex) === captain.selectedRow;
    const isSelected = targetIsFocused(target) || isDragged;
    editable.classList.toggle('edit-selected', isSelected);
    editable.setAttribute('aria-pressed', String(isSelected));
  });
}

function pickChip(player, inningIndex, onPick) {
  const current = player.positions[inningIndex];
  const chip = button('', 'pick-chip', onPick);
  chip.append(node('span', 'pick-name', player.name));
  if (current !== '') chip.append(node('span', 'pick-badge', current));
  return chip;
}

function playerDockHeader(lineup, inningIndex, close) {
  const player = lineupPlayer(lineup, captain.focus.sheetRow);
  const current = player.positions[inningIndex];
  const header = node('div', 'dock-header');
  const title = node('div', 'dock-title');
  title.append(node('strong', undefined, player.name), node('span', 'dock-sub', current === '' ? 'Sitting. Tap a position on the field.' : `At ${POSITION_NAMES[POSITION_CODES.indexOf(current)]}. Tap another position, or sit them.`));
  header.append(title);
  if (current !== '') header.append(button('Sit out', 'dock-action', () => applyFielding(player.sheetRow, { kind: 'bench' })));
  header.append(close);
  return header;
}

function spotDockContent(lineup, inningIndex, close) {
  const { position } = captain.focus;
  const occupants = occupantsOf(lineup.players, inningIndex, position);
  const header = node('div', 'dock-header');
  const title = node('div', 'dock-title');
  title.append(node('strong', undefined, POSITION_NAMES[POSITION_CODES.indexOf(position)]), node('span', 'dock-sub', occupants.length === 0 ? 'Open. Who plays here?' : `${occupants.map((occupant) => occupant.name).join(' and ')} ${occupants.length === 1 ? 'is' : 'are'} here. Pick a swap.`));
  header.append(title);
  occupants.forEach((occupant) => header.append(button(occupants.length === 1 ? 'Sit out' : `Sit ${occupant.name}`, 'dock-action', () => applyFielding(occupant.sheetRow, { kind: 'bench' }))));
  header.append(close);
  const candidates = candidatesForSpot(lineup.players, inningIndex, position);
  const pick = (candidate) => pickChip(candidate, inningIndex, () => applyFielding(candidate.sheetRow, { kind: 'spot', position }));
  const body = node('div', 'dock-body');
  [['Sitting', candidates.filter((candidate) => candidate.positions[inningIndex] === '')], ['Playing', candidates.filter((candidate) => candidate.positions[inningIndex] !== '')]]
    .filter(([, group]) => group.length > 0)
    .forEach(([heading, group]) => {
      const chips = node('div', 'dock-chips');
      chips.append(...group.map(pick));
      body.append(node('p', 'dock-group', heading), chips);
    });
  return [header, body];
}

function dockContent(lineup, inningIndex) {
  const close = button('×', 'dock-close', clearFocus);
  close.setAttribute('aria-label', 'Close');
  if (captain.focus.kind === 'player') return [playerDockHeader(lineup, inningIndex, close)];
  return spotDockContent(lineup, inningIndex, close);
}

export function renderDock(lineup, inField) {
  const dock = element('captain-dock');
  const { focus } = captain;
  const focusIsGone = focus !== null && focus.kind === 'player' && lineup !== null && lineupPlayer(lineup, focus.sheetRow) === undefined;
  if (focusIsGone) captain.focus = null;
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
  else rerender();
}

function toggleInning(inningIndex) {
  const selected = new Set(captain.editInnings);
  if (selected.has(inningIndex)) {
    if (selected.size === 1) return;
    selected.delete(inningIndex);
  } else selected.add(inningIndex);
  setEditInnings([...selected]);
}

function inningsRow(lineup) {
  const row = node('div', 'innings-edit');
  row.append(node('span', 'innings-edit-label', 'Edit innings'));
  const chips = node('div', 'innings-edit-chips');
  chips.append(...lineup.innings.map((label, index) => {
    const chip = button(label, 'inning-toggle', () => toggleInning(index));
    chip.setAttribute('aria-pressed', String(captain.editInnings.has(index)));
    return chip;
  }));
  const presets = node('div', 'innings-edit-presets');
  presets.append(...INNING_PRESETS.map(({ preset, label }) => button(label, 'inning-preset', () => setEditInnings(inningsForPreset(preset, lineup.innings.length)))));
  row.append(chips, presets);
  return row;
}

export function fieldingPanel(lineup, inField) {
  if (!inField) return [node('p', 'captain-hint', HINTS.elsewhere)];
  if (!lineup.players.some((player) => player.attending)) return [node('p', 'captain-hint', HINTS.empty)];
  const parts = [node('p', 'captain-hint', HINTS.fielding)];
  if (lineup.innings.length < 2) return parts;
  parts.push(inningsRow(lineup));
  if (captain.editInnings.size > 1) {
    const together = editedInnings();
    const differs = inningsHaveDifferentLineups(lineup.players, together);
    parts.push(node('p', 'innings-edit-caption', `Changes apply to ${describeInnings(together, lineup.innings)}.${differs ? ' Their lineups differ, so each one changes on its own.' : ''}`));
  }
  return parts;
}

export function resetEditingState(lineup) {
  captain.tabName = lineup.tabName;
  captain.focus = null;
  captain.selectedRow = null;
  captain.viewedInning = window.fieldView.currentInningIndex();
  captain.editInnings = new Set([captain.viewedInning]);
}

export function followViewedInning() {
  const inningIndex = window.fieldView.currentInningIndex();
  if (captain.viewedInning === inningIndex) return;
  captain.viewedInning = inningIndex;
  captain.editInnings = new Set([inningIndex]);
  captain.focus = null;
}

function editableKey(editable) {
  return editable.dataset.position ?? `row:${editable.dataset.row}`;
}

function editableForKey(key) {
  if (key === null) return null;
  return key.startsWith('row:')
    ? document.querySelector(`#bench li[data-row="${key.slice(4)}"]`)
    : document.querySelector(`#chips .chip[data-position="${key}"]`);
}

export function bindFieldEditing() {
  editableElements().forEach((editable) => {
    editable.addEventListener('click', () => handleTap(editable));
    editable.addEventListener('pointerdown', (event) => startDrag(event, editable));
    editable.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      keyboardNavigating = true;
      handleTap(editable);
    });
    editable.setAttribute('role', 'button');
    editable.setAttribute('tabindex', '0');
  });
  decorate();
}

export function keyboardIsInUse() {
  return keyboardNavigating;
}

export function restoreKeyboardFocus() {
  if (!keyboardNavigating || document.activeElement !== document.body) return;
  const dock = element('captain-dock');
  const placingSittingPlayer = captain.focus !== null && captain.focus.kind === 'player';
  const next = placingSittingPlayer
    ? document.querySelector('#chips .chip')
    : dock.querySelector('.pick-chip') ?? dock.querySelector('button');
  (next ?? editableForKey(lastEditableKey))?.focus();
}

export function installFieldingEvents() {
  document.addEventListener('keydown', (event) => {
    keyboardNavigating = true;
    if (event.key === 'Escape' && captain.focus !== null) clearFocus();
  });
  document.addEventListener('pointerdown', () => { keyboardNavigating = false; });
  document.addEventListener('focusin', (event) => {
    const editable = event.target.closest?.('#chips .chip, #bench li');
    if (editable) lastEditableKey = editableKey(editable);
  });
  document.addEventListener('pointermove', moveDrag);
  document.addEventListener('pointerup', endDrag);
}
