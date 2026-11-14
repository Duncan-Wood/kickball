import { loadRoster } from './roster.js';
import { loadSchedule } from './schedule.js';
import { captain } from './state.js';

export function chooseArea(area) {
  if (captain.area === 'team') window.fieldView.previewConfig(window.fieldView.currentConfig());
  captain.area = area;
  captain.panelStale = true;
  captain.selectedRow = null;
  captain.focus = null;
  if (area === 'players' || area === 'team' || area === 'start' || area === 'kicking') loadRoster();
  if (area === 'games' || area === 'start') loadSchedule();
  window.fieldView.rerender();
}
