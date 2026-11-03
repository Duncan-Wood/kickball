import { POSITION_CODES } from './template.js';

export function columnLetter(columnIndex) {
  let letters = '';
  for (let remaining = columnIndex + 1; remaining > 0; remaining = Math.floor((remaining - 1) / 26)) {
    letters = String.fromCharCode(65 + ((remaining - 1) % 26)) + letters;
  }
  return letters;
}

export function cellAddress(tabName, columnIndex, sheetRow) {
  return `'${tabName.replaceAll("'", "''")}'!${columnLetter(columnIndex)}${sheetRow}`;
}

export function lineupPlayer(lineup, sheetRow) {
  return lineup.players.find((player) => player.sheetRow === sheetRow);
}

function playerAt(players, sheetRow) {
  const player = players.find((candidate) => candidate.sheetRow === sheetRow);
  if (player === undefined) throw new Error('That player is no longer in the lineup');
  return player;
}

export function fieldingChanges(players, inningIndex, sourceRow, target) {
  const source = playerAt(players, sourceRow);
  const sourcePosition = source.positions[inningIndex];
  if (target.kind === 'bench') return sourcePosition === '' ? [] : [{ sheetRow: source.sheetRow, value: '' }];
  if (target.kind === 'player') {
    const other = playerAt(players, target.sheetRow);
    if (other.sheetRow === source.sheetRow) return [];
    return [
      { sheetRow: source.sheetRow, value: other.positions[inningIndex] },
      { sheetRow: other.sheetRow, value: sourcePosition },
    ];
  }
  const occupants = players.filter((player) => player.attending && player.sheetRow !== source.sheetRow && player.positions[inningIndex] === target.position);
  if (occupants.length > 1) throw new Error(`${target.position} has ${occupants.map((player) => player.name).join(' and ')}. Move one of them first`);
  if (occupants.length === 0) return sourcePosition === target.position ? [] : [{ sheetRow: source.sheetRow, value: target.position }];
  return [
    { sheetRow: source.sheetRow, value: target.position },
    { sheetRow: occupants[0].sheetRow, value: sourcePosition },
  ];
}

export function fieldingChangesForInnings(players, inningIndexes, sourceRow, target, inningLabels) {
  return inningIndexes.flatMap((inningIndex) => {
    try {
      return fieldingChanges(players, inningIndex, sourceRow, target).map((change) => ({ ...change, inningIndex }));
    } catch (error) {
      throw new Error(`Inning ${inningLabels[inningIndex]}: ${error.message}`);
    }
  });
}

export function applyFieldingChanges(players, changes) {
  return players.map((player) => {
    const playerChanges = changes.filter((candidate) => candidate.sheetRow === player.sheetRow);
    if (playerChanges.length === 0) return player;
    return { ...player, positions: player.positions.map((position, index) => playerChanges.find((change) => change.inningIndex === index)?.value ?? position) };
  });
}

export function kickingMove(players, sourceRow, targetRow) {
  const source = playerAt(players, sourceRow);
  const target = playerAt(players, targetRow);
  if (source.sheetRow === target.sheetRow) return null;
  return {
    fromRow: source.sheetRow,
    finalRow: target.sheetRow,
    destinationIndex: source.sheetRow < target.sheetRow ? target.sheetRow : target.sheetRow - 1,
  };
}

export function rowAfterMove(sheetRow, { fromRow, finalRow }) {
  if (sheetRow === fromRow) return finalRow;
  if (fromRow < finalRow && sheetRow > fromRow && sheetRow <= finalRow) return sheetRow - 1;
  if (finalRow < fromRow && sheetRow >= finalRow && sheetRow < fromRow) return sheetRow + 1;
  return sheetRow;
}

export function applyKickingMove(players, move) {
  return players
    .map((player) => ({ ...player, sheetRow: rowAfterMove(player.sheetRow, move) }))
    .sort((first, second) => first.sheetRow - second.sheetRow);
}

export function rosterNamesToAdd(rosterNames, players) {
  const inLineup = new Set(players.map((player) => player.name.toLowerCase()));
  return rosterNames.filter((name) => !inLineup.has(name.toLowerCase()));
}

