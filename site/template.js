import { CONFIG_FIELDS, FONTS, STRIPE_STYLES } from './teamSettings.js';
const SHEETS_ADDRESS = 'https://sheets.googleapis.com/v4/spreadsheets';
export const POSITION_CODES = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LC', 'CF', 'RC', 'RF'];
export const POSITION_NAMES = ['Pitcher', 'Catcher', 'First Baseperson', 'Second Baseperson', 'Third Baseperson', 'Shortstop', 'Left Fielder', 'Left Center Fielder', 'Center Fielder', 'Right Center Fielder', 'Right Fielder'];
const INNING_COUNT = 5;
const LINEUP_ROW_COUNT = 22;
const SHARE_LINK_LABEL = 'Share link';
export const ROSTER_TAB_NAME = 'Roster';
export const SCHEDULE_TAB_NAME = 'Schedule';
export const NEW_GAME_TAB_NAME = 'New game (copy me)';
const CONFIG_SHEET_ID = 0;
const ROSTER_SHEET_ID = 1;
const SCHEDULE_SHEET_ID = 2;
const POSITIONS_SHEET_ID = 4;
const START_SHEET_ID = 5;
const NEW_GAME_SHEET_ID = 6;
const SCHEDULE_FORMATTED_ROW_COUNT = 48;
const START_TEAM_LINK_ROW = 3;
const START_CAPTAIN_LINK_ROW = 4;
const SCHEDULE_FIRST_ROW_INDEX = 1;
const ROSTER_LAST_ROW = 60;
const GAME_HEADER_ROW_INDEX = 7;
const GAME_FIRST_PLAYER_ROW_INDEX = 8;
const GAME_LAST_PLAYER_ROW_INDEX = GAME_FIRST_PLAYER_ROW_INDEX + LINEUP_ROW_COUNT - 1;
const GAME_OPEN_SPOTS_ROW_INDEX = GAME_LAST_PLAYER_ROW_INDEX + 1;
const GAME_RSVP_COLUMN_INDEX = 1;
const GAME_FIRST_INNING_COLUMN_INDEX = 2;
const GAME_PREFERS_COLUMN_INDEX = GAME_FIRST_INNING_COLUMN_INDEX + INNING_COUNT;
const GAME_AVOIDS_COLUMN_INDEX = GAME_PREFERS_COLUMN_INDEX + 1;
const RSVP_ANSWERS = ['Yes', 'Maybe', 'No'];
const HEADER_FILL = { red: 0.17, green: 0.42, blue: 0.69 };
const WHITE = { red: 1, green: 1, blue: 1 };
const MAIN_FILL = { red: 0.17, green: 0.42, blue: 0.69 };
const SECOND_FILL = { red: 0.93, green: 0.54, blue: 0.21 };
const INPUT_FILL = { red: 1, green: 0.97, blue: 0.84 };
const BAND_FILL = { red: 0.89, green: 0.93, blue: 0.97 };
const PREFERS_TEXT = { red: 0.12, green: 0.42, blue: 0.2 };
const PREFERS_FILL = { red: 0.85, green: 0.94, blue: 0.87 };
const AVOIDS_TEXT = { red: 0.7, green: 0.15, blue: 0.12 };
const AVOIDS_FILL = { red: 0.98, green: 0.84, blue: 0.84 };
const DOUBLED_TEXT = { red: 0.54, green: 0.29, blue: 0 };
const DOUBLED_FILL = { red: 0.99, green: 0.9, blue: 0.78 };
const MAYBE_FILL = { red: 1, green: 0.95, blue: 0.76 };
const ABSENT_TEXT = { red: 0.6, green: 0.63, blue: 0.66 };
const NO_REPLY_FILL = { red: 0.9, green: 0.9, blue: 0.9 };
function columnLetter(columnIndex) {
  return String.fromCharCode('A'.charCodeAt(0) + columnIndex);
}

