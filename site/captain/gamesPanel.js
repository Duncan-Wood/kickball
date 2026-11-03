import { gameIdProblem, isoDateFromDisplayed, isoTimeFromDisplayed, nextGameId } from '../edits.js';
import { describeResult, notesFromResult, resultFromNotes } from '../result.js';
import { button, formField, node, selectField } from './dom.js';
import { chooseArea } from './navigation.js';
import { createGameTabs, saveGameDetails, scheduledGames } from './schedule.js';
import { captain } from './state.js';
import { saveEdit } from './status.js';

const HINT = 'Fill in the season here, then set up a lineup tab for every game at once.';
const OUTCOME_CHOICES = [['', 'Not played yet'], ['W', 'Won'], ['L', 'Lost'], ['T', 'Tied']];

function closeEditor() {
  captain.openGameId = null;
  captain.draftGameId = null;
  captain.panelStale = true;
  window.fieldView.rerender();
}

function resultFields(initialResult, initialNotes) {
  const outcome = selectField('Result', 'outcome', OUTCOME_CHOICES, initialResult?.outcome ?? '');
  const ourRuns = formField('Your runs', 'number', 'ourRuns', initialResult?.ourRuns ?? '');
  const theirRuns = formField('Their runs', 'number', 'theirRuns', initialResult?.theirRuns ?? '');
  const notes = formField('Notes', 'text', 'notes', initialNotes);
  [ourRuns, theirRuns].forEach((field) => {
    field.querySelector('input').min = '0';
    field.querySelector('input').inputMode = 'numeric';
  });
  const showMatchingFields = () => {
    const hasOutcome = outcome.querySelector('select').value !== '';
    ourRuns.hidden = !hasOutcome;
    theirRuns.hidden = !hasOutcome;
    notes.hidden = hasOutcome;
  };
  outcome.querySelector('select').addEventListener('change', showMatchingFields);
  showMatchingFields();
  return [outcome, ourRuns, theirRuns, notes];
}

function runsFrom(fieldValue) {
  return fieldValue === '' ? Number.NaN : Number(fieldValue);
}

function submittedDetails(fields) {
  const outcome = fields.get('outcome');
  const notes = outcome === ''
    ? fields.get('notes').trim()
    : notesFromResult({ outcome, ourRuns: runsFrom(fields.get('ourRuns')), theirRuns: runsFrom(fields.get('theirRuns')) });
  return { date: fields.get('date'), time: fields.get('time'), location: fields.get('location').trim(), opponent: fields.get('opponent').trim(), notes };
}

function gameEditor(game) {
  const initialResult = resultFromNotes(game.notes);
  const initialValues = {
    date: isoDateFromDisplayed(game.date),
    time: isoTimeFromDisplayed(game.time),
    location: game.location,
    opponent: game.opponent,
    notes: game.notes,
  };
  const form = node('form', 'game-editor');
  if (game.row === null) form.append(formField('Game #', 'text', 'gameId', game.id));
  form.append(
    formField('Date', 'date', 'date', initialValues.date),
    formField('Time', 'time', 'time', initialValues.time),
    formField('Location', 'text', 'location', initialValues.location),
    formField('Opponent', 'text', 'opponent', initialValues.opponent),
    ...resultFields(initialResult, initialResult === null ? game.notes : ''),
  );
  const actions = node('div', 'game-actions');
  const save = node('button', 'panel-action primary', 'Save');
  save.type = 'submit';
  actions.append(save);
  if (game.tabName !== null) {
    actions.append(button('Open lineup', 'panel-action', () => {
      window.fieldView.showLineup(game.tabName);
      chooseArea('fielding');
    }));
  } else if (game.row !== null) {
    actions.append(button('Set up lineup', 'panel-action', () => saveEdit(async () => {
      await createGameTabs([game.id]);
      captain.panelStale = true;
    }, `Set up Game ${game.id}`)));
  }
  actions.append(button('Cancel', 'panel-action', closeEditor));
  form.append(actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (captain.saving) return;
    const fields = new FormData(form);
    const savedGame = game.row === null ? { ...game, id: fields.get('gameId').trim() } : game;
    saveEdit(() => {
      if (game.row === null) {
        const problem = gameIdProblem(savedGame.id, scheduledGames().map((scheduled) => scheduled.id));
        if (problem !== null) throw new Error(problem);
      }
      return saveGameDetails(savedGame, submittedDetails(fields), initialValues);
    }, `Game ${savedGame.id} saved`);
  });
  return form;
}

function gameCard(game) {
  const isOpen = captain.openGameId === game.id;
  const card = node('div', isOpen ? 'game-card open' : 'game-card');
  const summary = button('', 'game-summary', () => {
    captain.openGameId = isOpen ? null : game.id;
    captain.panelStale = true;
    window.fieldView.rerender();
  });
  summary.setAttribute('aria-expanded', String(isOpen));
  const result = resultFromNotes(game.notes);
  const details = [result === null ? game.notes : describeResult(result), game.date, game.time, game.location].filter((detail) => detail !== '').join(' · ');
  const text = node('span', 'game-text');
  text.append(node('strong', undefined, `Game ${game.id}${game.opponent === '' ? '' : ` vs ${game.opponent}`}`), node('span', 'game-meta', details === '' ? 'No date yet' : details));
  summary.append(text, node('span', game.tabName === null ? 'game-state' : 'game-state ready', game.tabName === null ? 'No lineup' : 'Lineup ready'));
  card.append(summary);
  if (isOpen) card.append(gameEditor(game));
  return card;
}

export function gamesPanel() {
  if (captain.scheduleError !== null) return [node('p', 'captain-hint', captain.scheduleError)];
  if (captain.scheduleRows === null) return [node('p', 'captain-hint', 'Loading the schedule…')];
  const games = scheduledGames();
  const draft = captain.draftGameId === null ? [] : [{ id: captain.draftGameId, row: null, date: '', time: '', location: '', opponent: '', notes: '', tabName: null }];
  const needsLineup = games.filter((game) => game.tabName === null && game.date !== '');
  const list = node('div', 'game-list');
  list.append(...[...games, ...draft].map(gameCard));
  const parts = [node('p', 'captain-hint', HINT), list];
  parts.push(button('Add a game', 'panel-action', () => {
    captain.draftGameId = nextGameId(games, window.fieldView.allLineups());
    captain.openGameId = captain.draftGameId;
    captain.panelStale = true;
    window.fieldView.rerender();
  }));
  if (needsLineup.length > 0) {
    const noun = needsLineup.length === 1 ? 'lineup' : 'lineups';
    parts.push(button(`Set up ${needsLineup.length} ${noun}`, 'panel-action primary', () => saveEdit(async () => {
      await createGameTabs(needsLineup.map((game) => game.id));
      captain.panelStale = true;
    }, `Set up ${needsLineup.length} ${noun}`)));
  }
  return parts;
}
