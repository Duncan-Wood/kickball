import { headcount, isoDateFromDisplayed, isoTimeFromDisplayed } from '../edits.js';
import { describeResult, resultFromText } from '../result.js';
import { button, formField, node } from './dom.js';
import { addGame, addSeasonGames, allScheduledGames, archiveGame, createGameTabs, newGamePreview, saveGameField, scheduledGames, unarchiveGame } from './schedule.js';
import { ADD_FOCUS_KEY, captain } from './state.js';
import { autosave, saveEdit } from './status.js';

const HINT = 'Tap a game to change it. Changes save when you leave a field.';
const FIELDS = [['date', 'Date', 'date'], ['time', 'Time', 'time'], ['location', 'Location', 'text'], ['opponent', 'Opponent', 'text'], ['label', 'Label', 'text'], ['result', 'Result', 'text']];

function rerenderPanel() {
  captain.panelStale = true;
  window.fieldView.rerender();
}

function gameTitle(game) {
  return `${game.label === '' ? `Game ${game.id}` : game.label}${game.opponent === '' ? '' : ` vs ${game.opponent}`}`;
}

function replySummary(game) {
  const lineup = window.fieldView.allLineups().find((candidate) => candidate.gameId === game.id);
  if (lineup === undefined) return '';
  const count = headcount(lineup.players);
  if (count.yes + count.maybe + count.out === 0) return '';
  return [`${count.yes} yes`, ...(count.maybe > 0 ? [`${count.maybe} ?`] : [])].join(' · ');
}

function summaryParts(game) {
  const result = resultFromText(game.result);
  let status = game.result === '' ? replySummary(game) : (result === null ? game.result : describeResult(result));
  if (status === '' && game.tabName === null) status = 'No lineup yet';
  const details = [game.date, game.time, game.location].filter((detail) => detail !== '').join(' · ');
  const text = node('span', 'game-text');
  text.append(node('strong', undefined, gameTitle(game)), node('span', 'game-meta', details === '' ? 'No date yet' : details));
  return status === '' ? [text] : [text, node('span', game.result === '' ? 'game-state' : 'game-state ready', status)];
}

function refreshSummary(gameId) {
  const game = allScheduledGames().find((scheduled) => scheduled.id === gameId);
  const summary = document.querySelector(`[data-focus-key="game:${gameId}"]`);
  if (game !== undefined && summary !== null) summary.replaceChildren(...summaryParts(game));
}

function autosavedField(game, [field, label, type]) {
  const initial = { date: isoDateFromDisplayed(game.date), time: isoTimeFromDisplayed(game.time) }[field] ?? game[field];
  const control = formField(label, type, field, initial);
  const input = control.querySelector('input');
  let saved = initial;
  const save = () => {
    const value = input.value.trim();
    if (value === saved) return;
    const previous = saved;
    saved = value;
    autosave(() => saveGameField(game, field, value, previous), `${gameTitle(game)}: ${label.toLowerCase()}`).then((ok) => {
      if (ok) refreshSummary(game.id);
      else saved = previous;
    });
  };
  input.addEventListener(type === 'text' ? 'blur' : 'change', save);
  if (type === 'text') input.addEventListener('keydown', (event) => { if (event.key === 'Enter') input.blur(); });
  return control;
}

function gameEditor(game) {
  const form = node('form', 'game-editor');
  form.addEventListener('submit', (event) => event.preventDefault());
  form.append(...FIELDS.map((field) => autosavedField(game, field)));
  const actions = node('div', 'game-actions');
  if (game.tabName === null) {
    actions.append(button('Set up lineup', 'panel-action primary', () => saveEdit(async () => {
      const undo = await createGameTabs([game.id]);
      captain.panelStale = true;
      return undo;
    }, `Set up the lineup for ${gameTitle(game)}`)));
  }
  actions.append(button('Archive', 'panel-action', () => saveEdit(() => archiveGame(game), `Archived ${gameTitle(game)}`)));
  form.append(actions);
  return form;
}

function gameCard(game) {
  const isOpen = captain.openGameId === game.id;
  const card = node('div', isOpen ? 'game-card open' : 'game-card');
  const summary = button('', 'game-summary', () => {
    captain.openGameId = isOpen ? null : game.id;
    if (!isOpen && game.tabName !== null) window.fieldView.showLineup(game.tabName);
    rerenderPanel();
  });
  summary.setAttribute('aria-expanded', String(isOpen));
  summary.dataset.focusKey = `game:${game.id}`;
  summary.append(...summaryParts(game));
  card.append(summary);
  if (isOpen) card.append(gameEditor(game));
  return card;
}

function archivedSection(archived) {
  if (archived.length === 0) return [];
  const section = node('details', 'archived-games');
  section.append(node('summary', undefined, `Archived (${archived.length})`));
  section.append(...archived.map((game) => {
    const row = node('div', 'archived-game');
    row.append(node('span', 'game-text', `${gameTitle(game)}${game.date === '' ? '' : ` · ${game.date}`}`), button('Unarchive', 'dock-action', () => saveEdit(() => unarchiveGame(game), `Unarchived ${gameTitle(game)}`)));
    return row;
  }));
  return [section];
}

function closeSeasonForm() {
  captain.seasonFormOpen = false;
  rerenderPanel();
}

function seasonForm() {
  const form = node('form', 'game-editor');
  const count = formField('Number of games', 'number', 'count', '8');
  count.querySelector('input').min = '1';
  count.querySelector('input').max = '30';
  count.querySelector('input').inputMode = 'numeric';
  form.append(
    formField('First game', 'date', 'firstDate', ''),
    count,
    formField('Time', 'time', 'time', '19:00'),
    formField('Location', 'text', 'location', ''),
  );
  const actions = node('div', 'game-actions');
  const save = node('button', 'panel-action primary', 'Add games');
  save.type = 'submit';
  actions.append(save, button('Cancel', 'panel-action', closeSeasonForm));
  form.append(actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (captain.saving) return;
    const fields = new FormData(form);
    const gameCount = Number(fields.get('count'));
    saveEdit(() => addSeasonGames({ firstDate: fields.get('firstDate'), count: gameCount, time: fields.get('time'), location: fields.get('location').trim() }), `Added ${gameCount} games`).then((saved) => saved && closeSeasonForm());
  });
  return form;
}

function addGameLabel() {
  const { date } = newGamePreview();
  if (date === '') return 'Add a game';
  const [, month, day] = date.split('-').map(Number);
  return `Add a game (${month}/${day})`;
}

export function gamesPanel() {
  if (captain.scheduleError !== null) return [node('p', 'captain-hint', captain.scheduleError)];
  if (captain.scheduleRows === null) return [node('p', 'captain-hint', 'Loading the schedule…')];
  const games = scheduledGames();
  const archived = allScheduledGames().filter((game) => game.archived);
  const list = node('div', 'game-list');
  list.append(...games.map(gameCard));
  const parts = games.length === 0 ? [] : [node('p', 'captain-hint', HINT), list];
  if (captain.seasonFormOpen) return [...parts, seasonForm()];
  const add = button(addGameLabel(), 'panel-action', () => saveEdit(addGame, 'Added a game'));
  add.dataset.focusKey = ADD_FOCUS_KEY;
  parts.push(add);
  if (games.length === 0 && archived.length === 0) {
    parts.unshift(node('p', 'captain-hint', 'Add every game at once with a first date and a number of weekly games, or one at a time.'));
    parts.push(button('Add a season', 'panel-action primary', () => {
      captain.seasonFormOpen = true;
      rerenderPanel();
    }));
  }
  return [...parts, ...archivedSection(archived)];
}