const SETTINGS = CONFIG_FIELDS.map(({ key, kind, defaultValue, label, note }) => [label, kind === 'color' ? null : key === 'teamName' || key === 'seasonLabel' ? '' : defaultValue, note]);

const DATE_FORMAT = { type: 'DATE', pattern: 'm/d/yy' };
const TIME_FORMAT = { type: 'TIME', pattern: 'h:mm AM/PM' };
const textCell = (value, format = {}, note) => ({ userEnteredValue: { stringValue: String(value) }, userEnteredFormat: format, ...(note && { note }) });
const numberCell = (value, format = {}, note) => ({ userEnteredValue: { numberValue: value }, userEnteredFormat: format, ...(note && { note }) });
const formulaCell = (formula, format = {}) => ({ userEnteredValue: { formulaValue: formula }, userEnteredFormat: format });
const emptyCell = (format = {}) => ({ userEnteredFormat: format });
const boldFormat = { textFormat: { bold: true } };
const headerFormat = { backgroundColor: HEADER_FILL, textFormat: { bold: true, foregroundColor: WHITE } };
const centeredHeaderFormat = { ...headerFormat, horizontalAlignment: 'CENTER' };
const centeredFormat = { horizontalAlignment: 'CENTER' };

function rowsOf(rows) {
  return rows.map((cells) => ({ values: cells }));
}

function sheet(sheetId, title, rows, { frozenRowCount = 0, frozenColumnCount = 0, hidden = false } = {}) {
  return {
    properties: { sheetId, title, hidden, gridProperties: { frozenRowCount, frozenColumnCount } },
    rowData: rowsOf(rows),
  };
}

function configRows(teamName, seasonLabel) {
  const header = [textCell('Setting', headerFormat), textCell('Value', headerFormat), textCell('Notes', headerFormat)];
  const settingRows = SETTINGS.map(([label, value, note]) => {
    const valueCell = label === 'Main color' ? emptyCell({ backgroundColor: MAIN_FILL })
      : label === 'Second color' ? emptyCell({ backgroundColor: SECOND_FILL })
        : textCell(label === 'Team name' ? teamName : label === 'Season label' ? seasonLabel : value);
    return [textCell(label, boldFormat), valueCell, textCell(note)];
  });
  return [header, ...settingRows, [], [textCell(SHARE_LINK_LABEL, boldFormat), textCell(''), textCell('Send this link to your team. It opens the field view and cannot edit anything')]];
}

