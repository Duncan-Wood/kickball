import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAddedPlayers, applyFieldingChanges, applyKickingMove, applyRsvp, applyRemovedPlayers, applyRestoredPlayers, blankPlayerRows, firstBlankRosterRow, headcount, lineupPlayer, positionsIn, positionsText, rosterNameProblem, rosterPlayerFromRow, rowsWithName, candidatesForSpot, cellAddress, columnLetter, fieldingChanges, copyInningChanges, inverseKickingMove, isoDateFromDisplayed, isoTimeFromDisplayed, scheduleGames, kickingMove, nextGameNumber, occupantsOf, playersToAdd, rosterNamesToAdd, rowAfterMove } from '../../site/edits.js';

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

test('applying changes across innings updates each inning of each player', () => {
  const updated = applyFieldingChanges(lineupPlayers(), [{ sheetRow: 9, inningIndex: 0, value: 'SS' }, { sheetRow: 9, inningIndex: 1, value: '' }]);
  assert.deepEqual(updated[0].positions, ['SS', '']);
  assert.deepEqual(updated[1].positions, ['C', 'P']);
});

test('roster names already in the lineup are left out, ignoring case', () => {
  assert.deepEqual(rosterNamesToAdd(['alex', 'Pat (sub)', 'SAM', 'Taylor'], lineupPlayers()), ['Pat (sub)', 'Taylor']);
});

test('added players take the spare rows in order and refuse when there is no room', () => {
  assert.deepEqual(playersToAdd([12, 14], ['Pat', 'Taylor'], []), [{ name: 'Pat', sheetRow: 12 }, { name: 'Taylor', sheetRow: 14 }]);
  assert.throws(() => playersToAdd([12], ['Pat', 'Taylor'], []), /room for 1 more players/);
});

test('applying added players puts them in sheet order with blank innings and uses up their rows', () => {
  const lineup = { players: lineupPlayers(), spareRows: [12, 14] };
  const updated = applyAddedPlayers(lineup, [{ name: 'Pat', sheetRow: 12 }], 2);
  assert.deepEqual(updated.players.map((each) => each.name), ['Alex', 'Sam', 'Jordan', 'Pat', 'Riley']);
  assert.deepEqual(updated.players[3], { name: 'Pat', sheetRow: 12, attending: true, rsvp: 'yes', positions: ['', ''] });
  assert.deepEqual(updated.spareRows, [14]);
});

