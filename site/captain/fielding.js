import { candidatesForSpot, copiedLineup, copyInningChanges, fieldingChanges, kickingStyleFor, lineupPlayer, occupantsOf, wouldRatherNotPlay } from '../edits.js';
import { POSITION_CODES, POSITION_NAMES } from '../template.js';
import { button, node } from './dom.js';
import { saveFielding, saveLineupRows } from './lineupEdits.js';
import { chooseArea } from './navigation.js';
import { moveKicker } from './people.js';
import { captain, element } from './state.js';
import { saveEdit, setStatus } from './status.js';

const DOCK_CLEARANCE_PIXELS = 16;
const andList = new Intl.ListFormat(document.documentElement.lang, { type: 'conjunction' });
const HINTS = {
  elsewhere: 'Pick an inning above to edit the field.',
  empty: 'Nobody has said yes yet. Mark who is coming on RSVPs, then set the lineup here.',
};

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

function handleTap(targetElement) {
  if (captain.saving) return;
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

function decorate() {
  const lineup = window.fieldView.currentLineup();
  document.querySelectorAll('.edit-selected').forEach((marked) => marked.classList.remove('edit-selected'));
  if (!captain.active || lineup === null || captain.area !== 'lineup') return;
  editableElements().forEach((editable) => {
    const target = describeTarget(editable);
    if (target === null) return;
    const isSelected = targetIsFocused(target);
    editable.classList.toggle('edit-selected', isSelected);
    editable.setAttribute('aria-pressed', String(isSelected));
  });
}

function pickChip(player, inningIndex, position, onPick) {
  const current = player.positions[inningIndex];
  const chip = button('', 'pick-chip', onPick);
  chip.append(node('span', 'pick-name', player.name));
  if (current !== '') chip.append(node('span', 'pick-badge', current));
  if (wouldRatherNotPlay(captain.rosterPlayers, player.name, position)) chip.append(node('span', 'rather-not-badge', 'Rather not'));
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
  title.append(node('strong', undefined, POSITION_NAMES[POSITION_CODES.indexOf(position)]), node('span', 'dock-sub', occupants.length === 0 ? 'Open. Who plays here?' : `${andList.format(occupants.map((occupant) => occupant.name))} ${occupants.length === 1 ? 'is' : 'are'} here. Pick a swap.`));
  header.append(title);
  occupants.forEach((occupant) => header.append(button(occupants.length === 1 ? 'Sit out' : `Sit ${occupant.name}`, 'dock-action', () => applyFielding(occupant.sheetRow, { kind: 'bench' }))));
  header.append(close);
  const candidates = candidatesForSpot(lineup.players, inningIndex, position);
  const pick = (candidate) => pickChip(candidate, inningIndex, position, () => applyFielding(candidate.sheetRow, { kind: 'spot', position }, { advancesToNextOpenSpot: true }));
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
  const heading = node('strong');
  heading.append(node('bdi', undefined, lineupPlayer(lineup, captain.focus.sheetRow).name), ` kicks ${slot}${ordinalSuffix(slot)}`);
  title.append(heading, node('span', 'dock-sub', 'Tap the kicker whose spot they should take.'));
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

export function copyInningControls(lineup, inField) {
  const sourceInningIndex = window.fieldView.currentInningIndex();
  if (!inField || lineup.innings.length < 2 || !lineup.players.some((player) => player.attending)) return [];
  const sourceLabel = lineup.innings[sourceInningIndex];
  const controls = node('div', 'copy-to');
  controls.append(node('span', 'copy-to-label', 'Copy to'));
  lineup.innings.forEach((targetLabel, targetInningIndex) => {
    if (targetInningIndex === sourceInningIndex) return;
    const changes = copyInningChanges(lineup.players, sourceInningIndex, targetInningIndex);
    const target = button(targetLabel, 'inning-toggle', () => {
      captain.focus = null;
      saveEdit(() => saveFielding(lineup, changes), `inning ${sourceLabel} copied to inning ${targetLabel}`);
    });
    const matches = changes.length === 0;
    target.disabled = matches;
    target.setAttribute('aria-pressed', String(matches));
    target.setAttribute('aria-label', matches ? `Inning ${targetLabel} already matches` : `Copy inning ${sourceLabel} to inning ${targetLabel}`);
    controls.append(target);
  });
  return [controls];
}

export function fieldingPanel(lineup, inField) {
  if (!inField) return [node('p', 'captain-hint', HINTS.elsewhere)];
  if (!lineup.players.some((player) => player.attending)) return [node('p', 'captain-hint', HINTS.empty), button('Go to RSVPs', 'panel-action primary', () => chooseArea('rsvps'))];
  return copyLineupButton(lineup);
}

function lastLineupWithPositions(lineup) {
  const lineups = window.fieldView.allLineups();
  const earlier = lineups.slice(0, lineups.findIndex((candidate) => candidate.tabName === lineup.tabName));
  return earlier.reverse().find((candidate) => candidate.players.some((player) => player.attending && player.positions.some((position) => position !== '')));
}

function copyLineupButton(lineup) {
  const isEmpty = lineup.players.every((player) => player.positions.every((position) => position === ''));
  const source = isEmpty ? lastLineupWithPositions(lineup) : undefined;
  if (source === undefined) return [];
  const sourceName = source.date === '' || source.label.includes(source.date) ? source.label : `${source.label} (${source.date})`;
  return [button(`Copy lineup from ${sourceName}`, 'panel-action', () => saveEdit(
    () => saveLineupRows(lineup, copiedLineup(lineup.players, source.players, lineup.innings.length)),
    `Copied the lineup from ${source.label}`,
  ))];
}

export function resetEditingState(lineup) {
  captain.tabName = lineup.tabName;
  captain.focus = null;
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

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const CHIP_HALF_WIDTH = 39;

function markRatherNotChips(lineup) {
  const inningIndex = window.fieldView.currentInningIndex();
  document.querySelectorAll('#chips .chip').forEach((chip) => {
    const { position } = chip.dataset;
    const reluctant = occupantsOf(lineup.players, inningIndex, position).filter((player) => wouldRatherNotPlay(captain.rosterPlayers, player.name, position));
    if (reluctant.length === 0) return;
    chip.classList.add('rather-not');
    chip.setAttribute('aria-label', `${chip.getAttribute('aria-label')}, ${andList.format(reluctant.map((player) => player.name))} would rather not play ${position}`);
    const box = chip.querySelector('.chip-box');
    const mark = document.createElementNS(SVG_NAMESPACE, 'text');
    mark.setAttribute('class', 'rather-not-mark');
    mark.setAttribute('x', String(Number(box.getAttribute('x')) + CHIP_HALF_WIDTH * 2 - 2));
    mark.setAttribute('y', String(Number(box.getAttribute('y')) + 1));
    mark.textContent = '!';
    chip.append(mark);
  });
}

function addKickingStyles(lineup) {
  document.querySelectorAll('#kicking-order li').forEach((item) => {
    const style = kickingStyleFor(captain.rosterPlayers, lineupPlayer(lineup, Number(item.dataset.row)).name);
    if (style !== '') item.append(node('span', 'kick-style', style));
  });
}

export function bindFieldEditing() {
  addKickingStyles(window.fieldView.currentLineup());
  markRatherNotChips(window.fieldView.currentLineup());
  editableElements().forEach((editable) => {
    editable.addEventListener('click', () => handleTap(editable));
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
}
