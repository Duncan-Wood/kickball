import { describeResult, resultFromText } from '../../site/result.js';

export function isCurrentLineupTab(tabName) {
  return /lineup$/i.test(tabName);
}

const END_OF_GRID_LABEL = 'Open spots';
const RSVP_ANSWERS = ['yes', 'maybe', 'no'];
const RSVP_COLUMN_INDEX = 1;
const FIRST_INNING_COLUMN_INDEX = 2;

export function locateLineupGrid(tabName, rows) {
  const firstColumn = rows.map((row) => (row[0]?.text ?? '').trim());
  const headerRowIndex = firstColumn.indexOf('Name');
  const openSpotsRowIndex = firstColumn.indexOf(END_OF_GRID_LABEL);
  const gameNumberRowIndex = firstColumn.indexOf('Game #:');
  const opponentRowIndex = firstColumn.indexOf('Opponent:');
  const dateRowIndex = firstColumn.indexOf('Date:');
  const timeRowIndex = firstColumn.indexOf('Time:');
  const locationRowIndex = firstColumn.indexOf('Location:');
  const labelRowIndex = firstColumn.indexOf('Label:');
  const resultRowIndex = firstColumn.indexOf('Result:');
  if (headerRowIndex === -1 || openSpotsRowIndex === -1) {
    throw new Error(`Tab "${tabName}" needs "Name" and "Open spots" labels in column A`);
  }
  const headerCells = rows[headerRowIndex];
  const inningColumnIndexes = headerCells
    .map((cell, columnIndex) => (columnIndex >= FIRST_INNING_COLUMN_INDEX && /^\d+$/.test(cell.text.trim()) ? columnIndex : -1))
    .filter((columnIndex) => columnIndex !== -1);
  if (headerCells[RSVP_COLUMN_INDEX]?.text.trim().toLowerCase() !== 'rsvp') {
    throw new Error(`Tab "${tabName}" needs "RSVP" beside "Name" in column B`);
  }
  return { headerRowIndex, openSpotsRowIndex, gameNumberRowIndex, opponentRowIndex, dateRowIndex, timeRowIndex, locationRowIndex, labelRowIndex, resultRowIndex, inningColumnIndexes };
}

export function readLineup(tabName, rows) {
  const grid = locateLineupGrid(tabName, rows);
  const { headerRowIndex, gameNumberRowIndex, opponentRowIndex, dateRowIndex, timeRowIndex, locationRowIndex, labelRowIndex, resultRowIndex, inningColumnIndexes } = grid;
  const textAt = (rowIndex, columnIndex) => (rows[rowIndex]?.[columnIndex]?.text ?? '').trim();
  const players = readPlayers(tabName, rows, grid);
  const gameId = gameNumberRowIndex === -1 ? '' : textAt(gameNumberRowIndex, 1);
  const gameNumber = parsedGameNumber(gameId);
  const resultText = textAt(resultRowIndex, 1);
  const parsedResult = resultFromText(resultText);
  return {
    tabName,
    label: lineupLabel(tabName, gameId, textAt(dateRowIndex, 1), textAt(labelRowIndex, 1)),
    gameId,
    gameNumber,
    played: parsedResult !== null,
    result: parsedResult === null ? null : { ...parsedResult, text: describeResult(parsedResult) },
    isoDate: isoDateOf(rows[dateRowIndex]?.[1]?.serialDate),
    opponent: textAt(opponentRowIndex, 1),
    date: textAt(dateRowIndex, 1),
    time: textAt(timeRowIndex, 1),
    location: textAt(locationRowIndex, 1),
    resultText,
    innings: inningColumnIndexes.map((columnIndex) => textAt(headerRowIndex, columnIndex)),
    inningColumns: inningColumnIndexes,
    spareRows: spareRows(rows, grid),
    players,
  };
}

function parsedGameNumber(cellText) {
  return /^\d+$/.test(cellText) ? Number(cellText) : null;
}

