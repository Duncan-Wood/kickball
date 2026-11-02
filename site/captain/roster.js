import { ROSTER_TAB_NAME } from '../template.js';
import { columnValues, refreshTabs } from './sheetApi.js';
import { captain } from './state.js';

export async function fetchRosterNames() {
  return (await columnValues(`${ROSTER_TAB_NAME}!A2:A`)).filter((name) => name !== '');
}

export async function loadRosterNames() {
  captain.rosterNames = null;
  captain.rosterError = null;
  try {
    await refreshTabs();
    if (!captain.tabs.has(ROSTER_TAB_NAME)) throw new Error(`This sheet has no ${ROSTER_TAB_NAME} tab, so there is nobody to add from here`);
    captain.rosterNames = await fetchRosterNames();
  } catch (error) {
    captain.rosterError = error.message;
  }
  window.fieldView.rerender();
}
