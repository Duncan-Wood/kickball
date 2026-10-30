const SHEETS_ADDRESS = 'https://sheets.googleapis.com/v4/spreadsheets';
const POSITION_CODES = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LC', 'CF', 'RC', 'RF'];
const POSITION_NAMES = ['Pitcher', 'Catcher', 'First Baseperson', 'Second Baseperson', 'Third Baseperson', 'Shortstop', 'Left Fielder', 'Left Center Fielder', 'Center Fielder', 'Right Center Fielder', 'Right Fielder'];
const INNING_COUNT = 5;
const LINEUP_ROW_COUNT = 22;
const SHARE_LINK_LABEL = 'Share link';
const CONFIG_SHEET_ID = 0;
const ROSTER_SHEET_ID = 1;
const SCHEDULE_SHEET_ID = 2;
const GAME_SHEET_ID = 3;
const POSITIONS_SHEET_ID = 4;
const START_SHEET_ID = 5;
const NEW_GAME_SHEET_ID = 6;
const GAME_SHEET_IDS = [GAME_SHEET_ID, NEW_GAME_SHEET_ID];
const SCHEDULE_GAME_ROW_COUNT = 8;
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
const BLACK = { red: 0, green: 0, blue: 0 };
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
const EXAMPLE_PLAYERS = ['Alex', 'Sam', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Jamie', 'Drew', 'Avery', 'Quinn', 'Rowan'];
const EXAMPLE_SUB = 'Pat (sub)';
const EXAMPLE_PREFERS = { Alex: 'P, C', Sam: 'SS, 2B, 3B', Avery: 'RC, RF' };
const EXAMPLE_AVOIDS = { Taylor: 'P, C' };
const EXAMPLE_ANSWERS = { Jamie: 'Maybe', Rowan: 'No', Drew: '' };
const MILLISECONDS_PER_DAY = 86400000;
const EXAMPLE_GAME_DAYS_AHEAD = 7;

function exampleDateSerial() {
  const gameDay = Date.now() + EXAMPLE_GAME_DAYS_AHEAD * MILLISECONDS_PER_DAY;
  return Math.floor(gameDay / MILLISECONDS_PER_DAY) + 25569;
}

function columnLetter(columnIndex) {
  return String.fromCharCode('A'.charCodeAt(0) + columnIndex);
}

const SETTINGS = [
  ['Team name', '', 'The heading on the page'],
  ['Season label', '', 'The tag beside the team name, like "Fall 2026"'],
  ['Icon', 'https://duncan-wood.github.io/kickball/icons/kickball.svg', 'One emoji, or a link starting with https:// to a small image'],
  ['Main color', null, 'Buttons, headings and text'],
  ['Second color', null, 'Page background, highlights and borders'],
  ['Stripe', 'Blend', 'Blend fades from main to second color, Rainbow shows six pastel bands'],
  ['Font', 'Fredoka', 'Pick from the list'],
  ['Suggestion box', 'On', 'On shows the anonymous suggestion box, Off hides it'],
];

const DATE_FORMAT = { type: 'DATE', pattern: 'm/d/yy' };
const TIME_FORMAT = { type: 'TIME', pattern: 'h:mm AM/PM' };
const textCell = (value, format = {}, note) => ({ userEnteredValue: { stringValue: String(value) }, userEnteredFormat: format, ...(note && { note }) });
const numberCell = (value, format = {}, note) => ({ userEnteredValue: { numberValue: value }, userEnteredFormat: format, ...(note && { note }) });
const formulaCell = (formula, format = {}) => ({ userEnteredValue: { formulaValue: formula }, userEnteredFormat: format });
const dateCell = (serial) => numberCell(serial, { numberFormat: DATE_FORMAT, horizontalAlignment: 'LEFT' });
const emptyCell = (format = {}) => ({ userEnteredFormat: format });
const boldFormat = { textFormat: { bold: true } };
const headerFormat = { backgroundColor: HEADER_FILL, textFormat: { bold: true, foregroundColor: WHITE } };
const centeredHeaderFormat = { ...headerFormat, horizontalAlignment: 'CENTER' };
const centeredFormat = { horizontalAlignment: 'CENTER' };

function rowsOf(rows) {
  return rows.map((cells) => ({ values: cells }));
}

function sheet(sheetId, title, rows, frozenRowCount = 0, frozenColumnCount = 0) {
  return {
    properties: { sheetId, title, gridProperties: { frozenRowCount, frozenColumnCount } },
    rowData: rowsOf(rows),
  };
}

function configRows(teamName, seasonLabel) {
  const header = [textCell('Setting', headerFormat), textCell('Value', headerFormat), textCell('Notes (colors are optional. To change one, click its box, then the paint bucket in the toolbar)', headerFormat)];
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
  const step = (title, instructions) => [textCell(title, { ...boldFormat, ...wrapped }), textCell(instructions, wrapped)];
  const swatch = (label, meaning, fill, textColor) => [textCell(label, { backgroundColor: fill, textFormat: { bold: true, foregroundColor: textColor }, horizontalAlignment: 'CENTER' }), textCell(meaning, wrapped)];
  return [
    [textCell('Start here', headerFormat), textCell('Five minutes to a team link', headerFormat)],
    step('1. Roster', 'Type your players on the Roster tab, one per row, over the examples. Under Prefers and Won\'t play, list positions separated by commas, like SS, 2B. Subs go on the roster too.'),
    step('2. Schedule', 'On the Schedule tab, fill in each game\'s date, time, location and opponent. After a game, add the result to Notes, like W, 12-0.'),
    step('3. Lineup', 'On Game 1 Lineup, pick each player\'s name in column A. The order is the kicking order. Pick a position for each inning, and set the RSVP column as replies come in.'),
    step('4. Share', 'Your team link is on the Team Config tab, in the Share link row. Send it to your players. They see the lineups and nothing else in this sheet. Roster, Schedule, Positions, Team Config and this tab stay private.'),
    step('Next game', 'Right-click the New game (copy me) tab and choose Duplicate. Rename the copy so it ends with Lineup, like Game 2 Lineup, and type its number in the Game # cell. Players only see tabs whose names end with Lineup.'),
    step('Retire a game', 'Start a tab\'s name with OLD to hide it from players.'),
    step('Add a co-captain', 'Use the Share button at the top right of Google Sheets to give an assistant captain edit access. Players never need access.'),
    [],
    [textCell('What the colors mean', headerFormat), textCell('', headerFormat)],
    swatch('SS', 'Green: a position the player prefers.', PREFERS_FILL, PREFERS_TEXT),
    swatch('P', 'Red: a position the player won\'t play.', AVOIDS_FILL, AVOIDS_TEXT),
    swatch('1B', 'Orange: two players have the same position in that inning.', DOUBLED_FILL, DOUBLED_TEXT),
    swatch('Maybe', 'Yellow RSVP: still planned for.', MAYBE_FILL, BLACK),
    swatch('', 'Gray RSVP: no reply yet. Still planned for.', NO_REPLY_FILL, BLACK),
    swatch('No', 'Gray text on a row: the player is out. The row is left out of the lineup the players see.', WHITE, ABSENT_TEXT),
    [textCell('Open spots', { ...boldFormat, horizontalAlignment: 'CENTER' }), textCell('The row under the players lists positions nobody is covering in that inning.', wrapped)],
    [],
    [textCell('Careful', { ...boldFormat, ...wrapped }), textCell('Date, Time, Location, Opponent, Notes, Prefers, Won\'t play and Open spots fill in by themselves. If you type over one, a red corner flag marks it.', wrapped)],
  ];
}

function rosterRows() {
  const header = [
    textCell('Name', headerFormat),
    textCell('Prefers', headerFormat, 'Positions they like, separated by commas, like SS, 2B. They show up green in a game lineup'),
    textCell("Won't play", headerFormat, 'Positions they would rather not play. They show up red in a game lineup'),
    textCell('Notes (only you see this tab)', headerFormat),
  ];
  const players = [...EXAMPLE_PLAYERS, EXAMPLE_SUB].map((name) => [
    textCell(name),
    textCell(EXAMPLE_PREFERS[name] ?? ''),
    textCell(EXAMPLE_AVOIDS[name] ?? ''),
    textCell(''),
  ]);
  return [header, ...players];
}

function scheduleRows() {
  const header = [
    textCell('Game #', headerFormat),
    textCell('Date', headerFormat),
    textCell('Time', headerFormat),
    textCell('Location', headerFormat),
    textCell('Opponent', headerFormat),
    textCell('Notes', headerFormat, 'Shows on that game. After the game, add the result like W, 12-0'),
  ];
  const games = Array.from({ length: SCHEDULE_GAME_ROW_COUNT }, (unused, index) => [
    numberCell(index + 1, { horizontalAlignment: 'LEFT' }),
    index === 0 ? dateCell(exampleDateSerial()) : emptyCell(),
    index === 0 ? textCell('7:00 PM') : emptyCell(),
    index === 0 ? textCell('Your field') : emptyCell(),
    index === 0 ? textCell('The Other Team') : emptyCell(),
    emptyCell(),
  ]);
  return [header, ...games];
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

function gameRows(isBlank = false) {
  const gameNumberNote = 'The date, time, place and opponent below come from the Schedule tab row with this number. To add the next game, duplicate the New game (copy me) tab instead of this one';
  const blankGameNumberNote = 'Type this game\'s number from the Schedule tab. Then rename this tab so it ends with Lineup, like Game 2 Lineup, and players will see it';
  const gameNumberFormat = { backgroundColor: INPUT_FILL, textFormat: { bold: true }, horizontalAlignment: 'LEFT' };
  const details = [
    [textCell('Game #:', boldFormat), isBlank ? { ...emptyCell(gameNumberFormat), note: blankGameNumberNote } : numberCell(1, gameNumberFormat, gameNumberNote)],
    [textCell('Date:', boldFormat), scheduleLookup(2, { numberFormat: DATE_FORMAT })],
    [textCell('Time:', boldFormat), scheduleLookup(3, { numberFormat: TIME_FORMAT })],
    [textCell('Location:', boldFormat), scheduleLookup(4)],
    [textCell('Opponent:', boldFormat), scheduleLookup(5)],
    [textCell('Notes:', boldFormat), scheduleLookup(6)],
  ];
  const inningHeaders = Array.from({ length: INNING_COUNT }, (unused, index) => numberCell(index + 1, centeredHeaderFormat));
  const rsvpNote = 'Yes, Maybe or No as replies come in. Gray means no reply yet. Players with no reply or a Maybe are still planned for';
  const header = [textCell('Name', headerFormat), textCell('RSVP', centeredHeaderFormat, rsvpNote), ...inningHeaders, textCell('Prefers', headerFormat), textCell("Won't play", headerFormat)];
  const players = Array.from({ length: LINEUP_ROW_COUNT }, (unused, rowIndex) => {
    const rowNumber = GAME_FIRST_PLAYER_ROW_INDEX + rowIndex + 1;
    const lookups = [formulaCell(playerLookup(rowNumber, 2)), formulaCell(playerLookup(rowNumber, 3))];
    const name = isBlank ? undefined : EXAMPLE_PLAYERS[rowIndex];
    const emptyPositions = Array.from({ length: INNING_COUNT }, () => emptyCell(centeredFormat));
    if (name === undefined) return [emptyCell(), emptyCell(centeredFormat), ...emptyPositions, ...lookups];
    const answer = EXAMPLE_ANSWERS[name] ?? 'Yes';
    const answerCell = answer === '' ? emptyCell(centeredFormat) : textCell(answer, centeredFormat);
    const positions = answer === 'No'
      ? emptyPositions
      : Array.from({ length: INNING_COUNT }, (unusedInning, inning) => textCell(POSITION_CODES[(rowIndex + inning) % POSITION_CODES.length], centeredFormat));
    return [textCell(name), answerCell, ...positions, ...lookups];
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
    listValidation(sheetId, 6, 7, 1, 2, ['Blend', 'Rainbow']),
    listValidation(sheetId, 7, 8, 1, 2, ['Fredoka', 'Nunito', 'Poppins', 'Roboto', 'Lora']),
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
  const scheduleEndRow = SCHEDULE_FIRST_ROW_INDEX + SCHEDULE_GAME_ROW_COUNT + 40;
  return [
    ...configFormattingRequests(CONFIG_SHEET_ID),
    columnFormat(SCHEDULE_SHEET_ID, SCHEDULE_FIRST_ROW_INDEX, scheduleEndRow, 1, { numberFormat: DATE_FORMAT, horizontalAlignment: 'LEFT' }, NUMBER_AND_ALIGNMENT_FIELDS),
    columnFormat(SCHEDULE_SHEET_ID, SCHEDULE_FIRST_ROW_INDEX, scheduleEndRow, 2, { numberFormat: TIME_FORMAT, horizontalAlignment: 'LEFT' }, NUMBER_AND_ALIGNMENT_FIELDS),
    columnWidth(ROSTER_SHEET_ID, 0, 160), columnWidth(ROSTER_SHEET_ID, 1, 160), columnWidth(ROSTER_SHEET_ID, 2, 160), columnWidth(ROSTER_SHEET_ID, 3, 380),
    columnWidth(SCHEDULE_SHEET_ID, 1, 90), columnWidth(SCHEDULE_SHEET_ID, 3, 220), columnWidth(SCHEDULE_SHEET_ID, 4, 200), columnWidth(SCHEDULE_SHEET_ID, 5, 320),
    columnWidth(POSITIONS_SHEET_ID, 0, 200),
    columnWidth(START_SHEET_ID, 0, 150), columnWidth(START_SHEET_ID, 1, 620),
    ...GAME_SHEET_IDS.flatMap(gameTabRequests),
  ];
}

export function teamSheetDefinition(teamName, seasonLabel) {
  return {
    properties: { title: `${teamName} Kickball Lineup` },
    sheets: [
      sheet(START_SHEET_ID, 'Start here', startRows(), 1),
      sheet(ROSTER_SHEET_ID, 'Roster', rosterRows(), 1),
      sheet(SCHEDULE_SHEET_ID, 'Schedule', scheduleRows(), 1),
      sheet(GAME_SHEET_ID, 'Game 1 Lineup', gameRows(), 0, 1),
      sheet(NEW_GAME_SHEET_ID, 'New game (copy me)', gameRows(true), 0, 1),
      sheet(POSITIONS_SHEET_ID, 'Positions', positionsRows(), 1),
      sheet(CONFIG_SHEET_ID, 'Team Config', configRows(teamName, seasonLabel), 1),
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
