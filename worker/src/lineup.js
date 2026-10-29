export function isCurrentLineupTab(tabName) {
  return tabName.endsWith('Lineup') && !tabName.toUpperCase().startsWith('OLD');
}

const END_OF_GRID_LABELS = ['Open spots', 'Acceptable'];
const RSVP_ANSWERS = ['yes', 'maybe', 'no'];
const RSVP_COLUMN_INDEX = 1;
const FIRST_INNING_COLUMN_INDEX = 2;

export function locateLineupGrid(tabName, rows) {
  const firstColumn = rows.map((row) => (row[0]?.text ?? '').trim());
  const headerRowIndex = firstColumn.indexOf('Name');
  const acceptableRowIndex = firstColumn.findIndex((label) => END_OF_GRID_LABELS.includes(label));
  const gameNumberRowIndex = firstColumn.indexOf('Game #:');
  const opponentRowIndex = firstColumn.indexOf('Opponent:');
  const dateRowIndex = firstColumn.indexOf('Date:');
  const timeRowIndex = firstColumn.indexOf('Time:');
  const locationRowIndex = firstColumn.indexOf('Location:');
  const notesRowIndex = firstColumn.indexOf('Notes:');
  const labelRowIndexes = [headerRowIndex, acceptableRowIndex, opponentRowIndex, dateRowIndex, timeRowIndex, locationRowIndex, notesRowIndex];
  if (labelRowIndexes.includes(-1)) {
    throw new Error(`Tab "${tabName}" needs "Date:", "Time:", "Location:", "Opponent:", "Notes:", "Name" and "Open spots" labels in column A`);
  }
  const headerCells = rows[headerRowIndex];
  const inningColumnIndexes = headerCells
    .map((cell, columnIndex) => (columnIndex >= FIRST_INNING_COLUMN_INDEX && /^\d+$/.test(cell.text.trim()) ? columnIndex : -1))
    .filter((columnIndex) => columnIndex !== -1);
  const usesRsvp = headerCells[RSVP_COLUMN_INDEX]?.text.trim().toLowerCase() === 'rsvp';
  return { headerRowIndex, acceptableRowIndex, gameNumberRowIndex, opponentRowIndex, dateRowIndex, timeRowIndex, locationRowIndex, notesRowIndex, inningColumnIndexes, usesRsvp };
}

export function readLineup(tabName, rows, today) {
  const grid = locateLineupGrid(tabName, rows);
  const { headerRowIndex, gameNumberRowIndex, opponentRowIndex, dateRowIndex, timeRowIndex, locationRowIndex, notesRowIndex, inningColumnIndexes } = grid;
  const textAt = (rowIndex, columnIndex) => (rows[rowIndex][columnIndex]?.text ?? '').trim();
  const gameNumber = gameNumberRowIndex === -1 ? null : parsedGameNumber(textAt(gameNumberRowIndex, 1));
  return {
    tabName,
    label: lineupLabel(tabName, gameNumber, textAt(dateRowIndex, 1)),
    gameNumber,
    played: isBeforeToday(rows[dateRowIndex][1]?.serialDate, today),
    opponent: rows[opponentRowIndex][1]?.text ?? '',
    date: textAt(dateRowIndex, 1),
    time: textAt(timeRowIndex, 1),
    location: textAt(locationRowIndex, 1),
    notes: textAt(notesRowIndex, 1),
    innings: inningColumnIndexes.map((columnIndex) => textAt(headerRowIndex, columnIndex)),
    players: readPlayers(tabName, rows, grid),
  };
}

function parsedGameNumber(cellText) {
  return /^\d+$/.test(cellText) ? Number(cellText) : null;
}

function lineupLabel(tabName, gameNumber, date) {
  if (gameNumber === null) return tabName.replace(/ Lineup$/, '');
  return date === '' ? `Game ${gameNumber}` : `Game ${gameNumber} (${date})`;
}

export function orderedLineups(lineups) {
  const firstTabByGameNumber = new Map();
  const problems = [];
  const distinctLineups = lineups.filter((lineup) => {
    if (lineup.gameNumber === null) return true;
    const firstTab = firstTabByGameNumber.get(lineup.gameNumber);
    if (firstTab === undefined) {
      firstTabByGameNumber.set(lineup.gameNumber, lineup.tabName);
      return true;
    }
    problems.push(`Tabs "${firstTab}" and "${lineup.tabName}" are both Game ${lineup.gameNumber}, so "${lineup.tabName}" is hidden. Captain: change the Game # on one of them`);
    return false;
  });
  if (distinctLineups.some((lineup) => lineup.gameNumber === null)) return { lineups: distinctLineups, problems };
  return { lineups: [...distinctLineups].sort((first, second) => first.gameNumber - second.gameNumber), problems };
}

function readPlayers(tabName, rows, grid) {
  const { headerRowIndex, acceptableRowIndex, inningColumnIndexes, usesRsvp } = grid;
  const playerRows = rows
    .slice(headerRowIndex + 1, acceptableRowIndex)
    .filter((row) => (row[0]?.text ?? '').trim() !== '');
  const kickNumberText = (row) => (row[1]?.text ?? '').trim();
  const usesKickNumbers = !usesRsvp && playerRows.some((row) => isKickNumber(kickNumberText(row)));
  const players = playerRows.map((row) => {
    const name = row[0].text.trim();
    const kickText = kickNumberText(row);
    if (usesRsvp) return readRsvpPlayer(tabName, row, name, inningColumnIndexes);
    if (usesKickNumbers && kickText !== '' && !isKickNumber(kickText)) {
      throw new Error(`Tab "${tabName}": the kick number for "${name}" in column B must be a whole number or blank`);
    }
    return {
      name,
      attending: usesKickNumbers ? isKickNumber(kickText) : row[0].strikethrough !== true,
      kickNumber: usesKickNumbers && isKickNumber(kickText) ? Number(kickText) : null,
      positions: inningColumnIndexes.map((columnIndex) => (row[columnIndex]?.text ?? '').trim()),
    };
  });
  if (!usesKickNumbers) return players;
  const kicking = players.filter((player) => player.attending).sort((first, second) => first.kickNumber - second.kickNumber);
  return kicking.concat(players.filter((player) => !player.attending));
}

function readRsvpPlayer(tabName, row, name, inningColumnIndexes) {
  const answer = (row[RSVP_COLUMN_INDEX]?.text ?? '').trim().toLowerCase();
  if (answer !== '' && !RSVP_ANSWERS.includes(answer)) {
    throw new Error(`Tab "${tabName}": the RSVP for "${name}" must be Yes, Maybe, No or blank`);
  }
  return {
    name,
    attending: answer !== 'no' && row[0].strikethrough !== true,
    kickNumber: null,
    positions: inningColumnIndexes.map((columnIndex) => (row[columnIndex]?.text ?? '').trim()),
  };
}

function isKickNumber(cellText) {
  return /^\d+$/.test(cellText.trim());
}

function isBeforeToday(serialDate, today) {
  if (typeof serialDate !== 'number') return false;
  const day = new Date(Date.UTC(1899, 11, 30) + Math.floor(serialDate) * 86400000).toISOString().slice(0, 10);
  return day < today;
}