function startRows() {
  const wrapped = { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' };
  return [
    [textCell('Start here', headerFormat), textCell('Open the Captain link to set up your season.', headerFormat)],
    [],
    [textCell('Team link', { ...boldFormat, ...wrapped }), textCell('', wrapped)],
    [textCell('Captain link', { ...boldFormat, ...wrapped }), textCell('', wrapped)],
  ];
}

function rosterRows() {
  return [[
    textCell('Name', headerFormat),
    textCell('Prefers', headerFormat, 'Positions they like, like SS, 2B'),
    textCell("Won't play", headerFormat, 'Positions they would rather not play'),
    textCell('Notes', headerFormat),
    textCell('Pronouns', headerFormat),
  ]];
}

function scheduleRows() {
  return [[
    textCell('Game #', headerFormat),
    textCell('Date', headerFormat),
    textCell('Time', headerFormat),
    textCell('Location', headerFormat),
    textCell('Opponent', headerFormat),
    textCell('Notes', headerFormat, 'After the game, add the result like W, 12-0'),
  ]];
}

function scheduleLookup(columnNumber, format = {}) {
  return formulaCell(`=IFERROR(VLOOKUP($B$1,Schedule!$A:$F,${columnNumber},FALSE),"")`, { horizontalAlignment: 'LEFT', ...format });
}

function playerLookup(rowNumber, columnNumber) {
  return `=IFERROR(VLOOKUP(TRIM($A${rowNumber}),Roster!$A:$C,${columnNumber},FALSE),"")`;
}

function openSpotsFormula(columnIndex) {
  const column = columnLetter(columnIndex);
  const firstRow = GAME_FIRST_PLAYER_ROW_INDEX + 1;
  const lastRow = GAME_LAST_PLAYER_ROW_INDEX + 1;
  const rsvp = columnLetter(GAME_RSVP_COLUMN_INDEX);
  return `=IFERROR(TEXTJOIN(", ",TRUE,FILTER(Positions!$B$2:$B$12,COUNTIFS(${column}$${firstRow}:${column}$${lastRow},Positions!$B$2:$B$12,$${rsvp}$${firstRow}:$${rsvp}$${lastRow},"<>No")=0)),"")`;
}

function gameRows() {
  const gameNumberNote = 'Matches a row on the Schedule tab, which fills in the date, time, location and opponent below';
  const gameNumberFormat = { backgroundColor: INPUT_FILL, textFormat: { bold: true }, horizontalAlignment: 'LEFT' };
  const details = [
    [textCell('Game #:', boldFormat), { ...emptyCell(gameNumberFormat), note: gameNumberNote }],
    [textCell('Date:', boldFormat), scheduleLookup(2, { numberFormat: DATE_FORMAT })],
    [textCell('Time:', boldFormat), scheduleLookup(3, { numberFormat: TIME_FORMAT })],
    [textCell('Location:', boldFormat), scheduleLookup(4)],
    [textCell('Opponent:', boldFormat), scheduleLookup(5)],
    [textCell('Notes:', boldFormat), scheduleLookup(6)],
  ];
  const inningHeaders = Array.from({ length: INNING_COUNT }, (unused, index) => numberCell(index + 1, centeredHeaderFormat));
  const rsvpNote = 'Yes, Maybe or No. Gray means no reply yet';
  const header = [textCell('Name', headerFormat), textCell('RSVP', centeredHeaderFormat, rsvpNote), ...inningHeaders, textCell('Prefers', headerFormat), textCell("Won't play", headerFormat)];
  const players = Array.from({ length: LINEUP_ROW_COUNT }, (unused, rowIndex) => {
    const rowNumber = GAME_FIRST_PLAYER_ROW_INDEX + rowIndex + 1;
    const lookups = [formulaCell(playerLookup(rowNumber, 2)), formulaCell(playerLookup(rowNumber, 3))];
    const emptyPositions = Array.from({ length: INNING_COUNT }, () => emptyCell(centeredFormat));
    return [emptyCell(), emptyCell(centeredFormat), ...emptyPositions, ...lookups];
  });
  const openSpots = [
    textCell('Open spots', boldFormat),
    emptyCell(),
    ...Array.from({ length: INNING_COUNT }, (unused, index) => formulaCell(openSpotsFormula(GAME_FIRST_INNING_COLUMN_INDEX + index), { textFormat: { bold: true, foregroundColor: AVOIDS_TEXT }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })),
  ];
  return [...details, [], header, ...players, openSpots];
}

function positionsRows() {
  return [[textCell('Field Positions', headerFormat), textCell('Code', headerFormat)], ...POSITION_NAMES.map((name, index) => [textCell(name), textCell(POSITION_CODES[index])])];
}

function listValidation(sheetId, startRow, endRow, startColumn, endColumn, values) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startColumn, endColumnIndex: endColumn },
      rule: { condition: { type: 'ONE_OF_LIST', values: values.map((value) => ({ userEnteredValue: value })) }, showCustomUi: true, strict: true },
    },
  };
}

function rosterNameValidation(sheetId, startRow, endRow) {
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: 1 },
      rule: { condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: `=Roster!$A$2:$A$${ROSTER_LAST_ROW}` }] }, showCustomUi: true, strict: false },
    },
  };
}

function columnWidth(sheetId, column, pixelSize) {
  return { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: column, endIndex: column + 1 }, properties: { pixelSize }, fields: 'pixelSize' } };
}

