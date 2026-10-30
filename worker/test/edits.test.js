import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFieldingChanges, applyKickingMove, cellAddress, columnLetter, fieldingChanges, kickingMove } from '../../site/edits.js';

const player = (name, sheetRow, positions, attending = true) => ({ name, sheetRow, attending, positions });
const lineupPlayers = () => [
  player('Alex', 9, ['P', 'C']),
  player('Sam', 10, ['C', 'P']),
  player('Jordan', 11, ['', '1B']),
  player('Riley', 13, ['LF', 'LF'], false),
];

test('column letters count past Z', () => {
  assert.deepEqual([0, 2, 25, 26, 27, 701].map(columnLetter), ['A', 'C', 'Z', 'AA', 'AB', 'ZZ']);
});

test('cell addresses quote the tab name', () => {
  assert.equal(cellAddress("Game 2 Lineup", 3, 12), "'Game 2 Lineup'!D12");
  assert.equal(cellAddress("Kate's Lineup", 2, 9), "'Kate''s Lineup'!C9");
});

test('moving a player onto an occupied spot swaps the two for that inning', () => {
  const changes = fieldingChanges(lineupPlayers(), 0, 9, { kind: 'spot', position: 'C' });
  assert.deepEqual(changes, [{ sheetRow: 9, value: 'C' }, { sheetRow: 10, value: 'P' }]);
});

test('moving a player onto an open spot just moves them', () => {
  assert.deepEqual(fieldingChanges(lineupPlayers(), 0, 9, { kind: 'spot', position: 'SS' }), [{ sheetRow: 9, value: 'SS' }]);
});

test('moving a benched player onto an occupied spot benches the occupant', () => {
  const changes = fieldingChanges(lineupPlayers(), 0, 11, { kind: 'spot', position: 'P' });
  assert.deepEqual(changes, [{ sheetRow: 11, value: 'P' }, { sheetRow: 9, value: '' }]);
});

test('dropping on the bench sits the player, and does nothing if they already sit', () => {
  assert.deepEqual(fieldingChanges(lineupPlayers(), 0, 9, { kind: 'bench' }), [{ sheetRow: 9, value: '' }]);
  assert.deepEqual(fieldingChanges(lineupPlayers(), 0, 11, { kind: 'bench' }), []);
});

test('dropping on another player swaps their positions, and on yourself does nothing', () => {
  assert.deepEqual(fieldingChanges(lineupPlayers(), 0, 9, { kind: 'player', sheetRow: 11 }), [{ sheetRow: 9, value: '' }, { sheetRow: 11, value: 'P' }]);
  assert.deepEqual(fieldingChanges(lineupPlayers(), 0, 9, { kind: 'player', sheetRow: 9 }), []);
});

test('a spot that already has two players refuses the move, naming them', () => {
  const players = [...lineupPlayers(), player('Casey', 14, ['C', 'C'])];
  assert.throws(() => fieldingChanges(players, 0, 11, { kind: 'spot', position: 'C' }), /C has Sam and Casey/);
});

test('players who are not attending do not count as occupying a spot', () => {
  assert.deepEqual(fieldingChanges(lineupPlayers(), 0, 9, { kind: 'spot', position: 'LF' }), [{ sheetRow: 9, value: 'LF' }]);
});

test('an unknown player fails loudly', () => {
  assert.throws(() => fieldingChanges(lineupPlayers(), 0, 99, { kind: 'bench' }), /no longer in the lineup/);
});

test('applying fielding changes touches only that inning of those players', () => {
  const changes = fieldingChanges(lineupPlayers(), 1, 9, { kind: 'spot', position: '1B' });
  const updated = applyFieldingChanges(lineupPlayers(), 1, changes);
  assert.deepEqual(updated.map((each) => each.positions), [['P', '1B'], ['C', 'P'], ['', 'C'], ['LF', 'LF']]);
});

test('moving a kicker down places them after the target and shifts the rows between', () => {
  const move = kickingMove(lineupPlayers(), 9, 11);
  assert.deepEqual(move, { fromRow: 9, finalRow: 11, destinationIndex: 11 });
  assert.deepEqual(applyKickingMove(lineupPlayers(), move).map((each) => [each.name, each.sheetRow]), [['Sam', 9], ['Jordan', 10], ['Alex', 11], ['Riley', 13]]);
});

test('moving a kicker up places them before the target', () => {
  const move = kickingMove(lineupPlayers(), 11, 9);
  assert.deepEqual(move, { fromRow: 11, finalRow: 9, destinationIndex: 8 });
  assert.deepEqual(applyKickingMove(lineupPlayers(), move).map((each) => [each.name, each.sheetRow]), [['Jordan', 9], ['Alex', 10], ['Sam', 11], ['Riley', 13]]);
});

test('moving past a blank row keeps the gap where it was', () => {
  const move = kickingMove(lineupPlayers(), 9, 13);
  assert.deepEqual(applyKickingMove(lineupPlayers(), move).map((each) => [each.name, each.sheetRow]), [['Sam', 9], ['Jordan', 10], ['Riley', 12], ['Alex', 13]]);
});

test('moving a kicker onto themselves is nothing', () => {
  assert.equal(kickingMove(lineupPlayers(), 10, 10), null);
});
