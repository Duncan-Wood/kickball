export const AREAS = ['lineup', 'rsvps', 'games', 'roster', 'team'];
export const LINEUP_AREAS = ['lineup', 'rsvps'];
export const RSVP_ANSWERS = ['Yes', 'Maybe', 'No'];
export const ADD_FOCUS_KEY = 'add';

export const element = (id) => document.getElementById(id);

export const captain = {
  active: false,
  previewing: false,
  area: 'lineup',
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
  rosterPlayers: null,
  openRosterRow: null,
  rosterError: null,
  scheduleRows: null,
  scheduleError: null,
  openGameId: null,
  seasonFormOpen: false,
  newGameFormOpen: false,
  addingSeveral: false,
  addingSub: false,
  subDraft: '',
  panelStale: false,
  undoStack: [],
  redoStack: [],
};
