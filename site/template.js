const SHEETS_ADDRESS = 'https://sheets.googleapis.com/v4/spreadsheets';
const POSITION_CODES = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LC', 'CF', 'RC', 'RF'];
const INNING_COUNT = 5;
const LINEUP_ROW_COUNT = 22;
const SHARE_LINK_LABEL = 'Share link';
const CONFIG_SHEET_ID = 0;
const DETAILS_SHEET_ID = 1;
const ROSTER_SHEET_ID = 2;
const SCHEDULE_SHEET_ID = 3;
const GAME_SHEET_ID = 4;
const POSITIONS_SHEET_ID = 5;
const HEADER_FILL = { red: 0.17, green: 0.42, blue: 0.69 };
const WHITE = { red: 1, green: 1, blue: 1 };
const MAIN_FILL = { red: 0.17, green: 0.42, blue: 0.69 };
const SECOND_FILL = { red: 0.93, green: 0.54, blue: 0.21 };
const EXAMPLE_PLAYERS = ['Alex', 'Sam', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Drew', 'Avery', 'Quinn', 'Rowan'];
const EXAMPLE_ROTATION = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LC', 'CF', 'RC', 'RF'];
const MILLISECONDS_PER_DAY = 86400000;
const EXAMPLE_GAME_DAYS_AHEAD = 7;

function exampleDateSerial() {
  const gameDay = Date.now() + EXAMPLE_GAME_DAYS_AHEAD * MILLISECONDS_PER_DAY;
  return Math.floor(gameDay / MILLISECONDS_PER_DAY) + 25569;
}

const SETTINGS = [
  ['Team name', '', 'The heading on the page'],
  ['Season label', '', 'The tag beside the team name, like "Fall 2026"'],
  ['Icon', '🥎', 'One emoji, or a link starting with https:// to a small image'],
  ['Main color', null, 'Buttons, headings and text'],
  ['Second color', null, 'Page background, highlights and borders'],
  ['Stripe', 'Blend', 'Blend fades from main to second color, Rainbow shows six pastel bands'],
  ['Font', 'Fredoka', 'Pick from the list'],
  ['Suggestion box', 'On', 'On shows the anonymous suggestion box, Off hides it'],
];

const textCell = (value, format = {}) => ({ userEnteredValue: { stringValue: String(value) }, userEnteredFormat: format });
const dateCell = (serial) => ({ userEnteredValue: { numberValue: serial }, userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'm/d/yy' }, horizontalAlignment: 'LEFT' } });
const emptyCell = (format = {}) => ({ userEnteredFormat: format });
const boldFormat = { textFormat: { bold: true } };
const headerFormat = { backgroundColor: HEADER_FILL, textFormat: { bold: true, foregroundColor: WHITE } };

function rowsOf(rows) {
  return rows.map((cells) => ({ values: cells }));
}

function sheet(sheetId, title, rows, frozenRowCount = 0) {
  return {
    properties: { sheetId, title, gridProperties: { frozenRowCount } },
    data: [{ startRow: 0, startColumn: 0, rowData: rowsOf(rows) }],
  };
}

function configRows(teamName, seasonLabel) {
  const header = [textCell('Setting', headerFormat), textCell('Value', headerFormat), textCell('Notes (for colors: click the box, then the paint bucket in the toolbar)', headerFormat)];
  const settingRows = SETTINGS.map(([label, value, note]) => {
    const valueCell = label === 'Main color' ? emptyCell({ backgroundColor: MAIN_FILL })
      : label === 'Second color' ? emptyCell({ backgroundColor: SECOND_FILL })
        : textCell(label === 'Team name' ? teamName : label === 'Season label' ? seasonLabel : value);
    return [textCell(label, boldFormat), valueCell, textCell(note)];
  });
  return [header, ...settingRows, [], [textCell(SHARE_LINK_LABEL, boldFormat), textCell(''), textCell('Send this link to your team. It opens the field view and cannot edit anything')]];
}

function detailsRows(teamName) {
  return [
    [textCell('Team Name:', boldFormat), textCell(teamName)],
    [textCell('League:', boldFormat), textCell('')],
    [textCell('Captain:', boldFormat), textCell('')],
    [textCell('Co-captain:', boldFormat), textCell('')],
    [textCell('Team Color:', boldFormat), textCell('')],
    [textCell('Roster:', boldFormat), textCell(String(EXAMPLE_PLAYERS.length))],
  ];
}

