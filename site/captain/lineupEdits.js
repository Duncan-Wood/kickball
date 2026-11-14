import { applyAddedPlayers, applyFieldingChanges, applyKickingMove, applyRemovedPlayers, applyRestoredPlayers, applyRsvp, cellAddress, inverseKickingMove, lineupPlayer, playersToAdd, rowAfterMove } from '../edits.js';
import { confirmSheetStillMatches, sheetIdFor, sheetsRequest, writeValues } from './sheetApi.js';
import { RSVP_ANSWERS } from './state.js';

const RSVP_COLUMN_INDEX = 1;

function currentVersionOf(lineup) {
  return window.fieldView.allLineups().find((candidate) => candidate.tabName === lineup.tabName) ?? lineup;
}

function nameExpectations(lineup, sheetRows) {
  return [...new Set(sheetRows)].map((sheetRow) => ({ address: cellAddress(lineup.tabName, 0, sheetRow), expected: lineupPlayer(lineup, sheetRow).name }));
}

function rowExpectations(lineup, player) {
  return [
    { address: cellAddress(lineup.tabName, 0, player.sheetRow), expected: player.name },
    ...(lineup.usesRsvp ? [{ address: cellAddress(lineup.tabName, RSVP_COLUMN_INDEX, player.sheetRow), expected: player.rsvp }] : []),
    ...lineup.inningColumns.map((columnIndex, inningIndex) => ({ address: cellAddress(lineup.tabName, columnIndex, player.sheetRow), expected: player.positions[inningIndex] })),
  ];
}

function rowWrites(lineup, { sheetRow, name, rsvp, positions }) {
  const rsvpText = RSVP_ANSWERS.find((answer) => answer.toLowerCase() === rsvp) ?? '';
  return [
    { range: cellAddress(lineup.tabName, 0, sheetRow), values: [[name]] },
    ...(lineup.usesRsvp ? [{ range: cellAddress(lineup.tabName, RSVP_COLUMN_INDEX, sheetRow), values: [[rsvpText]] }] : []),
    ...lineup.inningColumns.map((columnIndex, inningIndex) => ({ range: cellAddress(lineup.tabName, columnIndex, sheetRow), values: [[positions[inningIndex]]] })),
  ];
}

export async function saveFielding(lineupWhenEditing, changes) {
  const lineup = currentVersionOf(lineupWhenEditing);
  const reversal = changes.map(({ sheetRow, inningIndex }) => ({ sheetRow, inningIndex, value: lineupPlayer(lineup, sheetRow).positions[inningIndex] }));
  await confirmSheetStillMatches([
    ...nameExpectations(lineup, changes.map(({ sheetRow }) => sheetRow)),
    ...changes.map(({ sheetRow, inningIndex }) => ({ address: cellAddress(lineup.tabName, lineup.inningColumns[inningIndex], sheetRow), expected: lineupPlayer(lineup, sheetRow).positions[inningIndex] })),
  ]);
  await writeValues(changes.map(({ sheetRow, inningIndex, value }) => ({ range: cellAddress(lineup.tabName, lineup.inningColumns[inningIndex], sheetRow), values: [[value]] })));
  lineup.players = applyFieldingChanges(lineup.players, changes);
  return () => saveFielding(lineup, reversal);
}

export async function saveKickingMove(lineupWhenEditing, move, sourceRow, targetRow) {
  const lineup = currentVersionOf(lineupWhenEditing);
  await confirmSheetStillMatches(nameExpectations(lineup, [sourceRow, targetRow]));
  const sheetId = await sheetIdFor(lineup.tabName);
  await sheetsRequest(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ moveDimension: { source: { sheetId, dimension: 'ROWS', startIndex: move.fromRow - 1, endIndex: move.fromRow }, destinationIndex: move.destinationIndex } }],
    }),
  });
  lineup.players = applyKickingMove(lineup.players, move);
  lineup.spareRows = lineup.spareRows.map((sheetRow) => rowAfterMove(sheetRow, move)).sort((first, second) => first - second);
  return () => saveKickingMove(lineup, inverseKickingMove(move), move.finalRow, move.fromRow);
}

export async function saveRsvp(lineupWhenEditing, sheetRow, answer) {
  const lineup = currentVersionOf(lineupWhenEditing);
  const player = lineupPlayer(lineup, sheetRow);
  const previousAnswer = RSVP_ANSWERS.find((candidate) => candidate.toLowerCase() === player.rsvp) ?? '';
  const address = cellAddress(lineup.tabName, RSVP_COLUMN_INDEX, sheetRow);
  await confirmSheetStillMatches([...nameExpectations(lineup, [sheetRow]), { address, expected: player.rsvp }]);
  await writeValues([{ range: address, values: [[answer]] }]);
  lineup.players = lineup.players.map((candidate) => (candidate.sheetRow === sheetRow ? applyRsvp(candidate, answer.toLowerCase()) : candidate));
  return () => saveRsvp(lineup, sheetRow, previousAnswer);
}

export async function saveRemovedPlayers(lineupWhenEditing, sheetRows) {
  const lineup = currentVersionOf(lineupWhenEditing);
  const removed = sheetRows.map((sheetRow) => lineupPlayer(lineup, sheetRow));
  await confirmSheetStillMatches(removed.flatMap((player) => rowExpectations(lineup, player)));
  const blankRow = (player) => rowWrites(lineup, { ...player, name: '', rsvp: '', positions: player.positions.map(() => '') });
  await writeValues(removed.flatMap(blankRow), 'RAW');
  Object.assign(lineup, applyRemovedPlayers(lineup, sheetRows));
  return () => saveRestoredPlayers(lineup, removed);
}

async function saveRestoredPlayers(lineupWhenEditing, restoredPlayers) {
  const lineup = currentVersionOf(lineupWhenEditing);
  await confirmSheetStillMatches(restoredPlayers.map(({ sheetRow }) => ({ address: cellAddress(lineup.tabName, 0, sheetRow), expected: '' })));
  await writeValues(restoredPlayers.flatMap((player) => rowWrites(lineup, player)), 'RAW');
  Object.assign(lineup, applyRestoredPlayers(lineup, restoredPlayers));
}

export async function saveAddedPlayers(lineupWhenEditing, names) {
  const lineup = currentVersionOf(lineupWhenEditing);
  const additions = playersToAdd(lineup.spareRows, names, lineup.players);
  await confirmSheetStillMatches(additions.map(({ sheetRow }) => ({ address: cellAddress(lineup.tabName, 0, sheetRow), expected: '' })));
  await writeValues(additions.map(({ name, sheetRow }) => ({ range: cellAddress(lineup.tabName, 0, sheetRow), values: [[name]] })), 'RAW');
  Object.assign(lineup, applyAddedPlayers(lineup, additions, lineup.innings.length));
  return () => saveRemovedPlayers(lineup, additions.map(({ sheetRow }) => sheetRow));
}
