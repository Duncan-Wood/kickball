/** @OnlyCurrentDoc */

const API_VERSION = 1;
const PAGE_ADDRESS = 'https://duncan-wood.github.io/kickball/';
const CONFIG_TAB_NAME = 'Team Config';
const COMMENTS_TAB_NAME = 'Comments';
const ERRORS_TAB_NAME = 'Field View Problems';
const SHARE_LINK_LABEL = 'Share link';
const READ_CACHE_SECONDS = 5;
const CACHE_VALUE_MAXIMUM_LENGTH = 90000;
const ERROR_FIELD_MAXIMUM_LENGTH = 2000;
const ERROR_DUPLICATE_SECONDS = 600;
const BROWSER_ERRORS_PER_HOUR = 30;
const COMMENTS_PER_HOUR = 60;
const COMMENT_MAXIMUM_LENGTH = 1000;
const TEXT_SETTING_MAXIMUM_LENGTH = 60;
const ICON_MAXIMUM_LENGTH = 300;
const STRIPE_COLORS_MAXIMUM = 8;
const FONTS = ['Fredoka', 'Nunito', 'Poppins', 'Roboto', 'Lora'];
const REFRESH_SECONDS = ['5', '10', '30'];
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEPLOYMENT_LINK_PATTERN = /\/macros\/s\/([A-Za-z0-9_-]{20,})\/exec/;

const CONFIG_FIELDS = [
  { key: 'teamName', label: 'Team name', kind: 'text', defaultValue: 'My Team', startingValue: '', note: 'Leave blank to use the Team Name on the Team Details tab' },
  { key: 'seasonLabel', label: 'Season label', kind: 'text', defaultValue: 'Season', note: 'The tag beside the team name, like "Fall 2026"' },
  { key: 'icon', label: 'Icon', kind: 'icon', defaultValue: '🥎', note: 'One emoji, or a link starting with https:// to a small image' },
  { key: 'primaryColor', label: 'Primary color', kind: 'color', defaultValue: '#2b6cb0', note: 'Buttons, headings and highlights. Format: #RRGGBB' },
  { key: 'accentColor', label: 'Accent color', kind: 'color', defaultValue: '#ed8936', note: 'Small touches. Format: #RRGGBB' },
  { key: 'backgroundColor', label: 'Background color', kind: 'color', defaultValue: '#f7fafc', note: 'Page background. Format: #RRGGBB' },
  { key: 'grassColor', label: 'Field grass color', kind: 'color', defaultValue: '#5aa65a', note: 'The outfield. Format: #RRGGBB' },
  { key: 'dirtColor', label: 'Infield dirt color', kind: 'color', defaultValue: '#c9a27a', note: 'The infield. Format: #RRGGBB' },
  { key: 'font', label: 'Font', kind: 'font', defaultValue: 'Fredoka', note: 'Pick from the list' },
  { key: 'refreshSeconds', label: 'Refresh seconds', kind: 'refresh', defaultValue: '10', note: 'How often an open page checks the sheet for changes' },
  { key: 'suggestionBox', label: 'Suggestion box', kind: 'toggle', defaultValue: 'On', note: 'On shows the anonymous suggestion box, Off hides it' },
  { key: 'sheetHeaderColor', label: 'Sheet header color', kind: 'color', defaultValue: '#2b6cb0', note: 'Header row of every lineup tab, applied by Kickball > Apply colors to sheet' },
  { key: 'rowColorA', label: 'Row color A', kind: 'color', defaultValue: '#ffffff', note: 'Every other player row on lineup tabs' },
  { key: 'rowColorB', label: 'Row color B', kind: 'color', defaultValue: '#e8f0fa', note: 'The other rows on lineup tabs' },
  { key: 'stripeColors', label: 'Stripe colors', kind: 'colorList', optional: true, note: 'Optional. The stripe under the title: colors separated by commas, like #ff0000, #00ff00, #0000ff. Type none to hide it. Blank blends your primary and accent colors' },
  { key: 'textColor', label: 'Text color', kind: 'color', optional: true, note: 'Optional. Blank picks a dark shade of your primary color' },
  { key: 'mutedColor', label: 'Muted text color', kind: 'color', optional: true, note: 'Optional. Small gray-ish text. Blank picks one for you' },
  { key: 'borderColor', label: 'Border color', kind: 'color', optional: true, note: 'Optional. Outlines on buttons and the game picker. Blank picks one for you' },
  { key: 'tintColor', label: 'Highlight color', kind: 'color', optional: true, note: 'Optional. Backgrounds of the kicking order pills and table headings. Blank picks one for you' },
  { key: 'tagColor', label: 'Season tag color', kind: 'color', optional: true, note: 'Optional. Background of the season label next to the team name' },
  { key: 'tagTextColor', label: 'Season tag text color', kind: 'color', optional: true, note: 'Optional. Text color of the season label' },
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kickball')
    .addItem('Set up', 'setUp')
    .addItem('Save my share link', 'saveShareLink')
    .addItem('Apply colors to sheet', 'applyColorsToSheet')
    .addToUi();
}

