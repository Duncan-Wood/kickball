import { namesFromLines, positionsIn, positionsText } from '../edits.js';
import { KICKING_STYLES, POSITION_CODES } from '../template.js';
import { button, confirmAction, formField, node, selectField } from './dom.js';
import { BLANK_PLAYER, addRosterPlayers, removeRosterPlayer, saveRosterPlayer } from './roster.js';
import { ADD_FOCUS_KEY, captain } from './state.js';
import { autosave, saveEdit, setStatus } from './status.js';

const NEW_PLAYER_KEY = 'new';
const PLAYS_AS_CHOICES = [['regular', 'Regular'], ['sub', 'Sub']];

function redrawPanel() {
  captain.panelStale = true;
  window.fieldView.rerender();
}

function closeEditor() {
  captain.openRosterRow = null;
  redrawPanel();
}

function positionChips(label, text, onToggle) {
  const group = node('div', 'position-group');
  group.append(node('span', 'position-group-label', label));
  const chips = node('div', 'position-chips');
  const chosen = positionsIn(text);
  chips.append(...POSITION_CODES.map((code) => {
    const chip = button(code, 'inning-toggle', () => {
      chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true'));
      onToggle();
    });
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

function blockCodesChosenElsewhere(group, otherGroup) {
  const chosenElsewhere = chosenCodes(otherGroup);
  group.querySelectorAll('.inning-toggle').forEach((chip) => {
    chip.disabled = chip.getAttribute('aria-pressed') !== 'true' && chosenElsewhere.includes(chip.dataset.code);
  });
}

function saveTextWhenLeft(input, save) {
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') input.blur(); });
}

function rosterEditor(player) {
  let saved = { name: player.name, prefers: player.prefers, avoids: player.avoids, notes: player.notes, pronouns: player.pronouns, kicking: player.kicking, sub: player.sub };
  const persist = (changes, what) => {
    const previous = { ...saved, sheetRow: player.sheetRow };
    const next = { ...saved, ...changes };
    saved = next;
    autosave(() => saveRosterPlayer(next, previous), `${next.name}: ${what}`).then((ok) => {
      if (ok && changes.sub === undefined) refreshSummary(player.sheetRow);
      else redrawPanel();
    });
  };
  const form = node('form', 'game-editor');
  form.addEventListener('submit', (event) => event.preventDefault());
  const nameField = formField('Name', 'text', 'name', saved.name);
  const textField = (label, key) => {
    const field = key === 'name' ? nameField : formField(label, 'text', key, saved[key]);
    const input = field.querySelector('input');
    saveTextWhenLeft(input, () => {
      const value = input.value.trim();
      if (value !== saved[key]) persist({ [key]: value }, label.toLowerCase());
    });
    return field;
  };
  const blockConflicts = () => {
    blockCodesChosenElsewhere(prefers, avoids);
    blockCodesChosenElsewhere(avoids, prefers);
  };
  const prefers = positionChips('Prefers', saved.prefers, () => {
    blockConflicts();
    persist({ prefers: positionsText(chosenCodes(prefers), saved.prefers) }, 'prefers');
  });
  const avoids = positionChips('Rather not', saved.avoids, () => {
    blockConflicts();
    persist({ avoids: positionsText(chosenCodes(avoids), saved.avoids) }, 'rather not');
  });
  blockConflicts();
  const kicking = selectField('Kicking style', 'kicking', [['', 'Not set'], ...KICKING_STYLES.map((style) => [style, style])], saved.kicking);
  kicking.querySelector('select').addEventListener('change', (event) => persist({ kicking: event.target.value }, 'kicking style'));
  const playsAs = selectField('Plays as', 'playsAs', PLAYS_AS_CHOICES, saved.sub ? 'sub' : 'regular');
  playsAs.querySelector('select').addEventListener('change', (event) => persist({ sub: event.target.value === 'sub' }, event.target.value === 'sub' ? 'sub' : 'regular'));
  form.append(textField('Name', 'name'), playsAs, prefers, avoids, kicking, textField('Pronouns', 'pronouns'), textField('Notes', 'notes'));
  const actions = node('div', 'game-actions');
  actions.append(button('Remove from roster', 'panel-action', async () => {
    const confirmed = await confirmAction(`Remove ${saved.name} from the roster?`, 'They stay in games already played.', 'Remove');
    if (confirmed) saveEdit(() => removeRosterPlayer({ ...player, ...saved }), `Removed ${saved.name} from the roster`).then((removed) => removed && closeEditor());
  }));
  form.append(actions);
  return form;
}

function newPlayerEditor() {
  const form = node('form', 'game-editor');
  form.addEventListener('submit', (event) => event.preventDefault());
  const nameField = formField('Name', 'text', 'name', '');
  const input = nameField.querySelector('input');
  saveTextWhenLeft(input, () => {
    const name = input.value.trim();
    if (name === '') {
      closeEditor();
      return;
    }
    saveEdit(() => saveRosterPlayer({ ...BLANK_PLAYER, name }, null), `Added ${name} to the roster`).then((added) => {
      if (!added) return;
      captain.openRosterRow = captain.rosterPlayers.find((player) => player.name.toLowerCase() === name.toLowerCase())?.sheetRow ?? null;
      redrawPanel();
    });
  });
  form.append(nameField);
  requestAnimationFrame(() => input.focus());
  return form;
}

function closeSeveral() {
  captain.addingSeveral = false;
  captain.panelStale = true;
  window.fieldView.rerender();
}

function addSeveralForm() {
  const form = node('form', 'game-editor');
  const label = node('label', 'stacked', 'One name per line');
  const names = node('textarea');
  names.name = 'names';
  names.rows = 8;
  names.placeholder = 'Alex Rivera\nSam Chen\nJordan Lee';
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

function summaryText(player) {
  const details = [player.kicking, player.prefers === '' ? '' : `Prefers ${player.prefers}`, player.avoids === '' ? '' : `Rather not ${player.avoids}`].filter((detail) => detail !== '').join(' · ');
  const text = node('span', 'game-text');
  text.append(node('strong', undefined, player.name), ...(player.pronouns === '' ? [] : [node('span', 'game-meta', `(${player.pronouns})`)]), ...(details === '' ? [] : [node('span', 'game-meta', details)]));
  return text;
}

function refreshSummary(sheetRow) {
  const player = captain.rosterPlayers.find((candidate) => candidate.sheetRow === sheetRow);
  const summary = document.querySelector(`[data-focus-key="player:${sheetRow}"]`);
  if (player !== undefined && summary !== null) summary.replaceChildren(summaryText(player));
}

function playerCard(player) {
  const isOpen = captain.openRosterRow === player.sheetRow;
  const card = node('div', isOpen ? 'game-card roster-card open' : 'game-card roster-card');
  const summary = button('', 'game-summary', () => {
    captain.openRosterRow = isOpen ? null : player.sheetRow;
    redrawPanel();
  });
  summary.setAttribute('aria-expanded', String(isOpen));
  summary.dataset.focusKey = `player:${player.sheetRow}`;
  summary.append(summaryText(player));
  card.append(summary);
  if (isOpen) card.append(rosterEditor(player));
  return card;
}

export function rosterPanel() {
  if (captain.rosterError !== null) return [node('p', 'captain-hint', captain.rosterError)];
  if (captain.rosterPlayers === null) return [node('p', 'captain-hint', 'Loading the roster…')];
  const list = node('div', 'game-list');
  list.append(...captain.rosterPlayers.filter((player) => !player.sub).map(playerCard));
  const subs = captain.rosterPlayers.filter((player) => player.sub);
  const adding = captain.openRosterRow === NEW_PLAYER_KEY;
  const parts = [list];
  if (subs.length > 0) {
    const subList = node('div', 'game-list');
    subList.append(...subs.map(playerCard));
    parts.push(node('p', 'captain-subheading', 'Subs'), subList);
  }
  if (captain.addingSeveral) {
    parts.push(addSeveralForm());
  } else if (adding) {
    const card = node('div', 'game-card open');
    card.append(newPlayerEditor());
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