export function playersToAdd(spareRows, names, players) {
  if (names.length > spareRows.length) throw new Error(`This lineup has room for ${spareRows.length} more players. Add rows to the grid in the sheet first`);
  const lastPlayerRow = Math.max(0, ...players.map((player) => player.sheetRow));
  const rowsInFillOrder = [...spareRows.filter((sheetRow) => sheetRow > lastPlayerRow), ...spareRows.filter((sheetRow) => sheetRow < lastPlayerRow)];
  return names.map((name, index) => ({ name, sheetRow: rowsInFillOrder[index] }));
}

export function applyAddedPlayers(lineup, additions, inningCount) {
  const addedRows = new Set(additions.map(({ sheetRow }) => sheetRow));
  const added = additions.map(({ name, sheetRow }) => ({ name, sheetRow, attending: true, kickNumber: null, rsvp: '', positions: Array.from({ length: inningCount }, () => '') }));
  return {
    players: [...lineup.players, ...added].sort((first, second) => first.sheetRow - second.sheetRow),
    spareRows: lineup.spareRows.filter((sheetRow) => !addedRows.has(sheetRow)),
  };
}

export function applyRsvp(player, answer) {
  const wasStruckThrough = !player.attending && player.rsvp !== 'no';
  return { ...player, rsvp: answer, attending: answer !== 'no' && !wasStruckThrough };
}

export function nextGameNumber(lineups) {
  return Math.max(0, ...lineups.map((lineup) => lineup.gameNumber ?? 0)) + 1;
}

export function nextGameId(games, lineups) {
  const scheduledNumbers = games.filter((game) => /^\d+$/.test(game.id)).map((game) => Number(game.id));
  return String(Math.max(nextGameNumber(lineups), ...scheduledNumbers.map((number) => number + 1)));
}

export function gameIdProblem(id, existingIds) {
  if (id === '') return 'Enter a game number, like 7 or P1';
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,19}$/.test(id)) return 'Use letters, numbers, spaces or dashes, up to 20 characters';
  if (existingIds.some((existing) => existing.toLowerCase() === id.toLowerCase())) return `Game ${id} is already on the schedule`;
  return null;
}

export function inverseKickingMove({ fromRow, finalRow }) {
  return { fromRow: finalRow, finalRow: fromRow, destinationIndex: finalRow < fromRow ? fromRow : fromRow - 1 };
}

export function occupantsOf(players, inningIndex, position) {
  return players.filter((player) => player.attending && player.positions[inningIndex] === position);
}

function fieldOrder(position) {
  const index = POSITION_CODES.indexOf(position);
  return index === -1 ? POSITION_CODES.length : index;
}

export function candidatesForSpot(players, inningIndex, position) {
  const others = players.filter((player) => player.attending && player.positions[inningIndex] !== position);
  const sitting = others.filter((player) => player.positions[inningIndex] === '');
  const playing = others.filter((player) => player.positions[inningIndex] !== '').sort((first, second) => fieldOrder(first.positions[inningIndex]) - fieldOrder(second.positions[inningIndex]));
  return [...sitting, ...playing];
}

export function positionChoices(players, inningIndex, currentPosition) {
  return POSITION_CODES
    .filter((position) => position !== currentPosition)
    .map((position) => ({ position, occupants: occupantsOf(players, inningIndex, position) }));
}