const NUMBER_AND_ALIGNMENT_FIELDS = 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment';
const TEXT_COLOR_FIELDS = 'userEnteredFormat.textFormat.foregroundColor';

function columnFormat(sheetId, startRow, endRow, column, format, fields) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: column, endColumnIndex: column + 1 },
      cell: { userEnteredFormat: format },
      fields,
    },
  };
}

function formulaRule(sheetId, startColumn, endColumn, formula, format) {
  return {
    ranges: [{ sheetId, startRowIndex: GAME_FIRST_PLAYER_ROW_INDEX, endRowIndex: GAME_LAST_PLAYER_ROW_INDEX + 1, startColumnIndex: startColumn, endColumnIndex: endColumn }],
    booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format },
  };
}

function gameConditionalFormats(sheetId) {
  const firstRow = GAME_FIRST_PLAYER_ROW_INDEX + 1;
  const lastRow = GAME_LAST_PLAYER_ROW_INDEX + 1;
  const firstInning = columnLetter(GAME_FIRST_INNING_COLUMN_INDEX);
  const rsvp = columnLetter(GAME_RSVP_COLUMN_INDEX);
  const prefers = columnLetter(GAME_PREFERS_COLUMN_INDEX);
  const avoids = columnLetter(GAME_AVOIDS_COLUMN_INDEX);
  const positionMatch = (listColumn) => `REGEXMATCH(UPPER($${listColumn}${firstRow}),"(^|[^A-Z0-9])"&UPPER(${firstInning}${firstRow})&"([^A-Z0-9]|$)")`;
  const inningEnd = GAME_FIRST_INNING_COLUMN_INDEX + INNING_COUNT;
  const rules = [
    formulaRule(sheetId, 0, inningEnd, `=$${rsvp}${firstRow}="No"`, { textFormat: { foregroundColor: ABSENT_TEXT } }),
    formulaRule(sheetId, GAME_FIRST_INNING_COLUMN_INDEX, inningEnd, `=AND(${firstInning}${firstRow}<>"",${positionMatch(avoids)})`, { backgroundColor: AVOIDS_FILL, textFormat: { bold: true, foregroundColor: AVOIDS_TEXT } }),
    formulaRule(sheetId, GAME_FIRST_INNING_COLUMN_INDEX, inningEnd, `=AND(${firstInning}${firstRow}<>"",COUNTIFS(${firstInning}$${firstRow}:${firstInning}$${lastRow},${firstInning}${firstRow},$${rsvp}$${firstRow}:$${rsvp}$${lastRow},"<>No")>1)`, { backgroundColor: DOUBLED_FILL, textFormat: { bold: true, foregroundColor: DOUBLED_TEXT } }),
    formulaRule(sheetId, GAME_FIRST_INNING_COLUMN_INDEX, inningEnd, `=AND(${firstInning}${firstRow}<>"",${positionMatch(prefers)})`, { backgroundColor: PREFERS_FILL, textFormat: { foregroundColor: PREFERS_TEXT } }),
    formulaRule(sheetId, GAME_RSVP_COLUMN_INDEX, GAME_RSVP_COLUMN_INDEX + 1, `=$${rsvp}${firstRow}="Maybe"`, { backgroundColor: MAYBE_FILL }),
    formulaRule(sheetId, GAME_RSVP_COLUMN_INDEX, GAME_RSVP_COLUMN_INDEX + 1, `=AND($A${firstRow}<>"",$${rsvp}${firstRow}="")`, { backgroundColor: NO_REPLY_FILL }),
  ];
  return rules.map((rule, index) => ({ addConditionalFormatRule: { rule, index } }));
}

function configFormattingRequests(sheetId) {
  return [
    listValidation(sheetId, 6, 7, 1, 2, STRIPE_STYLES),
    listValidation(sheetId, 7, 8, 1, 2, FONTS),
    listValidation(sheetId, 8, 9, 1, 2, ['On', 'Off']),
    columnWidth(sheetId, 0, 160), columnWidth(sheetId, 1, 160), columnWidth(sheetId, 2, 460),
  ];
}