function lineupLabel(tabName, gameId, date, enteredLabel) {
  if (enteredLabel !== '') return enteredLabel;
  if (gameId === '') return tabName.replace(/ Lineup$/i, '');
  return date === '' ? `Game ${gameId}` : `Game ${gameId} (${date})`;
}

export function archivedGameIds(scheduleRows) {
  const header = (scheduleRows[0] ?? []).map((cell) => cell.text.trim().toLowerCase());
  const archivedColumn = header.indexOf('archived');
  if (archivedColumn === -1) return new Set();
  return new Set(scheduleRows.slice(1)
    .filter((row) => (row[archivedColumn]?.text ?? '').trim().toLowerCase() === 'yes')
    .map((row) => (row[0]?.text ?? '').trim())
    .filter((gameId) => gameId !== ''));
}

export function orderedLineups(lineups) {
  const firstTabByGameId = new Map();
  const problems = [];
  const distinctLineups = lineups.filter((lineup) => {
    if (lineup.gameId === '') return true;
    const firstTab = firstTabByGameId.get(lineup.gameId);
    if (firstTab === undefined) {
      firstTabByGameId.set(lineup.gameId, lineup.tabName);
      return true;
    }
    problems.push(`Tabs "${firstTab}" and "${lineup.tabName}" are both Game ${lineup.gameId}, so "${lineup.tabName}" is hidden. Captain: change the Game # on one of them`);
    return false;
  });
  if (distinctLineups.some((lineup) => lineup.gameNumber === null)) return { lineups: distinctLineups, problems };
  return { lineups: [...distinctLineups].sort((first, second) => first.gameNumber - second.gameNumber), problems };
}

function spareRows(rows, { headerRowIndex, openSpotsRowIndex }) {
  return rows
    .slice(headerRowIndex + 1, openSpotsRowIndex)
    .map((row, offset) => ({ row, sheetRow: headerRowIndex + 2 + offset }))
    .filter(({ row }) => (row[0]?.text ?? '').trim() === '')
    .map(({ sheetRow }) => sheetRow);
}

function readPlayers(tabName, rows, { headerRowIndex, openSpotsRowIndex, inningColumnIndexes }) {
  return rows
    .slice(headerRowIndex + 1, openSpotsRowIndex)
    .map((row, offset) => ({ row, sheetRow: headerRowIndex + 2 + offset }))
    .filter(({ row }) => (row[0]?.text ?? '').trim() !== '')
    .map(({ row, sheetRow }) => {
      const name = row[0].text.trim();
      const answer = (row[RSVP_COLUMN_INDEX]?.text ?? '').trim().toLowerCase();
      if (answer !== '' && !RSVP_ANSWERS.includes(answer)) {
        throw new Error(`Tab "${tabName}": the RSVP for "${name}" must be Yes, Maybe, No or blank`);
      }
      return {
        name,
        sheetRow,
        attending: answer !== 'no',
        rsvp: answer,
        positions: inningColumnIndexes.map((columnIndex) => (row[columnIndex]?.text ?? '').trim()),
      };
    });
}

function isoDateOf(serialDate) {
  if (typeof serialDate !== 'number') return '';
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serialDate) * 86400000).toISOString().slice(0, 10);
}

const playedRank = (lineup) => (lineup.played ? 1 : 0);

export function defaultLineupTabName(lineups, today) {
  const dated = lineups.filter((lineup) => lineup.isoDate !== '');
  const upcoming = dated.filter((lineup) => lineup.isoDate >= today).sort((first, second) => first.isoDate.localeCompare(second.isoDate) || playedRank(first) - playedRank(second));
  if (upcoming.length > 0) return upcoming[0].tabName;
  const latestFirst = [...dated].reverse().sort((first, second) => second.isoDate.localeCompare(first.isoDate) || playedRank(first) - playedRank(second));
  return latestFirst.length > 0 ? latestFirst[0].tabName : undefined;
}
