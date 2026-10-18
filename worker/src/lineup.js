export function isCurrentLineupTab(tabName) {
  return tabName.endsWith('Lineup') && !tabName.toUpperCase().startsWith('OLD');
}

export function locateLineupGrid(tabName, rows) {
  const firstColumn = rows.map((row) => (row[0]?.text ?? '').trim());
  const headerRowIndex = firstColumn.indexOf('Name');
  const acceptableRowIndex = firstColumn.indexOf('Acceptable');
  const opponentRowIndex = firstColumn.indexOf('Opponent:');
  const dateRowIndex = firstColumn.indexOf('Date:');
  const timeRowIndex = firstColumn.indexOf('Time:');
  const locationRowIndex = firstColumn.indexOf('Location:');
  const notesRowIndex = firstColumn.indexOf('Notes:');
  const labelRowIndexes = [headerRowIndex, acceptableRowIndex, opponentRowIndex, dateRowIndex, timeRowIndex, locationRowIndex, notesRowIndex];
  if (labelRowIndexes.includes(-1)) {
    throw new Error(`Tab "${tabName}" needs "Date:", "Time:", "Location:", "Opponent:", "Notes:", "Name" and "Acceptable" labels in column A`);
  }
  const inningColumnIndexes = rows[headerRowIndex]
    .map((cell, columnIndex) => (columnIndex >= 2 && cell.text.trim() !== '' ? columnIndex : -1))
    .filter((columnIndex) => columnIndex !== -1);
  return { headerRowIndex, acceptableRowIndex, opponentRowIndex, dateRowIndex, timeRowIndex, locationRowIndex, notesRowIndex, inningColumnIndexes };
}

export function readLineup(tabName, rows, today) {
  const grid = locateLineupGrid(tabName, rows);
  const { headerRowIndex, opponentRowIndex, dateRowIndex, timeRowIndex, locationRowIndex, notesRowIndex, inningColumnIndexes } = grid;
  const textAt = (rowIndex, columnIndex) => (rows[rowIndex][columnIndex]?.text ?? '').trim();
  return {
    tabName,
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

function readPlayers(tabName, rows, grid) {
  const { headerRowIndex, acceptableRowIndex, inningColumnIndexes } = grid;
  const playerRows = rows
    .slice(headerRowIndex + 1, acceptableRowIndex)
    .filter((row) => (row[0]?.text ?? '').trim() !== '');
  const kickNumberText = (row) => (row[1]?.text ?? '').trim();
  const usesKickNumbers = playerRows.some((row) => isKickNumber(kickNumberText(row)));
  const players = playerRows.map((row) => {
    const name = row[0].text.trim();
    const kickText = kickNumberText(row);
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

function isKickNumber(cellText) {
  return /^\d+$/.test(cellText.trim());
}

function isBeforeToday(serialDate, today) {
  if (typeof serialDate !== 'number') return false;
  const day = new Date(Date.UTC(1899, 11, 30) + Math.floor(serialDate) * 86400000).toISOString().slice(0, 10);
  return day < today;
}
