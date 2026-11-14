export const AREAS = ['start', 'fielding', 'kicking', 'players', 'games', 'team'];
export const RSVP_ANSWERS = ['Yes', 'Maybe', 'No'];
export const ADD_FOCUS_KEY = 'add';

export const element = (id) => document.getElementById(id);

export const captain = {
  active: false,
  area: 'fielding',
  selectedRow: null,
  focus: null,
  editMode: 'one',
  editInnings: new Set([0]),
  viewedInning: 0,
  tabName: null,
  saving: false,
  accessToken: null,
  accessTokenExpiresAt: 0,
  spreadsheetId: null,
  tabs: new Map(),
  canManageGames: false,
  canEditTeam: false,
  rosterNames: null,
  rosterPlayers: null,
  openRosterRow: null,
  teamView: 'settings',
  rosterError: null,
  scheduleRows: null,
  scheduleError: null,
  openGameId: null,
  draftGameId: null,
  seasonFormOpen: false,
  addingSeveral: false,
  panelStale: false,
  undoStack: [],
};