function rosterRows() {
  const header = ['Roster', 'Name', '', 'Notes', 'Top 3 positions', "Won't play"].map((label) => textCell(label, headerFormat));
  const players = EXAMPLE_PLAYERS.map((name, index) => [textCell(index + 1), textCell(name), emptyCell(), textCell(index === 0 ? 'Private notes about each player. Only you see this tab' : ''), textCell(''), textCell('')]);
  return [header, ...players];
}

function scheduleRows() {
  const header = ['Game #', 'Date', 'Time', 'Location', 'Opponent', 'Notes'].map((label) => textCell(label, headerFormat));
  const games = [1, 2, 3, 4, 5, 6].map((number) => [textCell(number), textCell(''), textCell(''), textCell(''), textCell(''), textCell('')]);
  games[0][5] = textCell('After the game, type the result here like W, 12-0');
  return [header, ...games];
}

function gameRows() {
  const innings = Array.from({ length: INNING_COUNT }, (_, index) => textCell(index + 1, headerFormat));
  const detailRows = [['Game #:', '1'], ['Date:', null], ['Time:', '7:00 PM'], ['Location:', 'Your field'], ['Opponent:', 'The Other Team'], ['Notes:', '']].map(([label, value]) => [
    textCell(label, boldFormat),
    label === 'Date:' ? dateCell(exampleDateSerial()) : textCell(value),
  ]);
  const header = [textCell('Name', headerFormat), textCell('', headerFormat), ...innings];
  const players = Array.from({ length: LINEUP_ROW_COUNT }, (_, rowIndex) => {
    if (rowIndex >= EXAMPLE_PLAYERS.length) return [emptyCell()];
    const name = rowIndex === EXAMPLE_PLAYERS.length - 1 ? textCell(EXAMPLE_PLAYERS[rowIndex], { textFormat: { strikethrough: true } }) : textCell(EXAMPLE_PLAYERS[rowIndex]);
    if (rowIndex === EXAMPLE_PLAYERS.length - 1) return [name];
    const positions = Array.from({ length: INNING_COUNT }, (_, inning) => textCell(EXAMPLE_ROTATION[(rowIndex + inning) % EXAMPLE_ROTATION.length]));
    return [name, emptyCell(), ...positions];
  });
  const acceptable = [textCell('Acceptable', boldFormat), emptyCell(), ...Array.from({ length: INNING_COUNT }, () => textCell('Yes'))];
  return [...detailRows, [], header, ...players, acceptable];
}

function positionsRows() {
  const names = ['Pitcher', 'Catcher', 'First Baseperson', 'Second Baseperson', 'Third Baseperson', 'Shortstop', 'Left Fielder', 'Left Center Fielder', 'Center Fielder', 'Right Center Fielder', 'Right Fielder'];
  return [[textCell('Field Positions', headerFormat), textCell('Code', headerFormat)], ...names.map((name, index) => [textCell(name), textCell(POSITION_CODES[index])])];
}

function listValidation(sheetId, startRow, endRow, startColumn, endColumn, values) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startColumn, endColumnIndex: endColumn },
      rule: { condition: { type: 'ONE_OF_LIST', values: values.map((value) => ({ userEnteredValue: value })) }, showCustomUi: true, strict: true },
    },
  };
}

function columnWidth(sheetId, column, pixelSize) {
  return { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: column, endIndex: column + 1 }, properties: { pixelSize }, fields: 'pixelSize' } };
}

function configFormattingRequests(sheetId) {
  return [
    listValidation(sheetId, 6, 7, 1, 2, ['Blend', 'Rainbow']),
    listValidation(sheetId, 7, 8, 1, 2, ['Fredoka', 'Nunito', 'Poppins', 'Roboto', 'Lora']),
    listValidation(sheetId, 8, 9, 1, 2, ['On', 'Off']),
    columnWidth(sheetId, 0, 160), columnWidth(sheetId, 1, 160), columnWidth(sheetId, 2, 460),
  ];
}

