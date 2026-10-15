/** @OnlyCurrentDoc */

const API_VERSION = 2;
const PAGE_ADDRESS = 'https://duncan-wood.github.io/kickball/';
const CONFIG_TAB_NAME = 'Team Config';
const COMMENTS_TAB_NAME = 'Comments';
const SHARE_LINK_LABEL = 'Share link';
const READ_CACHE_SECONDS = 5;
const CACHE_VALUE_MAXIMUM_LENGTH = 90000;
const COMMENTS_PER_HOUR = 60;
const COMMENT_MAXIMUM_LENGTH = 1000;
const TEXT_SETTING_MAXIMUM_LENGTH = 60;
const ICON_MAXIMUM_LENGTH = 300;
const PLAIN_ROW_COLOR = '#ffffff';
const STRIPE_STYLES = ['Blend', 'Rainbow'];
const RAINBOW_STRIPE_COLORS = ['#ff9aa2', '#ffc48c', '#ffe98a', '#a8e0a0', '#9cc4f0', '#c9a8e8'];
const FONTS = ['Fredoka', 'Nunito', 'Poppins', 'Roboto', 'Lora'];
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEPLOYMENT_LINK_PATTERN = /\/macros\/s\/([A-Za-z0-9_-]{20,})\/exec/;

const CONFIG_FIELDS = [
  { key: 'teamName', label: 'Team name', kind: 'text', defaultValue: 'My Team', note: 'The heading on the page' },
  { key: 'seasonLabel', label: 'Season label', kind: 'text', defaultValue: 'Season', note: 'The tag beside the team name, like "Fall 2026"' },
  { key: 'icon', label: 'Icon', kind: 'icon', defaultValue: '🥎', note: 'One emoji, or a link starting with https:// to a small image' },
  { key: 'mainColor', label: 'Main color', kind: 'color', defaultValue: '#2b6cb0', note: 'Buttons, headings, text and the header of every lineup tab' },
  { key: 'secondColor', label: 'Second color', kind: 'color', defaultValue: '#ed8936', note: 'Page background, highlights, borders and alternate rows on lineup tabs' },
  { key: 'stripeStyle', label: 'Stripe', kind: 'stripe', defaultValue: 'Blend', note: 'Blend fades from main to second color, Rainbow shows six pastel bands' },
  { key: 'font', label: 'Font', kind: 'font', defaultValue: 'Fredoka', note: 'Pick from the list' },
  { key: 'suggestionBox', label: 'Suggestion box', kind: 'toggle', defaultValue: 'On', note: 'On shows the anonymous suggestion box, Off hides it' },
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kickball')
    .addItem('Field view', 'showFieldView')
    .addSeparator()
    .addItem('Set up', 'setUp')
    .addItem('Save my share link', 'saveShareLink')
    .addItem('Apply colors to sheet', 'applyColorsToSheet')
    .addToUi();
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
    throw new Error(`Unknown action "${request.action}"`);
  });
}

function respondWithJson(source, work) {
  let body;
  try {
    body = Object.assign({ ok: true, apiVersion: API_VERSION }, work());
  } catch (error) {
    console.error(source, error);
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
    config[field.key] = entered === '' ? normalizedSetting(field, field.defaultValue) : validatedSetting(field, entered);
  });
  config.theme = themeFromColors(config.mainColor, config.secondColor, config.stripeStyle);
  delete config.mainColor;
  delete config.secondColor;
  delete config.stripeStyle;
  return config;
}

function themeFromColors(mainColor, secondColor, stripeStyle) {
  const mutedColor = blendedColor([[mainColor, 0.28]], '#6b6b6b');
  return {
    primary: mainColor,
    accent: secondColor,
    background: blendedColor([[secondColor, 0.12]]),
    ink: blendedColor([[mainColor, 0.22]], '#111111'),
    muted: mutedColor,
    border: blendedColor([[mainColor, 0.15], [secondColor, 0.35]]),
    borderSoft: blendedColor([[mainColor, 0.05], [secondColor, 0.25]]),
    tint: blendedColor([[secondColor, 0.35]]),
    faint: blendedColor([[mutedColor, 0.45]]),
    tagBackground: blendedColor([[secondColor, 0.3]]),
    tagText: blendedColor([[secondColor, 0.55]], '#000000'),
    stripe: stripeStyle === 'Rainbow'
      ? { colors: RAINBOW_STRIPE_COLORS, smooth: false }
      : { colors: [mainColor, secondColor], smooth: true },
  };
}

