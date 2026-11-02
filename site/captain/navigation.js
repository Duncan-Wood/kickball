import { loadRosterNames } from './roster.js';
import { loadSchedule } from './schedule.js';
import { captain } from './state.js';

export function chooseArea(area) {
  captain.area = area;
  captain.selectedRow = null;
  captain.focus = null;
  if (area === 'players') loadRosterNames();
  if (area === 'games') loadSchedule();
  window.fieldView.rerender();
}
