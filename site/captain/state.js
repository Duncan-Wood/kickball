export const AREAS = ['lineup', 'rsvps', 'games', 'roster', 'team'];
export const LINEUP_AREAS = ['lineup', 'rsvps'];
export const RSVP_ANSWERS = ['Yes', 'Maybe', 'No'];
export const ADD_FOCUS_KEY = 'add';

export const element = (id) => document.getElementById(id);

export const captain = {
  active: false,
  previewing: false,
  area: 'lineup',
  selectedRow: null,
  focus: null,
  tabName: null,
  saving: false,
  accessToken: null,
  accessTokenExpiresAt: 0,
  spreadsheetId: null,
  tabs: new Map(),
  canManageGames: false,
  canEditTeam: false,
  canEditRoster: false,
  rosterNames: null,
  rosterPlayers: null,
  openRosterRow: null,
  rosterError: null,
  scheduleRows: null,
  scheduleError: null,
  openGameId: null,
  draftGameId: null,
  seasonFormOpen: false,
  addingSeveral: false,
  panelStale: false,
  undoStack: [],
  redoStack: [],
};