function formulaCellWarning(sheetId, startRow, endRow, startColumn, endColumn, message) {
  const firstCell = `${columnLetter(startColumn)}${startRow + 1}`;
  return {
    setDataValidation: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startColumn, endColumnIndex: endColumn },
      rule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=ISFORMULA(${firstCell})` }] }, inputMessage: message, strict: false },
    },
  };
}

function gameTabRequests(sheetId) {
  const playersEnd = GAME_LAST_PLAYER_ROW_INDEX + 1;
  return [
    listValidation(sheetId, GAME_FIRST_PLAYER_ROW_INDEX, playersEnd, GAME_FIRST_INNING_COLUMN_INDEX, GAME_PREFERS_COLUMN_INDEX, POSITION_CODES),
    listValidation(sheetId, GAME_FIRST_PLAYER_ROW_INDEX, playersEnd, GAME_RSVP_COLUMN_INDEX, GAME_RSVP_COLUMN_INDEX + 1, RSVP_ANSWERS),
    rosterNameValidation(sheetId, GAME_FIRST_PLAYER_ROW_INDEX, playersEnd),
    columnFormat(sheetId, GAME_FIRST_PLAYER_ROW_INDEX, playersEnd, GAME_PREFERS_COLUMN_INDEX, { textFormat: { foregroundColor: PREFERS_TEXT } }, TEXT_COLOR_FIELDS),
    columnFormat(sheetId, GAME_FIRST_PLAYER_ROW_INDEX, playersEnd, GAME_AVOIDS_COLUMN_INDEX, { textFormat: { foregroundColor: AVOIDS_TEXT } }, TEXT_COLOR_FIELDS),
    columnWidth(sheetId, 0, 160), columnWidth(sheetId, 1, 80),
    ...Array.from({ length: INNING_COUNT }, (unused, index) => columnWidth(sheetId, GAME_FIRST_INNING_COLUMN_INDEX + index, 70)),
    columnWidth(sheetId, GAME_PREFERS_COLUMN_INDEX, 150), columnWidth(sheetId, GAME_AVOIDS_COLUMN_INDEX, 150),
    formulaCellWarning(sheetId, 1, 6, 1, 2, 'Filled in from the Schedule tab. Typing here replaces the formula'),
    formulaCellWarning(sheetId, GAME_FIRST_PLAYER_ROW_INDEX, playersEnd, GAME_PREFERS_COLUMN_INDEX, GAME_AVOIDS_COLUMN_INDEX + 1, 'Filled in from the Roster tab. Typing here replaces the formula'),
    formulaCellWarning(sheetId, GAME_OPEN_SPOTS_ROW_INDEX, GAME_OPEN_SPOTS_ROW_INDEX + 1, GAME_FIRST_INNING_COLUMN_INDEX, GAME_PREFERS_COLUMN_INDEX, 'Worked out from the lineup above. Typing here replaces the formula'),
    ...gameConditionalFormats(sheetId),
    {
      addBanding: {
        bandedRange: {
          range: { sheetId, startRowIndex: GAME_FIRST_PLAYER_ROW_INDEX, endRowIndex: playersEnd, startColumnIndex: 0, endColumnIndex: GAME_AVOIDS_COLUMN_INDEX + 1 },
          rowProperties: { firstBandColor: WHITE, secondBandColor: BAND_FILL },
        },
      },
    },
  ];
}

export function formattingRequests() {
  const scheduleEndRow = SCHEDULE_FIRST_ROW_INDEX + SCHEDULE_FORMATTED_ROW_COUNT;
  return [
    ...configFormattingRequests(CONFIG_SHEET_ID),
    columnFormat(SCHEDULE_SHEET_ID, SCHEDULE_FIRST_ROW_INDEX, scheduleEndRow, 1, { numberFormat: DATE_FORMAT, horizontalAlignment: 'LEFT' }, NUMBER_AND_ALIGNMENT_FIELDS),
    columnFormat(SCHEDULE_SHEET_ID, SCHEDULE_FIRST_ROW_INDEX, scheduleEndRow, 2, { numberFormat: TIME_FORMAT, horizontalAlignment: 'LEFT' }, NUMBER_AND_ALIGNMENT_FIELDS),
    columnWidth(ROSTER_SHEET_ID, 0, 160), columnWidth(ROSTER_SHEET_ID, 1, 160), columnWidth(ROSTER_SHEET_ID, 2, 160), columnWidth(ROSTER_SHEET_ID, 3, 380), columnWidth(ROSTER_SHEET_ID, 4, 140),
    columnWidth(SCHEDULE_SHEET_ID, 1, 90), columnWidth(SCHEDULE_SHEET_ID, 3, 220), columnWidth(SCHEDULE_SHEET_ID, 4, 200), columnWidth(SCHEDULE_SHEET_ID, 5, 320),
    columnWidth(POSITIONS_SHEET_ID, 0, 200),
    columnWidth(START_SHEET_ID, 0, 150), columnWidth(START_SHEET_ID, 1, 620),
    ...gameTabRequests(NEW_GAME_SHEET_ID),
  ];
}

export function teamSheetDefinition(teamName, seasonLabel) {
  return {
    properties: { title: `${teamName} Kickball Lineup` },
    sheets: [
      sheet(START_SHEET_ID, 'Start here', startRows(), { frozenRowCount: 1 }),
      sheet(ROSTER_SHEET_ID, ROSTER_TAB_NAME, rosterRows(), { frozenRowCount: 1 }),
      sheet(SCHEDULE_SHEET_ID, SCHEDULE_TAB_NAME, scheduleRows(), { frozenRowCount: 1 }),
      sheet(NEW_GAME_SHEET_ID, NEW_GAME_TAB_NAME, gameRows(), { frozenColumnCount: 1, hidden: true }),
      sheet(POSITIONS_SHEET_ID, 'Positions', positionsRows(), { frozenRowCount: 1, hidden: true }),
      sheet(CONFIG_SHEET_ID, 'Team Config', configRows(teamName, seasonLabel), { frozenRowCount: 1, hidden: true }),
    ],
  };
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

export async function createTeamSheet(accessToken, teamName, seasonLabel, timeZone) {
  const definition = teamSheetDefinition(teamName, seasonLabel);
  const created = await sheetsRequest(accessToken, '', 'POST', {
    properties: { ...definition.properties, timeZone },
    sheets: definition.sheets.map(({ properties }) => ({ properties })),
  });
  const cellRequests = definition.sheets.map(({ properties, rowData }) => ({
    updateCells: { rows: rowData, start: { sheetId: properties.sheetId, rowIndex: 0, columnIndex: 0 }, fields: 'userEnteredValue,userEnteredFormat,note' },
  }));
  await sheetsRequest(accessToken, `/${created.spreadsheetId}:batchUpdate`, 'POST', { requests: [...cellRequests, ...formattingRequests()] });
  return { spreadsheetId: created.spreadsheetId, spreadsheetUrl: created.spreadsheetUrl };
}

export async function saveTeamLinks(accessToken, spreadsheetId, teamLink) {
  const shareRow = SETTINGS.length + 3;
  await sheetsRequest(accessToken, `/${spreadsheetId}/values:batchUpdate`, 'POST', {
    valueInputOption: 'RAW',
    data: [
      { range: `'Team Config'!B${shareRow}`, values: [[teamLink]] },
      { range: `'Start here'!B${START_TEAM_LINK_ROW}:B${START_CAPTAIN_LINK_ROW}`, values: [[teamLink], [teamLink === '' ? '' : `${teamLink}#captain`]] },
    ],
  });
}
