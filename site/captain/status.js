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

export function updateUndoButton() {
  const undoButton = element('captain-undo');
  const latest = captain.undoStack[captain.undoStack.length - 1];
  undoButton.disabled = latest === undefined || captain.saving;
  undoButton.title = latest === undefined ? 'Nothing to undo' : `Undo: ${latest.label}`;
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
      captain.selectedRow = null;
      if (typeof undo === 'function') captain.undoStack = [...captain.undoStack, { label, run: undo }].slice(-UNDO_LIMIT);
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

export async function undoLatest() {
  const entry = captain.undoStack[captain.undoStack.length - 1];
  if (entry === undefined || captain.saving) return;
  captain.undoStack = captain.undoStack.slice(0, -1);
  try {
    await runWhileSaving('Undoing…', async () => {
      await entry.run();
      window.fieldView.changed();
      setStatus(`Undone: ${entry.label}`);
    });
  } catch (error) {
    window.fieldView.rerender();
    setStatus(error.message, { isError: true });
  }
}