function onEdit(event) {
  if (event.range.getSheet().getName() !== CONFIG_TAB_NAME) return;
  logFailures('onEdit', applyColorsToSheet);
}

function doGet(event) {
  return respondWithJson('doGet', () => {
    const requestedTab = event.parameter.tab;
    if (requestedTab !== undefined) {
      return { lineup: cachedJson(`lineup:${shortDigest(requestedTab)}`, () => lineupForTab(requestedTab)) };
    }
    return cachedJson('lineups', allLineups);
  });
}

function doPost(event) {
  return respondWithJson('doPost', () => {
    const request = JSON.parse(event.postData.contents);
    if (request.action === 'comment') return saveComment(request.tab, request.text);
    if (request.action === 'clientError') return saveBrowserError(request.source, request.message, request.details);
    throw new Error(`Unknown action "${request.action}"`);
  });
}

function respondWithJson(source, work) {
  let body;
  try {
    body = Object.assign({ ok: true, apiVersion: API_VERSION }, work());
  } catch (error) {
    recordErrorQuietly(source, error);
    body = { ok: false, apiVersion: API_VERSION, error: error.message };
  }
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function cachedJson(cacheKey, build) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached !== null) return JSON.parse(cached);
  const fresh = build();
  const serialized = JSON.stringify(fresh);
  if (serialized.length < CACHE_VALUE_MAXIMUM_LENGTH) cache.put(cacheKey, serialized, READ_CACHE_SECONDS);
  return fresh;
}

function allLineups() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return {
    config: readConfig(spreadsheet),
    activeTabName: spreadsheet.getActiveSheet().getName(),
    lineups: currentLineupSheets(spreadsheet).map(readLineup),
  };
}

function lineupForTab(tabName) {
  const sheet = currentLineupSheets(SpreadsheetApp.getActiveSpreadsheet()).find((candidate) => candidate.getName() === tabName);
  if (sheet === undefined) throw new Error(`Tab "${tabName}" is no longer a current lineup tab`);
  return readLineup(sheet);
}

function currentLineupSheets(spreadsheet) {
  return spreadsheet.getSheets().filter((sheet) => {
    const tabName = sheet.getName();
    return tabName.endsWith('Lineup') && !tabName.toUpperCase().startsWith('OLD');
  });
}

function shortDigest(text) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text));
}

function allowAction(actionName, maximumPerHour) {
  const cache = CacheService.getScriptCache();
  const counterKey = `rate:${actionName}`;
  const used = Number(cache.get(counterKey) || 0);
  if (used >= maximumPerHour) return false;
  cache.put(counterKey, String(used + 1), 3600);
  return true;
}

function readConfig(spreadsheet) {
  const configSheet = spreadsheet.getSheetByName(CONFIG_TAB_NAME);
  const enteredValues = configSheet === null ? {} : readEnteredSettings(configSheet);
  const config = {};
  CONFIG_FIELDS.forEach((field) => {
    const entered = enteredValues[field.label] || '';
    config[field.key] = entered === '' ? fallbackSetting(field, spreadsheet) : validatedSetting(field, entered, spreadsheet);
  });
  return config;
}

function readEnteredSettings(configSheet) {
  const entered = {};
  configSheet.getDataRange().getDisplayValues().slice(1).forEach((row) => {
    entered[row[0].trim()] = row[1].trim();
  });
  return entered;
}

function fallbackSetting(field, spreadsheet) {
  if (field.optional) return '';
  if (field.key === 'teamName') return teamNameFromTeamDetails(spreadsheet) || normalizedSetting(field, field.defaultValue);
  return normalizedSetting(field, field.defaultValue);
}

