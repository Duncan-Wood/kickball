import { button, node } from './dom.js';
import { setUpLineups } from './gamesPanel.js';
import { chooseArea } from './navigation.js';
import { MINIMUM_PLAYERS } from './people.js';
import { scheduledGames } from './schedule.js';
import { captain } from './state.js';
import { setStatus } from './status.js';

const LINK_COPIED_KEY = 'kickball-link-copied';

function linkCopied() {
  try {
    return localStorage.getItem(`${LINK_COPIED_KEY}:${window.fieldView.teamCode}`) === 'yes';
  } catch (storageUnavailable) {
    return false;
  }
}

function rememberLinkCopied() {
  try {
    localStorage.setItem(`${LINK_COPIED_KEY}:${window.fieldView.teamCode}`, 'yes');
  } catch (storageUnavailable) {
    return;
  }
}

export function setupProgress() {
  if (captain.rosterPlayers === null || captain.scheduleRows === null) return null;
  const games = scheduledGames().filter((game) => game.date !== '');
  return {
    playerCount: captain.rosterPlayers.length,
    playersDone: captain.rosterPlayers.length >= MINIMUM_PLAYERS,
    games,
    gamesDone: games.length > 0,
    needLineups: games.filter((game) => game.tabName === null),
    lineupsDone: games.length > 0 && games.every((game) => game.tabName !== null),
  };
}

export function gettingStartedIsOpen() {
  const progress = setupProgress();
  return progress !== null && !(progress.playersDone && progress.gamesDone && progress.lineupsDone);
}

function checkRow(number, done, title, detail, action) {
  const row = node('div', done ? 'check-row done' : 'check-row');
  const text = node('span', 'check-text');
  text.append(node('strong', undefined, title), node('span', 'game-meta', detail));
  row.append(node('span', 'check-mark', done ? '✓' : String(number)), text);
  if (!done && action !== null) {
    const choice = button(action.label, 'panel-action primary', action.run);
    choice.disabled = action.disabled === true;
    row.append(choice);
  }
  return row;
}

function copyTeamLink() {
  const link = `${location.origin}${location.pathname}?team=${window.fieldView.teamCode}`;
  navigator.clipboard.writeText(link).then(() => {
    rememberLinkCopied();
    captain.panelStale = true;
    setStatus('Link copied');
    window.fieldView.rerender();
  }, () => setStatus('Could not copy. Open Team to copy the link', { isError: true }));
}

function openAddPlayers() {
  captain.teamView = 'roster';
  captain.openRosterRow = null;
  captain.addingSeveral = true;
  chooseArea('team');
}

function openAddGames() {
  captain.openGameId = null;
  captain.draftGameId = null;
  captain.seasonFormOpen = true;
  chooseArea('games');
}

export function getStartedPanel() {
  if (captain.rosterError !== null) return [node('p', 'captain-hint', captain.rosterError)];
  if (captain.scheduleError !== null) return [node('p', 'captain-hint', captain.scheduleError)];
  const progress = setupProgress();
  if (progress === null) return [node('p', 'captain-hint', 'Loading…')];
  const lineupsNote = progress.gamesDone ? `${progress.games.length - progress.needLineups.length} of ${progress.games.length} ready` : 'Needs games first';
  const rows = [
    checkRow(1, progress.playersDone, 'Add your players', `${progress.playerCount} added, ${MINIMUM_PLAYERS} needed to play`, { label: 'Add', run: openAddPlayers }),
    checkRow(2, progress.gamesDone, 'Add your games', progress.gamesDone ? `${progress.games.length} games` : 'First date and how many', { label: 'Add', run: openAddGames }),
    checkRow(3, progress.lineupsDone, 'Set up lineups', lineupsNote, { label: 'Set up', run: () => setUpLineups(progress.needLineups), disabled: !progress.playersDone || progress.needLineups.length === 0 }),
    checkRow(4, linkCopied(), 'Send your players the link', 'They see the lineups, nothing else', { label: 'Copy link', run: copyTeamLink }),
  ];
  const parts = [node('p', 'captain-hint', 'Four steps and your players can see the lineup.'), ...rows];
  if (progress.lineupsDone && window.fieldView.currentLineup() !== null) {
    parts.push(button('Open the lineup', 'panel-action primary', () => chooseArea('fielding')));
  }
  return parts;
}