test('an RSVP of no marks the player out and anything else brings them back', () => {
  const attending = { ...player('Alex', 9, []), rsvp: '' };
  assert.deepEqual([applyRsvp(attending, 'no').attending, applyRsvp(attending, 'maybe').rsvp], [false, 'maybe']);
  const out = { ...player('Sam', 10, [], false), rsvp: 'no' };
  assert.equal(applyRsvp(out, 'yes').attending, true);
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

test('copying the previous inning changes only the players who differ', () => {
  const players = [player('Alex', 9, ['P', 'C', 'P']), player('Sam', 10, ['C', 'P', '']), player('Riley', 13, ['LF', 'LF', 'RF'], false)];
  assert.deepEqual(copyInningChanges(players, 1, 2), [
    { sheetRow: 9, inningIndex: 2, value: 'C' },
    { sheetRow: 10, inningIndex: 2, value: 'P' },
    { sheetRow: 13, inningIndex: 2, value: 'LF' },
  ]);
  assert.deepEqual(copyInningChanges(players, 0, 0), []);
});

test('removing added players puts their rows back in order', () => {
  const lineup = { players: lineupPlayers(), spareRows: [14] };
  const updated = applyRemovedPlayers(lineup, [11, 9]);
  assert.deepEqual(updated.players.map((each) => each.name), ['Sam', 'Riley']);
  assert.deepEqual(updated.spareRows, [9, 11, 14]);
});

test('displayed dates and times turn into what the form inputs expect', () => {
  assert.equal(isoDateFromDisplayed('11/8/26'), '2026-11-08');
  assert.equal(isoDateFromDisplayed('11/08/2026'), '2026-11-08');
  assert.equal(isoDateFromDisplayed('2026-11-08'), '2026-11-08');
  assert.equal(isoDateFromDisplayed('Sunday'), '');
  assert.equal(isoTimeFromDisplayed('7:00 PM'), '19:00');
  assert.equal(isoTimeFromDisplayed('12:30 AM'), '00:30');
  assert.equal(isoTimeFromDisplayed('12:30 PM'), '12:30');
  assert.equal(isoTimeFromDisplayed('19:05'), '19:05');
  assert.equal(isoTimeFromDisplayed('evening'), '');
});

test('the season schedule lists games, numbered or not, that have details or a lineup, with their rows', () => {
  const rows = [
    ['Game #', 'Date', 'Time', 'Location', 'Opponent', 'Label', 'Result'],
    ['1', '11/8/26', '7:00 PM', 'Field 1', 'Dirt Sliders', 'Semifinal', 'W, 12-0'],
    ['2', '11/15/26', '', '', ''],
    ['3'],
    ['4'],
    ['x', '11/22/26'],
  ];
  const games = scheduleGames(rows, [{ gameId: '1', tabName: 'Game 1 Lineup' }, { gameId: '3', tabName: 'Game 3 Lineup' }]);
  assert.deepEqual(games.map((game) => [game.id, game.row, game.tabName]), [['1', 2, 'Game 1 Lineup'], ['2', 3, null], ['3', 4, 'Game 3 Lineup'], ['x', 6, null]]);
  assert.deepEqual([games[0].label, games[0].result], ['Semifinal', 'W, 12-0']);
});

test('late additions go after the last player, then into earlier gaps', () => {
  const players = [{ sheetRow: 9 }, { sheetRow: 11 }];
  assert.deepEqual(playersToAdd([10, 12, 13], ['Pat', 'Taylor', 'Sam'], players).map((addition) => addition.sheetRow), [12, 13, 10]);
});

test('restoring players puts them back in their rows and out of the spare rows', () => {
  const lineup = { players: [{ sheetRow: 9, name: 'Amy' }], spareRows: [10, 11] };
  const restored = applyRestoredPlayers(lineup, [{ sheetRow: 10, name: 'Pat' }]);
  assert.deepEqual(restored.players.map((player) => player.name), ['Amy', 'Pat']);
  assert.deepEqual(restored.spareRows, [11]);
});

test('finding a player by sheet row returns undefined for a missing row', () => {
  assert.equal(lineupPlayer({ players: [{ sheetRow: 9, name: 'Amy' }] }, 9).name, 'Amy');
  assert.equal(lineupPlayer({ players: [] }, 9), undefined);
});

test('headcount counts Yes and Maybe as playing, and keeps no reply apart from No', () => {
  const players = [
    { attending: true, rsvp: 'yes' },
    { attending: true, rsvp: 'yes' },
    { attending: true, rsvp: 'maybe' },
    { attending: false, rsvp: '' },
    { attending: false, rsvp: 'no' },
  ];
  assert.deepEqual(headcount(players), { playing: 3, yes: 2, maybe: 1, waiting: 1, out: 1 });
});

test('clearing an RSVP takes the player out of the game', () => {
  const answered = { ...player('Sam', 10, ['P']), rsvp: 'yes' };
  assert.equal(applyRsvp(answered, '').attending, false);
});

test('blank player rows are the empty rows between the header and the end label', () => {
  assert.deepEqual(blankPlayerRows(['Game #:', 'Name', 'Amy', '', '', 'Open spots', '']), [4, 5]);
  assert.deepEqual(blankPlayerRows(['Game #:']), []);
});

test('a roster row reads its columns and tolerates short rows', () => {
  assert.deepEqual(rosterPlayerFromRow(['Amy B', 'SS, 2B', '', 'Subs only', 'she/her'], 4), { sheetRow: 4, name: 'Amy B', prefers: 'SS, 2B', avoids: '', notes: 'Subs only', pronouns: 'she/her', kicking: '', sub: false });
  assert.deepEqual(rosterPlayerFromRow(['Amy B'], 5), { sheetRow: 5, name: 'Amy B', prefers: '', avoids: '', notes: '', pronouns: '', kicking: '', sub: false });
  assert.equal(rosterPlayerFromRow(['Sam S', '', '', '', '', '', 'yes'], 6).sub, true);
});

test('position lists keep field order and keep entries they do not recognize', () => {
  assert.deepEqual(positionsIn('ss, 2B,bench'), ['2B', 'SS']);
  assert.equal(positionsText(['SS', 'P'], 'ss, bench'), 'P, SS, bench');
  assert.equal(positionsText([], ''), '');
});

test('a new roster player takes the first blank row or the row after the last name', () => {
  assert.equal(firstBlankRosterRow(['Amy', '', 'Pat']), 3);
  assert.equal(firstBlankRosterRow(['Amy', 'Pat']), 4);
  assert.equal(firstBlankRosterRow([]), 2);
});

test('a roster name must be filled in and not already used', () => {
  const roster = [{ sheetRow: 2, name: 'Amy B' }, { sheetRow: 3, name: 'Pat' }];
  assert.equal(rosterNameProblem('', roster, null), 'Enter a name');
  assert.match(rosterNameProblem('amy b', roster, null), /already on the roster/);
  assert.equal(rosterNameProblem('amy b', roster, 2), null);
  assert.equal(rosterNameProblem('Taylor', roster, null), null);
});

test('rows to rename are found in every game whatever the capitalization', () => {
  const lineups = [{ tabName: 'Game 1 Lineup', players: [{ name: 'Amy B', sheetRow: 9 }] }, { tabName: 'Game 2 Lineup', players: [{ name: 'amy b', sheetRow: 11 }, { name: 'Pat', sheetRow: 12 }] }];
  assert.deepEqual(rowsWithName(lineups, 'Amy B').map(({ lineup, sheetRow }) => [lineup.tabName, sheetRow]), [['Game 1 Lineup', 9], ['Game 2 Lineup', 11]]);
});

test('a season is one game a week from the first date, across month and year ends', async () => {
  const { seasonDates, seasonProblem, namesFromLines } = await import('../../site/edits.js');
  assert.deepEqual(seasonDates('2026-12-17', 3), ['2026-12-17', '2026-12-24', '2026-12-31']);
  assert.deepEqual(seasonDates('2026-12-31', 2), ['2026-12-31', '2027-01-07']);
  assert.equal(seasonProblem('2026-12-17', 8), null);
  assert.match(seasonProblem('', 8), /first game/);
  assert.match(seasonProblem('2026-12-17', 0), /1 to 30/);
  assert.match(seasonProblem('2026-12-17', 31), /1 to 30/);
  assert.match(seasonProblem('2026-12-17', 2.5), /1 to 30/);
  assert.deepEqual(namesFromLines('  Amy B \r\n\r\nAbe Bashir\namy b\n'), ['Amy B', 'Abe Bashir']);
  assert.deepEqual(namesFromLines('\n  \n'), []);
});

test('a roster row carries its kicking style, and only Bunt, Power or Mixed are shown beside a kicker', async () => {
  const { rosterPlayerFromRow, kickingStyleFor } = await import('../../site/edits.js');
  const roster = [
    rosterPlayerFromRow(['Chad S', '', '', '', '', 'Power'], 12),
    rosterPlayerFromRow(['Duncan W', '', '', '', '', 'Bunt'], 15),
    rosterPlayerFromRow(['Amy B', '', '', '', '', 'whatever'], 2),
    rosterPlayerFromRow(['Zach C'], 6),
  ];
  assert.equal(roster[0].kicking, 'Power');
  assert.equal(roster[3].kicking, '');
  assert.equal(kickingStyleFor(roster, 'chad s'), 'Power');
  assert.equal(kickingStyleFor(roster, 'Duncan W'), 'Bunt');
  assert.equal(kickingStyleFor(roster, 'Amy B'), '');
  assert.equal(kickingStyleFor(roster, 'Zach C'), '');
  assert.equal(kickingStyleFor(roster, 'Nobody'), '');
  assert.equal(kickingStyleFor(null, 'Chad S'), '');
});

test('a game is completed once it has a result or its date has passed', async () => {
  const { isCompletedGame, upcomingLineups } = await import('../../site/edits.js');
  const game = (isoDate, resultText = '') => ({ isoDate, resultText });
  assert.equal(isCompletedGame(game('2026-11-20'), '2026-11-23'), true);
  assert.equal(isCompletedGame(game('2026-11-23'), '2026-11-23'), false);
  assert.equal(isCompletedGame(game('2026-11-30', 'Won 9-5'), '2026-11-23'), true);
  assert.equal(isCompletedGame(game(''), '2026-11-23'), false);
  assert.deepEqual(upcomingLineups([game('2026-11-20'), game('2026-11-30')], '2026-11-23'), [game('2026-11-30')]);
});

test('subs and names missing from the roster are not regular players', async () => {
  const { isRegularPlayer, rosterPlayerFromRow } = await import('../../site/edits.js');
  const roster = [rosterPlayerFromRow(['Amy B'], 2), rosterPlayerFromRow(['Sam S', '', '', '', '', '', 'Yes'], 3)];
  assert.equal(isRegularPlayer(roster, ' amy b'), true);
  assert.equal(isRegularPlayer(roster, 'Sam S'), false);
  assert.equal(isRegularPlayer(roster, 'Walk On'), false);
});

test('a player who would rather not play a position is flagged only there', async () => {
  const { rosterPlayerFromRow, wouldRatherNotPlay } = await import('../../site/edits.js');
  const roster = [rosterPlayerFromRow(['Amy B', '', 'C, p'], 2)];
  assert.equal(wouldRatherNotPlay(roster, 'Amy B', 'C'), true);
  assert.equal(wouldRatherNotPlay(roster, 'Amy B', 'P'), true);
  assert.equal(wouldRatherNotPlay(roster, 'Amy B', 'SS'), false);
  assert.equal(wouldRatherNotPlay(roster, 'Zed', 'C'), false);
});

test('added players can start without a reply', async () => {
  const { applyAddedPlayers } = await import('../../site/edits.js');
  const { players } = applyAddedPlayers({ players: [], spareRows: [9] }, [{ name: 'Amy B', sheetRow: 9 }], 2, '');
  assert.deepEqual(players, [{ name: 'Amy B', sheetRow: 9, attending: false, rsvp: '', positions: ['', ''] }]);
});
