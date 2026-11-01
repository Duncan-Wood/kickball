import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAddedPlayers, applyFieldingChanges, applyKickingMove, applyRsvp, candidatesForSpot, cellAddress, columnLetter, fieldingChanges, fieldingChangesForInnings, inningRangeLabel, inningsToEdit, inverseKickingMove, kickingMove, nextGameNumber, occupantsOf, positionChoices, playersToAdd, rosterNamesToAdd, rowAfterMove } from '../../site/edits.js';

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
  const updated = applyFieldingChanges(lineupPlayers(), changes.map((change) => ({ ...change, inningIndex: 1 })));
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

test('the innings to edit follow the chosen scope', () => {
  assert.deepEqual(inningsToEdit('inning', 2, 5), [2]);
  assert.deepEqual(inningsToEdit('rest', 2, 5), [2, 3, 4]);
  assert.deepEqual(inningsToEdit('all', 2, 5), [0, 1, 2, 3, 4]);
});

test('a move across innings works out each inning on its own and tags the changes', () => {
  const changes = fieldingChangesForInnings(lineupPlayers(), [0, 1], 9, { kind: 'spot', position: 'C' }, ['1', '2']);
  assert.deepEqual(changes, [
    { sheetRow: 9, value: 'C', inningIndex: 0 },
    { sheetRow: 10, value: 'P', inningIndex: 0 },
  ]);
});

test('a refused inning names itself in the error', () => {
  const players = [...lineupPlayers(), player('Casey', 14, ['', 'C']), player('Quinn', 15, ['', 'C'])];
  assert.throws(() => fieldingChangesForInnings(players, [0, 1], 9, { kind: 'spot', position: 'C' }, ['1', '2']), /Inning 2: C has Casey and Quinn/);
});

test('applying changes across innings updates each inning of each player', () => {
  const updated = applyFieldingChanges(lineupPlayers(), [{ sheetRow: 9, inningIndex: 0, value: 'SS' }, { sheetRow: 9, inningIndex: 1, value: '' }]);
  assert.deepEqual(updated[0].positions, ['SS', '']);
  assert.deepEqual(updated[1].positions, ['C', 'P']);
});

test('roster names already in the lineup are left out, ignoring case', () => {
  assert.deepEqual(rosterNamesToAdd(['alex', 'Pat (sub)', 'SAM', 'Taylor'], lineupPlayers()), ['Pat (sub)', 'Taylor']);
});

test('added players take the spare rows in order and refuse when there is no room', () => {
  assert.deepEqual(playersToAdd([12, 14], ['Pat', 'Taylor']), [{ name: 'Pat', sheetRow: 12 }, { name: 'Taylor', sheetRow: 14 }]);
  assert.throws(() => playersToAdd([12], ['Pat', 'Taylor']), /room for 1 more players/);
});

test('applying added players puts them in sheet order with blank innings and uses up their rows', () => {
  const lineup = { players: lineupPlayers(), spareRows: [12, 14] };
  const updated = applyAddedPlayers(lineup, [{ name: 'Pat', sheetRow: 12 }], 2);
  assert.deepEqual(updated.players.map((each) => each.name), ['Alex', 'Sam', 'Jordan', 'Pat', 'Riley']);
  assert.deepEqual(updated.players[3], { name: 'Pat', sheetRow: 12, attending: true, kickNumber: null, rsvp: '', positions: ['', ''] });
  assert.deepEqual(updated.spareRows, [14]);
});

test('an RSVP of no marks the player out and anything else brings them back, unless their name is struck through', () => {
  const attending = { ...player('Alex', 9, []), rsvp: '' };
  assert.deepEqual([applyRsvp(attending, 'no').attending, applyRsvp(attending, 'maybe').rsvp], [false, 'maybe']);
  const out = { ...player('Sam', 10, [], false), rsvp: 'no' };
  assert.equal(applyRsvp(out, 'yes').attending, true);
  const struckThrough = { ...player('Jordan', 11, [], false), rsvp: 'yes' };
  assert.equal(applyRsvp(struckThrough, 'maybe').attending, false);
});

test('spare rows move with a kicker', () => {
  const move = kickingMove(lineupPlayers(), 9, 13);
  assert.deepEqual([12, 14].map((sheetRow) => rowAfterMove(sheetRow, move)), [11, 14]);
});

test('the next game number follows the highest one, and starts at 1', () => {
  assert.equal(nextGameNumber([{ gameNumber: 2 }, { gameNumber: 5 }, { gameNumber: null }]), 6);
  assert.equal(nextGameNumber([]), 1);
});

test('undoing a kicking move sends the kicker back to where they started', () => {
  const down = kickingMove(lineupPlayers(), 9, 11);
  const movedDown = applyKickingMove(lineupPlayers(), down);
  const backUp = applyKickingMove(movedDown, inverseKickingMove(down));
  assert.deepEqual(backUp.map((each) => [each.name, each.sheetRow]), lineupPlayers().map((each) => [each.name, each.sheetRow]));
  const up = kickingMove(lineupPlayers(), 11, 9);
  assert.deepEqual(inverseKickingMove(up), { fromRow: 9, finalRow: 11, destinationIndex: 11 });
});

test('occupants only count players who are attending', () => {
  assert.deepEqual(occupantsOf(lineupPlayers(), 0, 'LF'), []);
  assert.deepEqual(occupantsOf(lineupPlayers(), 0, 'P').map((each) => each.name), ['Alex']);
});

test('spot candidates list the bench first, then fielders in field order, and leave out the spot holder and absent players', () => {
  const players = [player('Alex', 9, ['RF']), player('Sam', 10, ['P']), player('Jordan', 11, ['']), player('Riley', 12, ['SS']), player('Casey', 13, ['C'], false), player('Pat', 14, [''])];
  assert.deepEqual(candidatesForSpot(players, 0, 'C').map((each) => each.name), ['Jordan', 'Pat', 'Sam', 'Riley', 'Alex']);
  assert.deepEqual(candidatesForSpot(players, 0, 'P').map((each) => each.name), ['Jordan', 'Pat', 'Riley', 'Alex']);
});

test('position choices list every other position in field order with who is there', () => {
  const choices = positionChoices(lineupPlayers(), 0, 'P');
  assert.equal(choices.length, 10);
  assert.equal(choices[0].position, 'C');
  assert.deepEqual(choices[0].occupants.map((each) => each.name), ['Sam']);
  assert.deepEqual(choices.find((choice) => choice.position === 'LF').occupants, []);
});

test('the innings being edited are named plainly', () => {
  assert.equal(inningRangeLabel([1], ['1', '2', '3']), 'Inning 2');
  assert.equal(inningRangeLabel([1, 2], ['1', '2', '3']), 'Innings 2 to 3');
});
