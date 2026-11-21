import { candidatesForSpot, copyInningChanges, fieldingChanges, kickingStyleFor, lineupPlayer, occupantsOf } from '../edits.js';
import { POSITION_CODES, POSITION_NAMES } from '../template.js';
import { button, node } from './dom.js';
import { saveFielding } from './lineupEdits.js';
import { moveKicker } from './people.js';
import { captain, element } from './state.js';
import { saveEdit, setStatus } from './status.js';

const DRAG_START_PIXELS = 8;
const CLICK_SUPPRESSION_MILLISECONDS = 50;
const LONG_PRESS_MILLISECONDS = 250;
const DOCK_CLEARANCE_PIXELS = 16;
const LIFT_VIBRATION_MILLISECONDS = 10;
const HINTS = {
  fielding: 'Tap a position, then pick a player. Tap a kicker, then the spot they should take.',
  elsewhere: 'Pick an inning above to edit the field.',
  empty: 'Nobody is in this game yet. Add players on the Players tab first.',
};

let suppressClicksUntil = 0;
let dragState = null;
let longPress = null;
let keyboardNavigating = false;
let lastEditableKey = null;

function rerender() {
  window.fieldView.rerender();
}

function clearFocus() {
  captain.focus = null;
  rerender();
}

function focusFromTarget(target) {
  return target.kind === 'spot' ? { kind: 'spot', position: target.position } : { kind: target.kind, sheetRow: target.sheetRow };
}

function targetIsFocused(target) {
  const { focus } = captain;
  if (focus === null || focus.kind !== target.kind) return false;
  return focus.kind === 'spot' ? focus.position === target.position : focus.sheetRow === target.sheetRow;
}

function applyKicking(sourceRow, targetRow) {
  captain.focus = null;
  moveKicker(sourceRow, targetRow);
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

function applyFielding(sourceRow, target, { advancesToNextOpenSpot = false } = {}) {
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  let changes;
  try {
    changes = fieldingChanges(lineup.players, inningIndex, sourceRow, target).map((change) => ({ ...change, inningIndex }));
  } catch (error) {
    setStatus(error.message, { isError: true });
    return;
  }
  if (changes.length === 0) {
    captain.selectedRow = null;
    clearFocus();
    return;
  }
  const fillsOpenSpot = advancesToNextOpenSpot && occupantsOf(lineup.players, inningIndex, target.position).length === 0;
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
  return { kind: editKind === 'kicker' ? 'kicker' : 'player', sheetRow: Number(row) };
}

function sourceRowFor(target, lineup, inningIndex) {
  if (target.kind === 'player' || target.kind === 'kicker') return target.sheetRow;
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
  if (captain.focus !== null && captain.focus.kind === 'kicker' && target.kind === 'kicker' && captain.focus.sheetRow !== target.sheetRow) {
    applyKicking(captain.focus.sheetRow, target.sheetRow);
    return;
  }
  captain.focus = targetIsFocused(target) ? null : focusFromTarget(target);
  rerender();
}

const EDITABLE_SELECTOR = '#chips .chip, #bench li, #kicking-order li';

function editableElements() {
  return [...document.querySelectorAll(EDITABLE_SELECTOR)];
}

const isKickingTarget = (target) => target !== null && target.kind === 'kicker';

function startDrag(event, sourceElement) {
  if (event.pointerType === 'touch' || event.button !== 0 || captain.saving) return;
  dragState = { sourceElement, startX: event.clientX, startY: event.clientY, dragging: false, ghost: null };
}

function lift(sourceElement) {
  window.getSelection()?.removeAllRanges();
  sourceElement.classList.add('lifted');
  navigator.vibrate?.(LIFT_VIBRATION_MILLISECONDS);
}

function drop(sourceElement) {
  sourceElement.classList.remove('lifted');
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
    dragState.isKicking = isKickingTarget(target);
    dragState.dragging = true;
    lift(dragState.sourceElement);
    dragState.ghost = node('div', 'drag-ghost', lineupPlayer(window.fieldView.currentLineup(), sourceRow).name);
    document.body.append(dragState.ghost);
    decorate();
  }
  dragState.ghost.style.left = `${event.clientX + 12}px`;
  dragState.ghost.style.top = `${event.clientY + 12}px`;
}

