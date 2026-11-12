import { headcount } from './edits.js';
import { bindFieldEditing, fieldingPanel, followViewedInning, installFieldingEvents, keyboardIsInUse, renderDock, resetEditingState, restoreKeyboardFocus } from './captain/fielding.js';
import { gamesPanel } from './captain/gamesPanel.js';
import { getStartedPanel, gettingStartedIsOpen } from './captain/getStarted.js';
import { teamPanel } from './captain/teamPanel.js';
import { chooseArea } from './captain/navigation.js';
import { kickingPanel, playersPanel } from './captain/people.js';
import { SIGN_IN_SCRIPT, loadScript } from './captain/sheetApi.js';
import { captainToolsOffered, startCaptainMode, stopCaptainMode } from './captain/session.js';
import { ADD_FOCUS_KEY, AREAS, captain, element } from './captain/state.js';
import { undoLatest, updateUndoButton } from './captain/status.js';
import { node } from './captain/dom.js';

let pendingRefocusKey = null;

function controlKey(control) {
  return control.dataset.focusKey ?? control.textContent.trim();
}

function focusedControlKey(panel) {
  const focused = document.activeElement;
  if (!keyboardIsInUse() || !panel.contains(focused)) return null;
  if (focused.closest('.game-editor') === null) return controlKey(focused);
  const openSummary = panel.querySelector('.game-card.open .game-summary');
  return openSummary === null ? `field:${focused.name}` : controlKey(openSummary);
}

function refocusPanel(panel, key) {
  const keyed = key.startsWith('field:')
    ? panel.querySelector(`[name="${key.slice('field:'.length)}"]`)
    : panel.querySelector('.game-editor input, .game-editor select')
      ?? [...panel.querySelectorAll('button')].find((candidate) => controlKey(candidate) === key);
  const target = keyed ?? panel.querySelector(`[data-focus-key="${ADD_FOCUS_KEY}"]`);
  if (target === undefined || target === null) return false;
  target.focus();
  return true;
}

function renderPanel(lineup, inField) {
  const panel = element('captain-panel');
  panel.hidden = !captain.active || (lineup === null && !['start', 'games', 'team'].includes(captain.area));
  if (panel.hidden) {
    panel.replaceChildren();
    delete panel.dataset.area;
    return;
  }
  const formPanels = { start: getStartedPanel, games: gamesPanel, team: teamPanel };
  if (captain.area in formPanels) {
    if (panel.dataset.area === captain.area && !captain.panelStale) return;
    captain.panelStale = false;
    panel.dataset.area = captain.area;
    const keyToRefocus = focusedControlKey(panel) ?? pendingRefocusKey;
    panel.replaceChildren(...formPanels[captain.area]());
    pendingRefocusKey = keyToRefocus !== null && !refocusPanel(panel, keyToRefocus) ? keyToRefocus : null;
    return;
  }
  panel.dataset.area = captain.area;
  if (captain.area === 'kicking') panel.replaceChildren(...kickingPanel(lineup));
  else if (captain.area === 'players') panel.replaceChildren(...playersPanel(lineup));
  else panel.replaceChildren(...fieldingPanel(lineup, inField));
}

function renderAreaButtons(lineup) {
  AREAS.forEach((area) => element(`area-${area}`).setAttribute('aria-pressed', String(captain.area === area)));
  element('area-start').hidden = !(gettingStartedIsOpen() || captain.area === 'start');
  ['fielding', 'kicking', 'players'].forEach((area) => { element(`area-${area}`).hidden = lineup === null; });
  element('area-games').hidden = !captain.canManageGames;
  element('area-team').hidden = !captain.canEditTeam;
  const playersButton = element('area-players');
  playersButton.replaceChildren('Players');
  if (lineup !== null) playersButton.append(node('span', 'area-count', String(headcount(lineup.players).playing)));
}

function afterRender() {
  const inField = window.fieldView.inFieldMode();
  const isFielding = captain.area === 'fielding';
  element('captain-bar').hidden = !captain.active;
  document.body.classList.toggle('captain-active', captain.active && inField && isFielding);
  document.body.classList.toggle('captain-list', captain.active && !isFielding);
  element('captain-toggle').hidden = captain.active || !captainToolsOffered();
  if (!captain.active) {
    renderDock(null, false);
    return;
  }
  const lineup = window.fieldView.currentLineup();
  if (lineup === null && ['fielding', 'kicking', 'players'].includes(captain.area)) captain.area = 'start';
  if (lineup !== null && captain.tabName !== lineup.tabName) resetEditingState(lineup);
  else if (lineup !== null) followViewedInning();
  const selectedRowIsGone = lineup === null || (captain.selectedRow !== null && !lineup.players.some((player) => player.sheetRow === captain.selectedRow));
  if (selectedRowIsGone) captain.selectedRow = null;
  renderAreaButtons(lineup);
  updateUndoButton();
  renderPanel(lineup, inField);
  if (isFielding && inField) bindFieldEditing();
  renderDock(lineup, inField);
  restoreKeyboardFocus();
}

element('captain-toggle').addEventListener('pointerdown', () => loadScript(SIGN_IN_SCRIPT));
element('captain-toggle').addEventListener('click', startCaptainMode);
element('captain-done').addEventListener('click', stopCaptainMode);
element('captain-undo').addEventListener('click', undoLatest);
AREAS.forEach((area) => element(`area-${area}`).addEventListener('click', () => chooseArea(area)));
installFieldingEvents();
document.addEventListener('pointerdown', () => { pendingRefocusKey = null; });
element('captain-panel').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.tagName === 'SELECT') event.preventDefault();
});
window.addEventListener('hashchange', () => window.fieldView.rerender());
window.captainTools = { afterRender };
window.fieldView.rerender();
