import { captain, element } from './state.js';

const STATUS_MILLISECONDS = 3000;
const UNDO_LIMIT = 30;

let statusTimer = null;

export function setStatus(text, { isError = false, sticky = false } = {}) {
  clearTimeout(statusTimer);
  const status = element('captain-status');
  status.textContent = text;
  status.classList.toggle('empty', text === '');
  status.classList.toggle('error', isError);
  if (text !== '' && !isError && !sticky) statusTimer = setTimeout(() => setStatus(''), STATUS_MILLISECONDS);
}

function updateHistoryButton(buttonId, stack, verb) {
  const historyButton = element(buttonId);
  const latest = stack[stack.length - 1];
  historyButton.disabled = latest === undefined || captain.saving;
  historyButton.title = latest === undefined ? `Nothing to ${verb.toLowerCase()}` : `${verb}: ${latest.label}`;
}

export function updateUndoButton() {
  updateHistoryButton('captain-undo', captain.undoStack, 'Undo');
  updateHistoryButton('captain-redo', captain.redoStack, 'Redo');
}

async function runWhileSaving(startText, work) {
  captain.saving = true;
  setStatus(startText, { sticky: true });
  updateUndoButton();
  try {
    return await work();
  } finally {
    captain.saving = false;
    updateUndoButton();
  }
}

export async function saveEdit(work, label) {
  try {
    await runWhileSaving('Saving…', async () => {
      const undo = await work();
      if (typeof undo === 'function') captain.undoStack = [...captain.undoStack, { label, run: undo }].slice(-UNDO_LIMIT);
      captain.redoStack = [];
      window.fieldView.changed();
      setStatus(label === undefined ? 'Saved' : `Saved: ${label}`);
    });
    return true;
  } catch (error) {
    window.fieldView.rerender();
    setStatus(error.message, { isError: true });
    return false;
  }
}

let autosaveQueue = Promise.resolve();

export function autosave(work, label) {
  autosaveQueue = autosaveQueue.then(() => saveEdit(async () => {
    const undo = await work();
    captain.panelStale = false;
    return undo;
  }, label));
  return autosaveQueue;
}

async function stepThroughHistory(fromKey, toKey, startText, doneText) {
  const entry = captain[fromKey][captain[fromKey].length - 1];
  if (entry === undefined || captain.saving) return;
  captain[fromKey] = captain[fromKey].slice(0, -1);
  try {
    await runWhileSaving(startText, async () => {
      const reverse = await entry.run();
      if (typeof reverse !== 'function') throw new Error(`"${entry.label}" did not return a way to reverse it`);
      captain[toKey] = [...captain[toKey], { label: entry.label, run: reverse }].slice(-UNDO_LIMIT);
      window.fieldView.changed();
      setStatus(`${doneText}: ${entry.label}`);
    });
  } catch (error) {
    window.fieldView.rerender();
    setStatus(error.message, { isError: true });
  }
}

export function undoLatest() {
  return stepThroughHistory('undoStack', 'redoStack', 'Undoing…', 'Undone');
}

export function redoLatest() {
  return stepThroughHistory('redoStack', 'undoStack', 'Redoing…', 'Redone');
}
