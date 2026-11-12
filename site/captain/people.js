import { headcount, kickingMove, lineupPlayer, rosterNamesToAdd } from '../edits.js';
import { ROSTER_TAB_NAME } from '../template.js';
import { button, node } from './dom.js';
import { saveAddedPlayers, saveKickingMove, saveRemovedPlayers, saveRsvp } from './lineupEdits.js';
import { captain, RSVP_ANSWERS } from './state.js';
import { saveEdit } from './status.js';

export const MINIMUM_PLAYERS = 8;
const HINTS = {
  kicking: 'Tap a kicker, then tap the spot in the order they should take.',
  players: 'Tell the lineup who is coming, or add and remove players for this game.',
  playersWithoutRsvp: 'This sheet has no RSVP column, so players who are out are struck through in the sheet. You can still add players from the roster here.',
};

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

export function kickingPanel(lineup) {
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

function headcountLine(lineup) {
  const count = headcount(lineup.players);
  const isShort = count.playing < MINIMUM_PLAYERS;
  const line = node('p', isShort ? 'headcount short' : 'headcount');
  const breakdown = [[count.yes, 'yes'], [count.maybe, 'maybe'], [count.waiting, 'no reply'], [count.out, 'out']]
    .filter(([amount, label]) => amount > 0 && (lineup.usesRsvp || label === 'out'))
    .map(([amount, label]) => `${amount} ${label}`)
    .join(', ');
  line.append(node('strong', undefined, `${count.playing} playing`), node('span', 'headcount-detail', breakdown));
  if (isShort) line.append(node('span', 'headcount-warning', `Need ${MINIMUM_PLAYERS} to play`));
  return line;
}

function rosterSection(lineup) {
  if (captain.rosterError !== null) return [node('p', 'captain-hint', captain.rosterError)];
  if (captain.rosterNames === null) return [node('p', 'captain-hint', 'Loading the roster…')];
  const names = rosterNamesToAdd(captain.rosterNames, lineup.players);
  if (names.length === 0) return [node('p', 'captain-hint', `Everyone on the ${ROSTER_TAB_NAME} tab is in this game.`)];
  const room = lineup.spareRows.length;
  if (room === 0) return [node('p', 'captain-hint', `${names.length} on the ${ROSTER_TAB_NAME} tab ${names.length === 1 ? 'is' : 'are'} not in this game, and the grid has no empty rows. Add rows to the grid in the sheet to bring them in.`)];
  const chips = node('div', 'roster-chips');
  chips.append(...names.map((name) => button(name, 'roster-chip', () => saveEdit(() => saveAddedPlayers(lineup, [name]), `Added ${name}`))));
  const rest = [];
  if (names.length > 1 && names.length <= room) rest.push(button(`Add all ${names.length}`, 'panel-action', () => saveEdit(() => saveAddedPlayers(lineup, names), `Added ${names.length} players`)));
  if (names.length > room) rest.push(node('p', 'captain-hint', `The grid has ${room} empty ${room === 1 ? 'row' : 'rows'}. Add rows in the sheet to fit everyone.`));
  return [chips, ...rest];
}

function playerRow(lineup, player) {
  const answers = node('div', 'rsvp');
  answers.append(...RSVP_ANSWERS.map((answer) => {
    const isChosen = player.rsvp === answer.toLowerCase();
    const choice = button(answer, answer.toLowerCase() === 'yes' ? '' : answer.toLowerCase(), () => saveEdit(() => saveRsvp(lineup, player.sheetRow, isChosen ? '' : answer), `${player.name}: ${isChosen ? 'no reply' : answer}`));
    choice.setAttribute('aria-pressed', String(isChosen));
    return choice;
  }));
  const remove = button('×', 'player-remove', () => saveEdit(() => saveRemovedPlayers(lineup, [player.sheetRow]), `Removed ${player.name}`));
  remove.setAttribute('aria-label', `Remove ${player.name} from this game`);
  remove.title = 'Remove from this game';
  const row = node('div', 'player-row');
  row.append(node('span', 'player-name', player.name), answers, remove);
  return row;
}

export function playersPanel(lineup) {
  const parts = [node('p', 'captain-hint', lineup.usesRsvp ? HINTS.players : HINTS.playersWithoutRsvp), headcountLine(lineup)];
  if (lineup.usesRsvp && lineup.players.length > 0) {
    const list = node('div', 'player-list');
    list.append(...lineup.players.map((player) => playerRow(lineup, player)));
    parts.push(list);
  }
  parts.push(node('p', 'captain-subheading', 'Add from the roster'), ...rosterSection(lineup));
  return parts;
}
