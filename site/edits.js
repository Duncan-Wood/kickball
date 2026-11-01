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

export function inningsToEdit(scope, currentInningIndex, inningCount) {
  const first = scope === 'all' ? 0 : currentInningIndex;
  const last = scope === 'inning' ? currentInningIndex : inningCount - 1;
  return Array.from({ length: last - first + 1 }, (unused, offset) => first + offset);
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

export function playersToAdd(spareRows, names) {
  if (names.length > spareRows.length) throw new Error(`This lineup has room for ${spareRows.length} more players. Add rows to the grid in the sheet first`);
  return names.map((name, index) => ({ name, sheetRow: spareRows[index] }));
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

export function inningRangeLabel(inningIndexes, inningLabels) {
  const first = inningLabels[inningIndexes[0]];
  const last = inningLabels[inningIndexes[inningIndexes.length - 1]];
  return inningIndexes.length === 1 ? `Inning ${first}` : `Innings ${first} to ${last}`;
}
