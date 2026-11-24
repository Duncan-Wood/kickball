import { headcount, isRegularPlayer, kickingMove, lineupPlayer, namesFromLines, rosterNamesToAdd } from '../edits.js';
import { button, formField, node } from './dom.js';
import { inOrder, saveAddedPlayers, saveKickingMove, saveRemovedPlayers, saveRsvps } from './lineupEdits.js';
import { addRosterPlayers } from './roster.js';
import { captain, RSVP_ANSWERS } from './state.js';
import { saveEdit, setStatus } from './status.js';

export const MINIMUM_PLAYERS = 8;

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

function playerRow(lineup, player) {
  const answers = node('div', 'rsvp');
  answers.append(...RSVP_ANSWERS.map((answer) => {
    const isChosen = player.rsvp === answer.toLowerCase();
    const choice = button(answer, answer.toLowerCase() === 'yes' ? '' : answer.toLowerCase(), () => saveEdit(() => saveRsvps(lineup, [{ sheetRow: player.sheetRow, answer: isChosen ? '' : answer }]), `${player.name}: ${isChosen ? 'no reply' : answer}`));
    choice.setAttribute('aria-pressed', String(isChosen));
    return choice;
  }));
  const row = node('div', 'player-row');
  row.append(node('span', 'player-name', player.name), answers);
  if (!isRegularPlayer(captain.rosterPlayers, player.name)) {
    const remove = button('×', 'player-remove', () => saveEdit(() => saveRemovedPlayers(lineup, [player.sheetRow]), `Removed ${player.name}`));
    remove.setAttribute('aria-label', `Take ${player.name} out of this game`);
    row.append(remove);
  }
  return row;
}

function redrawPanel() {
  captain.panelStale = true;
  window.fieldView.rerender();
}

function closeSubPicker() {
  captain.addingSub = false;
  captain.subDraft = '';
  redrawPanel();
}

function addSub(lineup, name) {
  saveEdit(() => saveAddedPlayers(lineup, [name]), `Added ${name}`).then((added) => added && closeSubPicker());
}

function addNewSub(lineup, name) {
  saveEdit(async () => {
    const steps = [await addRosterPlayers([name], { sub: true })];
    steps.push(await saveAddedPlayers(lineup, [name]));
    return inOrder(steps.reverse());
  }, `Added ${name}`).then((added) => added && closeSubPicker());
}

function newSubForm(lineup) {
  const form = node('form', 'new-sub');
  const field = formField('New sub', 'text', 'name', captain.subDraft);
  const input = field.querySelector('input');
  input.autocomplete = 'off';
  input.addEventListener('input', () => { captain.subDraft = input.value; });
  const add = node('button', 'dock-action', 'Add');
  add.type = 'submit';
  form.append(field, add);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (captain.saving) return;
    const [name] = namesFromLines(input.value);
    if (name === undefined) {
      setStatus('Enter a name', { isError: true });
      return;
    }
    addNewSub(lineup, name);
  });
  return form;
}

function subPicker(lineup) {
  if (captain.rosterError !== null) return [node('p', 'captain-hint', captain.rosterError)];
  if (captain.rosterPlayers === null) return [node('p', 'captain-hint', 'Loading the roster…')];
  const picker = node('div', 'game-card open sub-picker');
  const body = node('div', 'game-editor');
  const missing = rosterNamesToAdd(captain.rosterPlayers.map((player) => player.name), lineup.players);
  const subs = missing.filter((name) => !isRegularPlayer(captain.rosterPlayers, name));
  const regulars = missing.filter((name) => isRegularPlayer(captain.rosterPlayers, name));
  [['Subs', subs], ['Roster', regulars]].filter(([, names]) => names.length > 0).forEach(([heading, names]) => {
    const chips = node('div', 'roster-chips');
    chips.append(...names.map((name) => button(name, 'roster-chip', () => addSub(lineup, name))));
    body.append(node('p', 'dock-group', heading), chips);
  });
  body.append(newSubForm(lineup), button('Cancel', 'panel-action', closeSubPicker));
  picker.append(body);
  return [picker];
}

export function playersPanel(lineup) {
  const parts = [headcountLine(lineup)];
  if (lineup.players.length > 0) {
    const list = node('div', 'player-list');
    list.append(...lineup.players.map((player) => playerRow(lineup, player)));
    parts.push(list);
  }
  if (captain.addingSub) return [...parts, ...subPicker(lineup)];
  parts.push(button('Add a sub', 'panel-action', () => {
    captain.addingSub = true;
    redrawPanel();
  }));
  return parts;
}
