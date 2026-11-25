import { headcount } from './edits.js';
import { bindFieldEditing, copyInningControls, fieldingPanel, installFieldingEvents, keyboardIsInUse, renderDock, resetEditingState, restoreKeyboardFocus } from './captain/fielding.js';
import { gamesPanel } from './captain/gamesPanel.js';
import { teamPanel } from './captain/teamPanel.js';
import { chooseArea } from './captain/navigation.js';
import { playersPanel } from './captain/people.js';
import { rosterPanel } from './captain/rosterPanel.js';
import { SIGN_IN_SCRIPT, loadScript, unexpiredAccessToken } from './captain/sheetApi.js';
import { captainToolsOffered, firstAreaWithoutLineup, toggleCaptainView } from './captain/session.js';
import { ADD_FOCUS_KEY, AREAS, LINEUP_AREAS, captain, element } from './captain/state.js';
import { redoLatest, undoLatest, updateUndoButton } from './captain/status.js';
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

const isEditing = () => captain.active && !captain.previewing;

function renderPanel(lineup, inField) {
  const panel = element('captain-panel');
  panel.hidden = !isEditing() || (lineup === null && LINEUP_AREAS.includes(captain.area));
  if (panel.hidden) {
    panel.replaceChildren();
    delete panel.dataset.area;
    return;
  }
  const formPanels = { games: gamesPanel, roster: rosterPanel, team: teamPanel };
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
  if (captain.area === 'rsvps') panel.replaceChildren(...playersPanel(lineup));
  else panel.replaceChildren(...fieldingPanel(lineup, inField));
}

function renderAreaButtons(lineup) {
  AREAS.forEach((area) => element(`area-${area}`).setAttribute('aria-pressed', String(captain.area === area)));
  LINEUP_AREAS.forEach((area) => { element(`area-${area}`).hidden = lineup === null; });
  element('area-games').hidden = !captain.canManageGames;
  element('area-roster').hidden = !captain.canEditRoster;
  element('area-team').hidden = !captain.canEditTeam;
  const rsvpsButton = element('area-rsvps');
  rsvpsButton.replaceChildren('RSVPs');
  if (lineup !== null) rsvpsButton.append(node('span', 'area-count', String(headcount(lineup.players).playing)));
}

function afterRender() {
  const inField = window.fieldView.inFieldMode();
  const isFielding = captain.area === 'lineup';
  const editing = isEditing();
  element('captain-bar').hidden = !editing;
  document.body.classList.toggle('captain-active', editing && inField && isFielding);
  document.body.classList.toggle('captain-list', editing && !isFielding);
  document.documentElement.classList.toggle('captain-mode', editing);
  const toggle = element('captain-toggle');
  toggle.hidden = !captain.active && !captainToolsOffered();
  toggle.textContent = editing ? 'Player view' : 'Edit';
  if (!editing) {
    renderPanel(null, false);
    renderDock(null, false);
    return;
  }
  const lineup = window.fieldView.currentLineup();
  if (lineup === null && LINEUP_AREAS.includes(captain.area)) captain.area = firstAreaWithoutLineup();
  if (lineup !== null && captain.tabName !== lineup.tabName) resetEditingState(lineup);
  renderAreaButtons(lineup);
  element('captain-context').replaceChildren(...(isFielding && lineup !== null ? copyInningControls(lineup, inField) : []));
  updateUndoButton();
  element('captain-share').hidden = !window.fieldView.canShareLineup();
  renderPanel(lineup, inField);
  if (isFielding && inField) bindFieldEditing();
  renderDock(lineup, inField);
  restoreKeyboardFocus();
}

element('captain-toggle').addEventListener('pointerdown', () => loadScript(SIGN_IN_SCRIPT));
element('captain-toggle').addEventListener('click', toggleCaptainView);
element('captain-undo').addEventListener('click', undoLatest);
element('captain-redo').addEventListener('click', redoLatest);
element('captain-share').addEventListener('click', () => window.fieldView.shareLineup(element('captain-share')));
AREAS.forEach((area) => element(`area-${area}`).addEventListener('click', () => chooseArea(area)));
installFieldingEvents();
document.addEventListener('pointerdown', () => { pendingRefocusKey = null; });
element('captain-panel').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.tagName === 'SELECT') event.preventDefault();
});
window.addEventListener('hashchange', () => window.fieldView.rerender());
window.captainTools = { afterRender, isActive: isEditing, signedIn: () => captain.active, unexpiredAccessToken };
window.fieldView.rerender();