function blendedColor(colorShares, baseColor = '#ffffff') {
  const channel = (color, start) => parseInt(color.slice(start, start + 2), 16);
  const baseShare = 1 - colorShares.reduce((total, [, share]) => total + share, 0);
  const channels = [1, 3, 5].map((start) => {
    const blended = colorShares.reduce((total, [color, share]) => total + channel(color, start) * share, channel(baseColor, start) * baseShare);
    return Math.round(blended).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

function readEnteredSettings(configSheet) {
  const entered = {};
  const range = configSheet.getDataRange();
  const texts = range.getDisplayValues();
  const fills = range.getBackgrounds();
  texts.slice(1).forEach((row, index) => {
    const label = row[0].trim();
    const field = CONFIG_FIELDS.find((candidate) => candidate.label === label);
    const fill = fills[index + 1][1];
    entered[label] = field !== undefined && field.kind === 'color' ? fill : row[1].trim();
  });
  return entered;
}

function validatedSetting(field, entered) {
  const expectation = settingExpectation(field, entered);
  if (expectation === null) return normalizedSetting(field, entered);
  throw new Error(`"${field.label}" is "${entered}", which ${expectation}. Fix it on the ${CONFIG_TAB_NAME} tab`);
}

function settingExpectation(field, entered) {
  if (field.kind === 'color') return COLOR_PATTERN.test(entered) ? null : 'is not a color like #2b6cb0';
  if (field.kind === 'stripe') return STRIPE_STYLES.includes(entered) ? null : `is not one of ${STRIPE_STYLES.join(', ')}`;
  if (field.kind === 'font') return FONTS.includes(entered) ? null : `is not one of ${FONTS.join(', ')}`;
  if (field.kind === 'toggle') return ['on', 'off'].includes(entered.toLowerCase()) ? null : 'is not On or Off';
  if (field.kind === 'icon') return entered.length <= ICON_MAXIMUM_LENGTH && (!/^https?:/i.test(entered) || /^https:\/\//i.test(entered)) ? null : 'is not an emoji or an https:// link';
  return entered.length <= TEXT_SETTING_MAXIMUM_LENGTH ? null : `is longer than ${TEXT_SETTING_MAXIMUM_LENGTH} characters`;
}

function normalizedSetting(field, value) {
  if (field.kind === 'color') return value.toLowerCase();
  if (field.kind === 'toggle') return value.toLowerCase() === 'on';
  return value;
}

function createConfigSheet(spreadsheet) {
  const configSheet = spreadsheet.insertSheet(CONFIG_TAB_NAME, 0);
  const header = [['Setting', 'Value', 'Notes (for colors: click the box, then the paint bucket in the toolbar)']];
  configSheet.getRange(1, 1, 1, 3).setValues(header).setFontWeight('bold');
  const settingRows = CONFIG_FIELDS.map((field) => [field.label, startingCellValue(field), field.note]);
  configSheet.getRange(2, 1, settingRows.length, 3).setNumberFormat('@').setValues(settingRows);
  CONFIG_FIELDS.forEach((field, index) => {
    const valueRange = configSheet.getRange(index + 2, 2);
    addSettingValidation(valueRange, field);
    if (field.kind === 'color') valueRange.setBackground(field.defaultValue);
  });
  configSheet.getRange(2, 2, CONFIG_FIELDS.length, 1).setBorder(true, true, true, true, true, true, '#b7b7b7', SpreadsheetApp.BorderStyle.SOLID);
  const shareRow = CONFIG_FIELDS.length + 3;
  configSheet.getRange(shareRow, 1, 1, 3).setNumberFormat('@').setValues([[SHARE_LINK_LABEL, '', 'Filled in by Kickball > Save my share link']]);
  configSheet.setFrozenRows(1);
  configSheet.setColumnWidth(1, 160);
  configSheet.setColumnWidth(2, 160);
  configSheet.setColumnWidth(3, 460);
  return configSheet;
}

function startingCellValue(field) {
  return field.kind === 'color' ? '' : field.defaultValue;
}

function addSettingValidation(valueRange, field) {
  const builder = SpreadsheetApp.newDataValidation().setAllowInvalid(false);
  if (field.kind === 'font') builder.requireValueInList(FONTS, true);
  else if (field.kind === 'stripe') builder.requireValueInList(STRIPE_STYLES, true);
  else if (field.kind === 'toggle') builder.requireValueInList(['On', 'Off'], true);
  else return;
  valueRange.setDataValidation(builder.build());
}

function setUp() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (spreadsheet.getSheetByName(CONFIG_TAB_NAME) === null) createConfigSheet(spreadsheet);
  if (spreadsheet.getSheetByName(COMMENTS_TAB_NAME) === null) createCommentsSheet(spreadsheet);
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

function showFieldView() {
  const ui = SpreadsheetApp.getUi();
  const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_TAB_NAME);
  const rows = configSheet === null ? [] : configSheet.getDataRange().getDisplayValues();
  const shareRow = rows.find((row) => row[0].trim() === SHARE_LINK_LABEL);
  const shareLink = shareRow === undefined ? '' : shareRow[1].trim();
  const deploymentId = shareLink.startsWith(`${PAGE_ADDRESS}?t=`) ? shareLink.slice(PAGE_ADDRESS.length + 3) : '';
  if (!/^[A-Za-z0-9_-]{20,}$/.test(deploymentId)) {
    ui.alert('Field view needs your share link first. Deploy the web app, then use Kickball > Save my share link.');
    return;
  }
  const page = HtmlService.createHtmlOutput(
    `<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe src="${shareLink}"></iframe>`
  );
  ui.showModelessDialog(page.setWidth(480).setHeight(770), 'Field view');
}

function applyColorsToSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const config = readConfig(spreadsheet);
  currentLineupSheets(spreadsheet).forEach((sheet) => paintLineupSheet(sheet, config));
  spreadsheet.toast('Colors applied to the lineup tabs');
}

function paintLineupSheet(sheet, config) {
  const rows = sheet.getDataRange().getDisplayValues();
  const { headerRowIndex, acceptableRowIndex, notesRowIndex } = locateLineupGrid(sheet, rows);
  const columnCount = rows[headerRowIndex].length;
  const detailsLabels = sheet.getRange(1, 1, notesRowIndex + 1, 1);
  const { primary, tint } = config.theme;
  detailsLabels.setBackground(primary).setFontColor(readableTextColor(primary));
  for (let rowIndex = 0; rowIndex <= notesRowIndex; rowIndex += 1) {
    sheet.getRange(rowIndex + 1, 2, 1, 3).setBackground(rowIndex % 2 === 0 ? tint : PLAIN_ROW_COLOR);
  }
  sheet.getRange(headerRowIndex + 1, 1, 1, columnCount)
    .setBackground(primary)
    .setFontColor(readableTextColor(primary));
  const playerRowCount = acceptableRowIndex - headerRowIndex - 1;
  if (playerRowCount < 1) return;
  const playerRange = sheet.getRange(headerRowIndex + 2, 1, playerRowCount, columnCount);
  playerRange.setBackground(null);
  const existingBandings = sheet.getBandings();
  const bandings = existingBandings.length > 0 ? existingBandings : [playerRange.applyRowBanding()];
  bandings.forEach((banding) => banding.setFirstRowColor(PLAIN_ROW_COLOR).setSecondRowColor(tint));
}

function readableTextColor(backgroundColor) {
  const channel = (start) => parseInt(backgroundColor.slice(start, start + 2), 16);
  const brightness = (channel(1) * 299 + channel(3) * 587 + channel(5) * 114) / 1000;
  return brightness > 150 ? '#000000' : '#ffffff';
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