function teamNameFromTeamDetails(spreadsheet) {
  const detailsSheet = spreadsheet.getSheetByName('Team Details');
  if (detailsSheet === null) return '';
  const row = detailsSheet.getDataRange().getDisplayValues().find((cells) => cells[0].trim() === 'Team Name:');
  return row === undefined ? '' : row[1].trim().slice(0, TEXT_SETTING_MAXIMUM_LENGTH);
}

function validatedSetting(field, entered, spreadsheet) {
  const expectation = settingExpectation(field, entered);
  if (expectation === null) return normalizedSetting(field, entered);
  const replacement = fallbackSetting(field, spreadsheet);
  recordErrorQuietly('config', new Error(`"${field.label}" is "${entered}", which ${expectation}. Using the automatic value instead`));
  return replacement;
}

function settingExpectation(field, entered) {
  if (field.kind === 'color') return COLOR_PATTERN.test(entered) ? null : 'is not a color like #2b6cb0';
  if (field.kind === 'colorList') return stripeExpectation(entered);
  if (field.kind === 'font') return FONTS.includes(entered) ? null : `is not one of ${FONTS.join(', ')}`;
  if (field.kind === 'refresh') return REFRESH_SECONDS.includes(entered) ? null : `is not one of ${REFRESH_SECONDS.join(', ')}`;
  if (field.kind === 'toggle') return ['on', 'off'].includes(entered.toLowerCase()) ? null : 'is not On or Off';
  if (field.kind === 'icon') return entered.length <= ICON_MAXIMUM_LENGTH && (!/^https?:/i.test(entered) || /^https:\/\//i.test(entered)) ? null : 'is not an emoji or an https:// link';
  return entered.length <= TEXT_SETTING_MAXIMUM_LENGTH ? null : `is longer than ${TEXT_SETTING_MAXIMUM_LENGTH} characters`;
}

function stripeExpectation(entered) {
  if (entered.toLowerCase() === 'none') return null;
  const colors = splitColorList(entered);
  if (colors.length > STRIPE_COLORS_MAXIMUM) return `has more than ${STRIPE_COLORS_MAXIMUM} colors`;
  return colors.every((color) => COLOR_PATTERN.test(color)) ? null : 'is not a list of colors like #ff0000, #00ff00, or the word none';
}

function splitColorList(entered) {
  return entered.split(',').map((color) => color.trim().toLowerCase());
}

function normalizedSetting(field, value) {
  if (field.kind === 'colorList') return value === '' || value.toLowerCase() === 'none' ? value.toLowerCase() : splitColorList(value);
  if (field.kind === 'color') return value.toLowerCase();
  if (field.kind === 'refresh') return Number(value);
  if (field.kind === 'toggle') return value.toLowerCase() === 'on';
  return value;
}

function createConfigSheet(spreadsheet) {
  const configSheet = spreadsheet.insertSheet(CONFIG_TAB_NAME, 0);
  const header = [['Setting', 'Value', 'Notes', 'Preview']];
  configSheet.getRange(1, 1, 1, 4).setValues(header).setFontWeight('bold');
  const settingRows = CONFIG_FIELDS.map((field) => [field.label, startingCellValue(field), field.note, '']);
  configSheet.getRange(2, 1, settingRows.length, 4).setNumberFormat('@').setValues(settingRows);
  CONFIG_FIELDS.forEach((field, index) => addSettingValidation(configSheet.getRange(index + 2, 2), field, index + 2));
  const shareRow = CONFIG_FIELDS.length + 3;
  configSheet.getRange(shareRow, 1, 1, 3).setNumberFormat('@').setValues([[SHARE_LINK_LABEL, '', 'Filled in by Kickball > Save my share link']]);
  configSheet.setFrozenRows(1);
  configSheet.setColumnWidth(1, 160);
  configSheet.setColumnWidth(2, 160);
  configSheet.setColumnWidth(3, 460);
  paintSwatches(configSheet);
  return configSheet;
}

function startingCellValue(field) {
  if (field.startingValue !== undefined) return field.startingValue;
  return field.defaultValue === undefined ? '' : field.defaultValue;
}

function addSettingValidation(valueRange, field, rowNumber) {
  const builder = SpreadsheetApp.newDataValidation().setAllowInvalid(false);
  if (field.kind === 'color') builder.requireFormulaSatisfied(`=OR(B${rowNumber}="", REGEXMATCH(B${rowNumber}, "^#[0-9A-Fa-f]{6}$"))`);
  else if (field.kind === 'font') builder.requireValueInList(FONTS, true);
  else if (field.kind === 'refresh') builder.requireValueInList(REFRESH_SECONDS, true);
  else if (field.kind === 'toggle') builder.requireValueInList(['On', 'Off'], true);
  else return;
  valueRange.setDataValidation(builder.build());
}

function paintSwatches(configSheet) {
  configSheet.getDataRange().getDisplayValues().forEach((row, rowIndex) => {
    const field = CONFIG_FIELDS.find((candidate) => candidate.label === row[0].trim());
    if (field === undefined || field.kind !== 'color') return;
    const entered = row[1].trim();
    configSheet.getRange(rowIndex + 1, 4).setBackground(COLOR_PATTERN.test(entered) ? entered : null);
  });
}

function setUp() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (spreadsheet.getSheetByName(CONFIG_TAB_NAME) === null) createConfigSheet(spreadsheet);
  if (spreadsheet.getSheetByName(COMMENTS_TAB_NAME) === null) createCommentsSheet(spreadsheet);
  if (spreadsheet.getSheetByName(ERRORS_TAB_NAME) === null) createErrorsSheet(spreadsheet);
  const problems = [];
  currentLineupSheets(spreadsheet).forEach((sheet) => {
    try {
      readLineup(sheet);
    } catch (error) {
      problems.push(error.message);
    }
  });
  const message = problems.length === 0
    ? 'Set up is done. Next: Extensions > Apps Script > Deploy > New deployment > Deploy, then use Kickball > Save my share link.'
    : `Set up is done, but these tabs need fixing:\n\n${problems.join('\n\n')}`;
  SpreadsheetApp.getUi().alert(message);
}

