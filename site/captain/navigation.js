import { loadRoster } from './roster.js';
import { loadSchedule } from './schedule.js';
import { captain } from './state.js';

export function chooseArea(area) {
  if (captain.area === 'team') window.fieldView.previewConfig(window.fieldView.currentConfig());
  captain.area = area;
  captain.panelStale = true;
  captain.focus = null;
  if (['lineup', 'rsvps', 'roster'].includes(area) && captain.canEditRoster) loadRoster();
  if (area === 'games') loadSchedule();
  window.fieldView.rerender();
}
