function onOpen() {
  SpreadsheetApp.getUi().createMenu('Kickball').addItem('Field view', 'showFieldView').addToUi();
}

function showFieldView() {
  SpreadsheetApp.getUi().showModelessDialog(fieldPage().setWidth(480).setHeight(770), 'Field view');
}

function fieldPage() {
  const template = HtmlService.createTemplateFromFile('Field');
  template.teamName = scriptProperty('TEAM_NAME');
  template.seasonLabel = scriptProperty('SEASON_LABEL');
  return template.evaluate();
}

function scriptProperty(propertyName) {
  const value = PropertiesService.getScriptProperties().getProperty(propertyName);
  if (value === null) throw new Error(`Script property "${propertyName}" is not set`);
  return value;
}

function doGet() {
  return fieldPage()
    .setTitle(scriptProperty('TEAM_NAME'))
    .setFaviconUrl('https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/1f34b-200d-1f7e9.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function currentLineupSheets(spreadsheet) {
  return spreadsheet.getSheets().filter((sheet) => {
    const tabName = sheet.getName();
    return tabName.endsWith('Lineup') && !tabName.toUpperCase().startsWith('OLD');
  });
}

function getLineups() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return {
    activeTabName: spreadsheet.getActiveSheet().getName(),
    lineups: currentLineupSheets(spreadsheet).map(readLineup),
  };
}

function getLineup(tabName) {
  const sheet = currentLineupSheets(SpreadsheetApp.getActiveSpreadsheet()).find((candidate) => candidate.getName() === tabName);
  if (sheet === undefined) throw new Error(`Tab "${tabName}" is no longer a current lineup tab`);
  return readLineup(sheet);
}

const COMMENTS_TAB_NAME = 'Comments';
const COMMENT_MAXIMUM_LENGTH = 1000;

function submitComment(tabName, commentText) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!currentLineupSheets(spreadsheet).some((sheet) => sheet.getName() === tabName)) {
    throw new Error(`Tab "${tabName}" is no longer a current lineup tab`);
  }
  const trimmedComment = String(commentText).trim();
  if (trimmedComment === '') throw new Error('Comment is empty');
  if (trimmedComment.length > COMMENT_MAXIMUM_LENGTH) throw new Error(`Comment is longer than ${COMMENT_MAXIMUM_LENGTH} characters`);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const commentsSheet = spreadsheet.getSheetByName(COMMENTS_TAB_NAME) || createCommentsSheet(spreadsheet);
    const newRow = commentsSheet.getLastRow() + 1;
    const newRowRange = commentsSheet.getRange(newRow, 1, 1, 3);
    newRowRange.setNumberFormat('@');
    newRowRange.setValues([[new Date().toISOString(), tabName.replace(/ Lineup$/, ''), trimmedComment]]);
  } finally {
    lock.releaseLock();
  }
}

function createCommentsSheet(spreadsheet) {
  const commentsSheet = spreadsheet.insertSheet(COMMENTS_TAB_NAME);
  commentsSheet.getRange(1, 1, 1, 3).setValues([['Submitted', 'Game', 'Comment']]).setFontWeight('bold');
  commentsSheet.setFrozenRows(1);
  return commentsSheet;
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
  const players = rows
    .map((row, rowIndex) => ({
      name: row[0].trim(),
      attending: fontLines[rowIndex][0] !== 'line-through',
      positions: inningColumnIndexes.map((columnIndex) => row[columnIndex].trim()),
    }))
    .slice(headerRowIndex + 1, acceptableRowIndex)
    .filter((player) => player.name !== '');
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

function isBeforeToday(gameDate) {
  if (!(gameDate instanceof Date)) return false;
  const timeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const day = (date) => Utilities.formatDate(date, timeZone, 'yyyy-MM-dd');
  return day(gameDate) < day(new Date());
}