function saveShareLink() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.prompt('Save my share link', 'Paste the "Web app URL" from the Deploy window (it ends in /exec):', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  const match = DEPLOYMENT_LINK_PATTERN.exec(answer.getResponseText().trim());
  if (match === null) {
    ui.alert('That does not look like a web app URL. It should look like https://script.google.com/macros/s/.../exec');
    return;
  }
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = spreadsheet.getSheetByName(CONFIG_TAB_NAME) || createConfigSheet(spreadsheet);
  const shareLink = `${PAGE_ADDRESS}?t=${match[1]}`;
  const labels = configSheet.getDataRange().getDisplayValues().map((row) => row[0].trim());
  const shareRowIndex = labels.indexOf(SHARE_LINK_LABEL);
  const shareRow = shareRowIndex === -1 ? configSheet.getLastRow() + 2 : shareRowIndex + 1;
  configSheet.getRange(shareRow, 1, 1, 3).setNumberFormat('@').setValues([[SHARE_LINK_LABEL, shareLink, 'Filled in by Kickball > Save my share link']]);
  ui.alert(`Your share link is saved on the ${CONFIG_TAB_NAME} tab:\n\n${shareLink}`);
}

function applyColorsToSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const config = readConfig(spreadsheet);
  currentLineupSheets(spreadsheet).forEach((sheet) => paintLineupSheet(sheet, config));
  const configSheet = spreadsheet.getSheetByName(CONFIG_TAB_NAME);
  if (configSheet !== null) paintSwatches(configSheet);
  spreadsheet.toast('Colors applied to the lineup tabs');
}

