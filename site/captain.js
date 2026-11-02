import { headcount } from './edits.js';
import { bindFieldEditing, fieldingPanel, followViewedInning, installFieldingEvents, renderDock, resetEditingState } from './captain/fielding.js';
import { gamesPanel } from './captain/gamesPanel.js';
import { teamPanel } from './captain/teamPanel.js';
import { chooseArea } from './captain/navigation.js';
import { kickingPanel, playersPanel } from './captain/people.js';
import { SIGN_IN_SCRIPT, loadScript } from './captain/sheetApi.js';
import { captainToolsOffered, startCaptainMode, stopCaptainMode } from './captain/session.js';
import { AREAS, captain, element } from './captain/state.js';
import { undoLatest, updateUndoButton } from './captain/status.js';
import { node } from './captain/dom.js';

function renderPanel(lineup, inField) {
  const panel = element('captain-panel');
  panel.hidden = !captain.active || lineup === null;
  if (panel.hidden) {
    panel.replaceChildren();
    delete panel.dataset.area;
    return;
  }
  const formPanels = { games: gamesPanel, team: teamPanel };
  if (captain.area in formPanels) {
    if (panel.dataset.area === captain.area && !captain.panelStale) return;
    captain.panelStale = false;
    panel.dataset.area = captain.area;
    panel.replaceChildren(...formPanels[captain.area]());
    return;
  }
  panel.dataset.area = captain.area;
  if (captain.area === 'kicking') panel.replaceChildren(...kickingPanel(lineup));
  else if (captain.area === 'players') panel.replaceChildren(...playersPanel(lineup));
  else panel.replaceChildren(...fieldingPanel(lineup, inField));
}

function renderAreaButtons(lineup) {
  AREAS.forEach((area) => element(`area-${area}`).setAttribute('aria-pressed', String(captain.area === area)));
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
  if (lineup !== null && captain.tabName !== lineup.tabName) resetEditingState(lineup);
  else if (lineup !== null) followViewedInning();
  const selectedRowIsGone = lineup === null || (captain.selectedRow !== null && !lineup.players.some((player) => player.sheetRow === captain.selectedRow));
  if (selectedRowIsGone) captain.selectedRow = null;
  renderAreaButtons(lineup);
  updateUndoButton();
  renderPanel(lineup, inField);
  if (isFielding && inField) bindFieldEditing();
  renderDock(lineup, inField);
}

element('captain-toggle').addEventListener('pointerdown', () => loadScript(SIGN_IN_SCRIPT));
element('captain-toggle').addEventListener('click', startCaptainMode);
element('captain-done').addEventListener('click', stopCaptainMode);
element('captain-undo').addEventListener('click', undoLatest);
AREAS.forEach((area) => element(`area-${area}`).addEventListener('click', () => chooseArea(area)));
installFieldingEvents();
window.addEventListener('hashchange', () => {
  if (window.fieldView.currentLineup() !== null) window.fieldView.rerender();
});
window.captainTools = { afterRender };
if (window.fieldView.currentLineup() !== null) window.fieldView.rerender();