function endDrag(event) {
  if (dragState === null) return;
  const { dragging, ghost, sourceElement, isKicking } = dragState;
  dragState = null;
  drop(sourceElement);
  if (!dragging) return;
  ghost.remove();
  suppressClicksUntil = Date.now() + CLICK_SUPPRESSION_MILLISECONDS;
  const target = describeTarget(document.elementFromPoint(event.clientX, event.clientY) ?? sourceElement);
  const sourceRow = captain.selectedRow;
  if (target === null || sourceRow === null || isKickingTarget(target) !== isKicking) {
    captain.selectedRow = null;
    decorate();
    return;
  }
  if (isKicking) applyKicking(sourceRow, target.sheetRow);
  else applyFielding(sourceRow, target);
}

function startTouchDrag(event, sourceElement) {
  if (captain.saving || event.touches.length !== 1) return;
  const { clientX, clientY } = event.touches[0];
  longPress = { startX: clientX, startY: clientY, armed: false };
  longPress.timer = setTimeout(() => {
    longPress.armed = true;
    dragState = { sourceElement, startX: clientX, startY: clientY, dragging: false, ghost: null };
    lift(sourceElement);
  }, LONG_PRESS_MILLISECONDS);
}

function moveTouchDrag(event) {
  if (longPress === null) return;
  const { clientX, clientY } = event.touches[0];
  if (longPress.armed) {
    event.preventDefault();
    moveDrag({ clientX, clientY });
    return;
  }
  if (Math.hypot(clientX - longPress.startX, clientY - longPress.startY) < DRAG_START_PIXELS) return;
  clearTimeout(longPress.timer);
  longPress = null;
}

function endTouchDrag(event) {
  if (longPress === null) return;
  clearTimeout(longPress.timer);
  const { armed } = longPress;
  longPress = null;
  if (!armed) return;
  if (event.type === 'touchcancel') {
    dragState?.ghost?.remove();
    if (dragState !== null) drop(dragState.sourceElement);
    dragState = null;
    captain.selectedRow = null;
    decorate();
    return;
  }
  if (dragState?.dragging) event.preventDefault();
  const { clientX, clientY } = event.changedTouches[0];
  endDrag({ clientX, clientY });
}