function formattingRequests() {
  const gameFirstPlayerRow = 8;
  return [
    ...configFormattingRequests(CONFIG_SHEET_ID),
    listValidation(GAME_SHEET_ID, gameFirstPlayerRow, gameFirstPlayerRow + LINEUP_ROW_COUNT, 2, 2 + INNING_COUNT, POSITION_CODES),
    columnWidth(DETAILS_SHEET_ID, 0, 140), columnWidth(DETAILS_SHEET_ID, 1, 320),
    columnWidth(ROSTER_SHEET_ID, 1, 160), columnWidth(ROSTER_SHEET_ID, 3, 380), columnWidth(ROSTER_SHEET_ID, 4, 160), columnWidth(ROSTER_SHEET_ID, 5, 160),
    columnWidth(SCHEDULE_SHEET_ID, 1, 90), columnWidth(SCHEDULE_SHEET_ID, 3, 220), columnWidth(SCHEDULE_SHEET_ID, 4, 200), columnWidth(SCHEDULE_SHEET_ID, 5, 320),
    columnWidth(GAME_SHEET_ID, 0, 160), columnWidth(GAME_SHEET_ID, 1, 160),
    columnWidth(POSITIONS_SHEET_ID, 0, 200),
    {
      addBanding: {
        bandedRange: {
          range: { sheetId: GAME_SHEET_ID, startRowIndex: gameFirstPlayerRow, endRowIndex: gameFirstPlayerRow + LINEUP_ROW_COUNT, startColumnIndex: 0, endColumnIndex: 2 + INNING_COUNT },
          rowProperties: { firstBandColor: WHITE, secondBandColor: { red: 0.89, green: 0.93, blue: 0.97 } },
        },
      },
    },
  ];
}

async function sheetsRequest(accessToken, path, method, body) {
  const response = await fetch(`${SHEETS_ADDRESS}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Google could not build the sheet (${response.status}): ${(await response.json()).error?.message ?? ''}`);
  return response.json();
}

export async function createTeamSheet(accessToken, teamName, seasonLabel) {
  const created = await sheetsRequest(accessToken, '', 'POST', {
    properties: { title: `${teamName} Kickball Lineup` },
    sheets: [
      sheet(CONFIG_SHEET_ID, 'Team Config', configRows(teamName, seasonLabel), 1),
      sheet(DETAILS_SHEET_ID, 'Team Details', detailsRows(teamName)),
      sheet(ROSTER_SHEET_ID, 'Roster', rosterRows(), 1),
      sheet(SCHEDULE_SHEET_ID, 'Schedule', scheduleRows(), 1),
      sheet(GAME_SHEET_ID, 'Game 1 Lineup', gameRows()),
      sheet(POSITIONS_SHEET_ID, 'Positions', positionsRows(), 1),
    ],
  });
  await sheetsRequest(accessToken, `/${created.spreadsheetId}:batchUpdate`, 'POST', { requests: formattingRequests() });
  return { spreadsheetId: created.spreadsheetId, spreadsheetUrl: created.spreadsheetUrl };
}

export async function saveShareLink(accessToken, spreadsheetId, shareLink) {
  const shareRow = SETTINGS.length + 3;
  await sheetsRequest(accessToken, `/${spreadsheetId}/values/${encodeURIComponent(`'Team Config'!B${shareRow}`)}?valueInputOption=RAW`, 'PUT', { values: [[shareLink]] });
}

export async function addTeamConfigTab(accessToken, spreadsheetId, teamName, seasonLabel) {
  const overview = await (await fetch(`${SHEETS_ADDRESS}/${spreadsheetId}?fields=sheets.properties.title`, { headers: { Authorization: `Bearer ${accessToken}` } })).json();
  if (overview.sheets.some((existing) => existing.properties.title === 'Team Config')) return;
  const added = await sheetsRequest(accessToken, `/${spreadsheetId}:batchUpdate`, 'POST', {
    requests: [{ addSheet: { properties: { title: 'Team Config', index: 0, gridProperties: { frozenRowCount: 1 } } } }],
  });
  const sheetId = added.replies[0].addSheet.properties.sheetId;
  await sheetsRequest(accessToken, `/${spreadsheetId}:batchUpdate`, 'POST', {
    requests: [
      { updateCells: { rows: rowsOf(configRows(teamName, seasonLabel)), start: { sheetId, rowIndex: 0, columnIndex: 0 }, fields: 'userEnteredValue,userEnteredFormat' } },
      ...configFormattingRequests(sheetId),
    ],
  });
}
