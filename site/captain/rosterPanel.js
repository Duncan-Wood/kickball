import { namesFromLines, positionsIn, positionsText } from '../edits.js';
import { POSITION_CODES } from '../template.js';
import { button, formField, node } from './dom.js';
import { addRosterPlayers, removeRosterPlayer, saveRosterPlayer } from './roster.js';
import { ADD_FOCUS_KEY, captain } from './state.js';
import { saveEdit, setStatus } from './status.js';

const HINT = 'Removing someone here keeps them in games already set up.';
const NEW_PLAYER_KEY = 'new';

function closeEditor() {
  captain.openRosterRow = null;
  captain.panelStale = true;
  window.fieldView.rerender();
}

function positionChips(label, text) {
  const group = node('div', 'position-group');
  group.append(node('span', 'position-group-label', label));
  const chips = node('div', 'position-chips');
  const chosen = positionsIn(text);
  chips.append(...POSITION_CODES.map((code) => {
    const chip = button(code, 'inning-toggle', () => chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true')));
    chip.dataset.code = code;
    chip.setAttribute('aria-pressed', String(chosen.includes(code)));
    return chip;
  }));
  group.append(chips);
  return group;
}

function chosenCodes(group) {
  return [...group.querySelectorAll('[aria-pressed="true"]')].map((chip) => chip.dataset.code);
}

function rosterEditor(player) {
  const initial = player ?? { name: '', prefers: '', avoids: '', notes: '', pronouns: '' };
  const form = node('form', 'game-editor');
  const nameField = formField('Name', 'text', 'name', initial.name);
  if (player !== null) nameField.append(node('span', 'field-note', 'Changing the name also changes it in every game.'));
  const prefers = positionChips('Prefers', initial.prefers);
  const avoids = positionChips("Won't play", initial.avoids);
  form.append(nameField, prefers, avoids, formField('Pronouns (optional)', 'text', 'pronouns', initial.pronouns), formField('Notes', 'text', 'notes', initial.notes));
  const actions = node('div', 'game-actions');
  const save = node('button', 'panel-action primary', 'Save');
  save.type = 'submit';
  actions.append(save);
  if (player !== null) {
    actions.append(button('Remove from roster', 'panel-action', () => saveEdit(() => removeRosterPlayer(player), `Removed ${player.name} from the roster`).then((saved) => saved && closeEditor())));
  }
  actions.append(button('Cancel', 'panel-action', closeEditor));
  form.append(actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (captain.saving) return;
    const fields = new FormData(form);
    const values = {
      name: fields.get('name').trim(),
      prefers: positionsText(chosenCodes(prefers), initial.prefers),
      avoids: positionsText(chosenCodes(avoids), initial.avoids),
      pronouns: fields.get('pronouns').trim(),
      notes: fields.get('notes').trim(),
    };
    saveEdit(() => saveRosterPlayer(values, player), player === null ? `Added ${values.name} to the roster` : `Saved ${values.name}`).then((saved) => saved && closeEditor());
  });
  return form;
}

function closeSeveral() {
  captain.addingSeveral = false;
  captain.panelStale = true;
  window.fieldView.rerender();
}

function addSeveralForm() {
  const form = node('form', 'game-editor');
  const label = node('label', undefined, 'One name per line');
  const names = node('textarea');
  names.name = 'names';
  names.rows = 8;
  label.append(names);
  const actions = node('div', 'game-actions');
  const save = node('button', 'panel-action primary', 'Add');
  save.type = 'submit';
  actions.append(save, button('Cancel', 'panel-action', closeSeveral));
  form.append(label, actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (captain.saving) return;
    const added = namesFromLines(names.value);
    if (added.length === 0) {
      setStatus('Enter at least one name', { isError: true });
      return;
    }
    saveEdit(() => addRosterPlayers(added), `Added ${added.length} ${added.length === 1 ? 'player' : 'players'}`).then((saved) => saved && closeSeveral());
  });
  return form;
}

function playerCard(player) {
  const isOpen = captain.openRosterRow === player.sheetRow;
  const card = node('div', isOpen ? 'game-card roster-card open' : 'game-card roster-card');
  const summary = button('', 'game-summary', () => {
    captain.openRosterRow = isOpen ? null : player.sheetRow;
    captain.panelStale = true;
    window.fieldView.rerender();
  });
  summary.setAttribute('aria-expanded', String(isOpen));
  summary.dataset.focusKey = `player:${player.sheetRow}`;
  const details = [player.prefers === '' ? '' : `Prefers ${player.prefers}`, player.avoids === '' ? '' : `Won't play ${player.avoids}`].filter((detail) => detail !== '').join(' · ');
  const text = node('span', 'game-text');
  text.append(node('strong', undefined, player.name), ...(player.pronouns === '' ? [] : [node('span', 'game-meta', `(${player.pronouns})`)]), ...(details === '' ? [] : [node('span', 'game-meta', details)]));
  summary.append(text);
  card.append(summary);
  if (isOpen) card.append(rosterEditor(player));
  return card;
}

export function rosterPanel() {
  if (captain.rosterError !== null) return [node('p', 'captain-hint', captain.rosterError)];
  if (captain.rosterPlayers === null) return [node('p', 'captain-hint', 'Loading the roster…')];
  const list = node('div', 'game-list');
  list.append(...captain.rosterPlayers.map(playerCard));
  const adding = captain.openRosterRow === NEW_PLAYER_KEY;
  const parts = [node('p', 'captain-hint', HINT), list];
  if (captain.addingSeveral) {
    parts.push(addSeveralForm());
  } else if (adding) {
    const card = node('div', 'game-card open');
    card.append(rosterEditor(null));
    parts.push(card);
  } else {
    const addPlayer = button('Add a player', 'panel-action', () => {
      captain.openRosterRow = NEW_PLAYER_KEY;
      captain.panelStale = true;
      window.fieldView.rerender();
    });
    addPlayer.dataset.focusKey = ADD_FOCUS_KEY;
    parts.push(addPlayer, button('Add several', 'panel-action', () => {
      captain.addingSeveral = true;
      captain.openRosterRow = null;
      captain.panelStale = true;
      window.fieldView.rerender();
    }));
  }
  return parts;
}
