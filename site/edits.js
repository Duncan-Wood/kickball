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

export function applyFieldingChanges(players, inningIndex, changes) {
  return players.map((player) => {
    const change = changes.find((candidate) => candidate.sheetRow === player.sheetRow);
    if (change === undefined) return player;
    return { ...player, positions: player.positions.map((position, index) => (index === inningIndex ? change.value : position)) };
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

function rowAfterMove(sheetRow, { fromRow, finalRow }) {
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