function decorate() {
  const lineup = window.fieldView.currentLineup();
  const inningIndex = window.fieldView.currentInningIndex();
  document.querySelectorAll('.edit-selected').forEach((marked) => marked.classList.remove('edit-selected'));
  if (!captain.active || lineup === null || captain.area !== 'lineup') return;
  const draggingKicker = dragState !== null && dragState.isKicking === true;
  editableElements().forEach((editable) => {
    const target = describeTarget(editable);
    if (target === null) return;
    const inDraggedGroup = isKickingTarget(target) === draggingKicker;
    const isDragged = captain.selectedRow !== null && inDraggedGroup && target.kind !== 'bench' && sourceRowFor(target, lineup, inningIndex) === captain.selectedRow;
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
  const pick = (candidate) => pickChip(candidate, inningIndex, () => applyFielding(candidate.sheetRow, { kind: 'spot', position }, { advancesToNextOpenSpot: true }));
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

function kickerDockHeader(lineup, close) {
  const kickers = lineup.players.filter((player) => player.attending);
  const slot = kickers.findIndex((player) => player.sheetRow === captain.focus.sheetRow) + 1;
  const header = node('div', 'dock-header');
  const title = node('div', 'dock-title');
  title.append(node('strong', undefined, `${lineupPlayer(lineup, captain.focus.sheetRow).name} kicks ${slot}${ordinalSuffix(slot)}`), node('span', 'dock-sub', 'Tap the kicker whose spot they should take.'));
  header.append(title, close);
  return header;
}

function ordinalSuffix(number) {
  const lastTwo = number % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return 'th';
  return { 1: 'st', 2: 'nd', 3: 'rd' }[number % 10] ?? 'th';
}

function dockContent(lineup, inningIndex) {
  const close = button('×', 'dock-close', clearFocus);
  close.setAttribute('aria-label', 'Close');
  if (captain.focus.kind === 'kicker') return [kickerDockHeader(lineup, close)];
  if (captain.focus.kind === 'player') return [playerDockHeader(lineup, inningIndex, close)];
  return spotDockContent(lineup, inningIndex, close);
}

export function renderDock(lineup, inField) {
  const dock = element('captain-dock');
  const { focus } = captain;
  const focusIsGone = focus !== null && focus.kind !== 'spot' && lineup !== null && lineupPlayer(lineup, focus.sheetRow) === undefined;
  if (focusIsGone) captain.focus = null;
  const shows = captain.active && captain.area === 'lineup' && inField && lineup !== null && captain.focus !== null && lineup.players.some((player) => player.attending);
  dock.hidden = !shows;
  document.body.classList.toggle('captain-placing', shows && captain.focus.kind === 'player');
  if (!shows) {
    dock.replaceChildren();
    document.body.style.paddingBottom = '';
    document.body.style.removeProperty('--dock-height');
    return;
  }
  dock.replaceChildren(...dockContent(lineup, window.fieldView.currentInningIndex()));
  document.body.style.paddingBottom = `${dock.offsetHeight}px`;
  document.body.style.setProperty('--dock-height', `${dock.offsetHeight}px`);
  const focusedChip = document.querySelector('#chips .chip.edit-selected, #kicking-order li.edit-selected');
  const hiddenBy = focusedChip === null ? 0 : focusedChip.getBoundingClientRect().bottom - (window.innerHeight - dock.offsetHeight - DOCK_CLEARANCE_PIXELS);
  if (hiddenBy > 0) window.scrollBy({ top: hiddenBy });
}

export function copyInningButton(lineup, inField) {
  const targetInningIndex = window.fieldView.currentInningIndex();
  if (!inField || targetInningIndex === 0 || !lineup.players.some((player) => player.attending)) return [];
  const sourceInningIndex = targetInningIndex - 1;
  const changes = copyInningChanges(lineup.players, sourceInningIndex, targetInningIndex);
  if (changes.length === 0) return [];
  const sourceLabel = lineup.innings[sourceInningIndex];
  return [button(`Copy inning ${sourceLabel} here`, 'copy-inning', () => {
    captain.focus = null;
    saveEdit(() => saveFielding(lineup, changes), `inning ${sourceLabel} copied to inning ${lineup.innings[targetInningIndex]}`);
  })];
}

export function fieldingPanel(lineup, inField) {
  if (!inField) return [node('p', 'captain-hint', HINTS.elsewhere)];
  if (!lineup.players.some((player) => player.attending)) return [node('p', 'captain-hint', HINTS.empty)];
  const parts = captain.undoStack.length === 0 ? [node('p', 'captain-hint', HINTS.fielding)] : [];
  return parts;
}

export function resetEditingState(lineup) {
  captain.tabName = lineup.tabName;
  captain.focus = null;
  captain.selectedRow = null;
}

function editableKey(editable) {
  if (editable.dataset.position !== undefined) return editable.dataset.position;
  return `${editable.dataset.editKind}:${editable.dataset.row}`;
}

function editableForKey(key) {
  if (key === null) return null;
  const [kind, row] = key.split(':');
  if (row === undefined) return document.querySelector(`#chips .chip[data-position="${key}"]`);
  return document.querySelector(`[data-edit-kind="${kind}"][data-row="${row}"]`);
}

function addKickingStyles(lineup) {
  document.querySelectorAll('#kicking-order li').forEach((item) => {
    const style = kickingStyleFor(captain.rosterPlayers, lineupPlayer(lineup, Number(item.dataset.row)).name);
    if (style !== '') item.append(node('span', 'kick-style', style));
  });
}

export function bindFieldEditing() {
  addKickingStyles(window.fieldView.currentLineup());
  editableElements().forEach((editable) => {
    editable.addEventListener('click', () => handleTap(editable));
    editable.addEventListener('pointerdown', (event) => startDrag(event, editable));
    editable.addEventListener('touchstart', (event) => startTouchDrag(event, editable), { passive: true });
    editable.addEventListener('contextmenu', (event) => event.preventDefault());
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
  const focusKind = captain.focus?.kind;
  let next = dock.querySelector('.pick-chip') ?? dock.querySelector('button');
  if (focusKind === 'player') next = document.querySelector('#chips .chip');
  if (focusKind === 'kicker') next = document.querySelector('#kicking-order li');
  (next ?? editableForKey(lastEditableKey))?.focus();
}

export function installFieldingEvents() {
  document.addEventListener('keydown', (event) => {
    keyboardNavigating = true;
    if (event.key === 'Escape' && captain.focus !== null) clearFocus();
  });
  document.addEventListener('pointerdown', () => { keyboardNavigating = false; });
  document.addEventListener('focusin', (event) => {
    const editable = event.target.closest?.(EDITABLE_SELECTOR);
    if (editable) lastEditableKey = editableKey(editable);
  });
  document.addEventListener('pointermove', (event) => { if (event.pointerType !== 'touch') moveDrag(event); });
  document.addEventListener('pointerup', (event) => { if (event.pointerType !== 'touch') endDrag(event); });
  document.addEventListener('touchmove', moveTouchDrag, { passive: false });
  document.addEventListener('touchend', endTouchDrag);
  document.addEventListener('touchcancel', endTouchDrag);
}