function paintLineupSheet(sheet, config) {
  const rows = sheet.getDataRange().getDisplayValues();
  const { headerRowIndex, acceptableRowIndex, notesRowIndex } = locateLineupGrid(sheet, rows);
  const columnCount = rows[headerRowIndex].length;
  const detailsLabels = sheet.getRange(1, 1, notesRowIndex + 1, 1);
  detailsLabels.setBackground(config.sheetHeaderColor).setFontColor(readableTextColor(config.sheetHeaderColor));
  for (let rowIndex = 0; rowIndex <= notesRowIndex; rowIndex += 1) {
    sheet.getRange(rowIndex + 1, 2, 1, 3).setBackground(rowIndex % 2 === 0 ? config.rowColorB : config.rowColorA);
  }
  sheet.getRange(headerRowIndex + 1, 1, 1, columnCount)
    .setBackground(config.sheetHeaderColor)
    .setFontColor(readableTextColor(config.sheetHeaderColor));
  const playerRowCount = acceptableRowIndex - headerRowIndex - 1;
  if (playerRowCount < 1) return;
  const playerRange = sheet.getRange(headerRowIndex + 2, 1, playerRowCount, columnCount);
  playerRange.setBackground(null);
  const existingBandings = sheet.getBandings();
  const bandings = existingBandings.length > 0 ? existingBandings : [playerRange.applyRowBanding()];
  bandings.forEach((banding) => banding.setFirstRowColor(config.rowColorA).setSecondRowColor(config.rowColorB));
}

function readableTextColor(backgroundColor) {
  const channel = (start) => parseInt(backgroundColor.slice(start, start + 2), 16);
  const brightness = (channel(1) * 299 + channel(3) * 587 + channel(5) * 114) / 1000;
  return brightness > 150 ? '#000000' : '#ffffff';
}

function logFailures(source, work) {
  try {
    return work();
  } catch (error) {
    recordErrorQuietly(source, error);
    throw error;
  }
}

function recordErrorQuietly(source, error) {
  try {
    recordError(source, error.message, error.stack);
  } catch (loggingError) {
    console.error('Could not record error on the Field View Problems tab', loggingError);
  }
}

function saveBrowserError(source, message, details) {
  if (!allowAction('browser-errors', BROWSER_ERRORS_PER_HOUR)) throw new Error('Too many browser error reports this hour');
  recordError(`browser: ${source}`, message, details);
  return {};
}

function recordError(source, message, details) {
  const cache = CacheService.getScriptCache();
  const duplicateKey = `error:${shortDigest(`${source}|${message}`)}`;
  if (cache.get(duplicateKey) !== null) return;
  cache.put(duplicateKey, '1', ERROR_DUPLICATE_SECONDS);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const clip = (value) => String(value === undefined || value === null ? '' : value).slice(0, ERROR_FIELD_MAXIMUM_LENGTH);
  const occurredAt = Utilities.formatDate(new Date(), spreadsheet.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  appendTextRow(spreadsheet, ERRORS_TAB_NAME, createErrorsSheet, [occurredAt, clip(source), clip(message), clip(details)]);
}

function createErrorsSheet(spreadsheet) {
  const errorsSheet = spreadsheet.insertSheet(ERRORS_TAB_NAME);
  errorsSheet.getRange(1, 1, 1, 4).setValues([['Time', 'Where', 'Message', 'Details']]).setFontWeight('bold');
  errorsSheet.setFrozenRows(1);
  return errorsSheet;
}

function saveComment(tabName, commentText) {
  if (!readConfig(SpreadsheetApp.getActiveSpreadsheet()).suggestionBox) throw new Error('The suggestion box is turned off');
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!currentLineupSheets(spreadsheet).some((sheet) => sheet.getName() === tabName)) {
    throw new Error(`Tab "${tabName}" is no longer a current lineup tab`);
  }
  const trimmedComment = String(commentText).trim();
  if (trimmedComment === '') throw new Error('Comment is empty');
  if (trimmedComment.length > COMMENT_MAXIMUM_LENGTH) throw new Error(`Comment is longer than ${COMMENT_MAXIMUM_LENGTH} characters`);
  if (!allowAction('comments', COMMENTS_PER_HOUR)) throw new Error('Too many suggestions this hour, try again later');
  appendTextRow(spreadsheet, COMMENTS_TAB_NAME, createCommentsSheet, [new Date().toISOString(), tabName.replace(/ Lineup$/, ''), trimmedComment]);
  return {};
}

function createCommentsSheet(spreadsheet) {
  const commentsSheet = spreadsheet.insertSheet(COMMENTS_TAB_NAME);
  commentsSheet.getRange(1, 1, 1, 3).setValues([['Submitted', 'Game', 'Comment']]).setFontWeight('bold');
  commentsSheet.setFrozenRows(1);
  return commentsSheet;
}

