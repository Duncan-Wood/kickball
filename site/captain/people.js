import { headcount, kickingMove, lineupPlayer, rosterNamesToAdd } from '../edits.js';
import { ROSTER_TAB_NAME } from '../template.js';
import { button, node } from './dom.js';
import { saveAddedPlayers, saveKickingMove, saveRemovedPlayers, saveRsvps } from './lineupEdits.js';
import { captain, RSVP_ANSWERS } from './state.js';
import { saveEdit } from './status.js';

export const MINIMUM_PLAYERS = 8;
const HINT = 'Mark who is coming.';

export function moveKicker(sourceRow, targetRow) {
  const lineup = window.fieldView.currentLineup();
  const move = kickingMove(lineup.players, sourceRow, targetRow);
  if (move === null) {
    window.fieldView.rerender();
    return;
  }
  const slot = lineup.players.filter((player) => player.attending).findIndex((player) => player.sheetRow === targetRow) + 1;
  saveEdit(() => saveKickingMove(lineup, move, sourceRow, targetRow), `${lineupPlayer(lineup, sourceRow).name} to kicking spot ${slot}`);
}

function headcountLine(lineup) {
  const count = headcount(lineup.players);
  const anyReplies = count.yes + count.maybe + count.out > 0;
  const isShort = anyReplies && count.playing < MINIMUM_PLAYERS;
  const line = node('p', isShort ? 'headcount short' : 'headcount');
  const breakdown = [[count.yes, 'yes'], [count.maybe, 'maybe'], [count.waiting, 'no reply'], [count.out, 'out']]
    .filter(([amount]) => amount > 0)
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
    const choice = button(answer, answer.toLowerCase() === 'yes' ? '' : answer.toLowerCase(), () => saveEdit(() => saveRsvps(lineup, [{ sheetRow: player.sheetRow, answer: isChosen ? '' : answer }]), `${player.name}: ${isChosen ? 'no reply' : answer}`));
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

function markRestYes(lineup) {
  const waiting = lineup.players.filter((player) => player.rsvp === '');
  if (waiting.length === 0) return [];
  const noun = waiting.length === 1 ? 'player' : 'players';
  return [button(`Mark ${waiting.length} ${noun} with no reply as Yes`, 'panel-action', () => saveEdit(
    () => saveRsvps(lineup, waiting.map(({ sheetRow }) => ({ sheetRow, answer: 'Yes' }))),
    `${waiting.length} ${noun} marked Yes`,
  ))];
}

export function playersPanel(lineup) {
  const parts = [node('p', 'captain-hint', HINT), headcountLine(lineup), ...markRestYes(lineup)];
  if (lineup.players.length > 0) {
    const list = node('div', 'player-list');
    list.append(...lineup.players.map((player) => playerRow(lineup, player)));
    parts.push(list);
  }
  parts.push(node('p', 'captain-subheading', 'Add from the roster'), ...rosterSection(lineup));
  return parts;
}