export function describeInnings(inningIndexes, inningLabels) {
  const labels = inningIndexes.map((index) => inningLabels[index]);
  if (labels.length === 1) return `inning ${labels[0]}`;
  return `innings ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

export function inningsForPreset(preset, inningCount) {
  const all = Array.from({ length: inningCount }, (unused, index) => index);
  if (preset === 'odd') return all.filter((index) => index % 2 === 0);
  if (preset === 'even') return all.filter((index) => index % 2 === 1);
  return all;
}

export function inningsHaveDifferentLineups(players, inningIndexes) {
  const lineupOf = (inningIndex) => players.filter((player) => player.attending).map((player) => `${player.sheetRow}:${player.positions[inningIndex]}`).join('|');
  return new Set(inningIndexes.map(lineupOf)).size > 1;
}

export function applyRestoredPlayers(lineup, restoredPlayers) {
  const restoredRows = new Set(restoredPlayers.map((player) => player.sheetRow));
  return {
    players: [...lineup.players, ...restoredPlayers].sort((first, second) => first.sheetRow - second.sheetRow),
    spareRows: lineup.spareRows.filter((sheetRow) => !restoredRows.has(sheetRow)),
  };
}

export function applyRemovedPlayers(lineup, sheetRows) {
  const removedRows = new Set(sheetRows);
  return {
    players: lineup.players.filter((player) => !removedRows.has(player.sheetRow)),
    spareRows: [...lineup.spareRows, ...sheetRows].sort((first, second) => first - second),
  };
}

export function isoDateFromDisplayed(text) {
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso !== null) return text;
  const american = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (american === null) return '';
  const year = american[3].length === 2 ? `20${american[3]}` : american[3];
  return `${year}-${american[1].padStart(2, '0')}-${american[2].padStart(2, '0')}`;
}

export function isoTimeFromDisplayed(text) {
  const clock = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (clock === null) return '';
  const meridiem = (clock[3] ?? '').toUpperCase();
  const hour = Number(clock[1]) % 12 + (meridiem === 'PM' ? 12 : 0);
  return `${String(meridiem === '' ? Number(clock[1]) : hour).padStart(2, '0')}:${clock[2]}`;
}

export function scheduleGames(scheduleRows, lineups) {
  return scheduleRows.slice(1).flatMap((cells, index) => {
    const text = (column) => (cells[column] ?? '').trim();
    const id = text(0);
    if (id === '') return [];
    const lineup = lineups.find((candidate) => candidate.gameId === id);
    const game = { id, row: index + 2, date: text(1), time: text(2), location: text(3), opponent: text(4), notes: text(5), tabName: lineup?.tabName ?? null };
    return [game.date, game.time, game.location, game.opponent].some((value) => value !== '') || lineup !== undefined ? [game] : [];
  });
}

export function headcount(players) {
  const count = (answer) => players.filter((player) => player.attending && player.rsvp === answer).length;
  return {
    playing: players.filter((player) => player.attending).length,
    yes: count('yes'),
    maybe: count('maybe'),
    waiting: count(''),
    out: players.filter((player) => !player.attending).length,
  };
}

export function blankPlayerRows(columnA) {
  const headerIndex = columnA.indexOf('Name');
  const endIndex = columnA.findIndex((label) => label === 'Open spots' || label === 'Acceptable');
  if (headerIndex === -1 || endIndex === -1) return [];
  return columnA.slice(headerIndex + 1, endIndex).map((text, offset) => ({ text, sheetRow: headerIndex + 2 + offset })).filter(({ text }) => text === '').map(({ sheetRow }) => sheetRow);
}

export function rosterPlayerFromRow(cells, sheetRow) {
  const text = (columnIndex) => (cells[columnIndex] ?? '').trim();
  return { sheetRow, name: text(0), prefers: text(1), avoids: text(2), notes: text(3), pronouns: text(4) };
}

export function positionsIn(text) {
  const entered = text.split(',').map((code) => code.trim().toUpperCase());
  return POSITION_CODES.filter((code) => entered.includes(code));
}

export function positionsText(chosenCodes, originalText) {
  const unrecognized = originalText.split(',').map((code) => code.trim()).filter((code) => code !== '' && !POSITION_CODES.includes(code.toUpperCase()));
  return [...POSITION_CODES.filter((code) => chosenCodes.includes(code)), ...unrecognized].join(', ');
}

export function firstBlankRosterRow(names) {
  const blankIndex = names.findIndex((name) => name === '');
  return (blankIndex === -1 ? names.length : blankIndex) + 2;
}

export function rosterNameProblem(name, rosterPlayers, ownSheetRow) {
  if (name === '') return 'Enter a name';
  const duplicate = rosterPlayers.find((player) => player.sheetRow !== ownSheetRow && player.name.toLowerCase() === name.toLowerCase());
  return duplicate === undefined ? null : `${duplicate.name} is already on the roster`;
}

export function rowsWithName(lineups, name) {
  return lineups.flatMap((lineup) => lineup.players
    .filter((player) => player.name.toLowerCase() === name.toLowerCase())
    .map((player) => ({ lineup, sheetRow: player.sheetRow })));
}