function appendTextRow(spreadsheet, tabName, createSheet, values) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const targetSheet = spreadsheet.getSheetByName(tabName) || createSheet(spreadsheet);
    const newRowRange = targetSheet.getRange(targetSheet.getLastRow() + 1, 1, 1, values.length);
    newRowRange.setNumberFormat('@');
    newRowRange.setValues([values]);
  } finally {
    lock.releaseLock();
  }
}

function locateLineupGrid(sheet, rows) {
  const firstColumn = rows.map((row) => row[0].trim());
  const headerRowIndex = firstColumn.indexOf('Name');
  const acceptableRowIndex = firstColumn.indexOf('Acceptable');
  const opponentRowIndex = firstColumn.indexOf('Opponent:');
  const dateRowIndex = firstColumn.indexOf('Date:');
  const timeRowIndex = firstColumn.indexOf('Time:');
  const locationRowIndex = firstColumn.indexOf('Location:');
  const notesRowIndex = firstColumn.indexOf('Notes:');
  const labelRowIndexes = [headerRowIndex, acceptableRowIndex, opponentRowIndex, dateRowIndex, timeRowIndex, locationRowIndex, notesRowIndex];
  if (labelRowIndexes.includes(-1)) {
    throw new Error(`Tab "${sheet.getName()}" needs "Date:", "Time:", "Location:", "Opponent:", "Notes:", "Name" and "Acceptable" labels in column A`);
  }
  const inningColumnIndexes = rows[headerRowIndex]
    .map((cell, columnIndex) => (columnIndex >= 2 && cell.trim() !== '' ? columnIndex : -1))
    .filter((columnIndex) => columnIndex !== -1);
  return { headerRowIndex, acceptableRowIndex, opponentRowIndex, dateRowIndex, timeRowIndex, locationRowIndex, notesRowIndex, inningColumnIndexes };
}

function readLineup(sheet) {
  const rows = sheet.getDataRange().getDisplayValues();
  const grid = locateLineupGrid(sheet, rows);
  const { headerRowIndex, acceptableRowIndex, opponentRowIndex, dateRowIndex, inningColumnIndexes } = grid;
  const headerRow = rows[headerRowIndex];
  const fontLines = sheet.getDataRange().getFontLines();
  const players = readPlayers(sheet, rows, fontLines, grid);
  return {
    tabName: sheet.getName(),
    played: isBeforeToday(sheet.getRange(dateRowIndex + 1, 2).getValue()),
    opponent: rows[opponentRowIndex][1],
    date: rows[dateRowIndex][1].trim(),
    time: rows[grid.timeRowIndex][1].trim(),
    location: rows[grid.locationRowIndex][1].trim(),
    notes: rows[grid.notesRowIndex][1].trim(),
    innings: inningColumnIndexes.map((columnIndex) => headerRow[columnIndex].trim()),
    players,
  };
}

function readPlayers(sheet, rows, fontLines, grid) {
  const { headerRowIndex, acceptableRowIndex, inningColumnIndexes } = grid;
  const playerRows = rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .slice(headerRowIndex + 1, acceptableRowIndex)
    .filter(({ row }) => row[0].trim() !== '');
  const usesKickNumbers = playerRows.some(({ row }) => isKickNumber(row[1]));
  const players = playerRows.map(({ row, rowIndex }) => {
    const name = row[0].trim();
    if (usesKickNumbers && row[1].trim() !== '' && !isKickNumber(row[1])) {
      throw new Error(`Tab "${sheet.getName()}": the kick number for "${name}" in column B must be a whole number or blank`);
    }
    return {
      name,
      attending: usesKickNumbers ? isKickNumber(row[1]) : fontLines[rowIndex][0] !== 'line-through',
      kickNumber: usesKickNumbers && isKickNumber(row[1]) ? Number(row[1].trim()) : null,
      positions: inningColumnIndexes.map((columnIndex) => row[columnIndex].trim()),
    };
  });
  if (!usesKickNumbers) return players;
  const kicking = players.filter((player) => player.attending).sort((first, second) => first.kickNumber - second.kickNumber);
  return kicking.concat(players.filter((player) => !player.attending));
}

function isKickNumber(cellText) {
  return /^\d+$/.test(cellText.trim());
}

function isBeforeToday(gameDate) {
  if (!(gameDate instanceof Date)) return false;
  const timeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const day = (date) => Utilities.formatDate(date, timeZone, 'yyyy-MM-dd');
  return day(gameDate) < day(new Date());
}
