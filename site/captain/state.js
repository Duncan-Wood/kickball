export const AREAS = ['fielding', 'kicking', 'players', 'games', 'team'];
export const RSVP_ANSWERS = ['Yes', 'Maybe', 'No'];

export const element = (id) => document.getElementById(id);

export const captain = {
  active: false,
  area: 'fielding',
  selectedRow: null,
  focus: null,
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
  rosterError: null,
  scheduleRows: null,
  scheduleError: null,
  openGameId: null,
  draftGameId: null,
  panelStale: false,
  undoStack: [],
};
