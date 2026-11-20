import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineupGrid } from '../../site/lineupImage.js';

const player = (name, positions, rsvp = 'yes') => ({ name, positions, rsvp, attending: rsvp === 'yes' || rsvp === 'maybe' });

test('the shared image lists each position by inning, with sitting players and the kicking order', () => {
  const lineup = {
    innings: ['1', '2'],
    players: [
      player('Ian Park', ['P', '']),
      player('Drew Lee', ['', 'P']),
      player('Carl Carlson', ['C', 'C'], 'maybe'),
      player('Carl Cooper', ['C', '1B']),
      player('Kat Moss', ['LF', 'LF'], 'no'),
    ],
  };
  const grid = lineupGrid(lineup);
  assert.deepEqual(grid.rows[0], { label: 'Pitcher', cells: ['Ian P.', 'Drew L.'] });
  assert.deepEqual(grid.rows[1], { label: 'Catcher', cells: ['Carl Ca.? + Carl Co.', 'Carl Ca.?'] });
  assert.deepEqual(grid.rows[2], { label: '1st base', cells: ['—', 'Carl Co.'] });
  assert.deepEqual(grid.rows.find((row) => row.label === 'Left field').cells, ['—', '—']);
  assert.deepEqual(grid.sitting, [['Drew L.'], ['Ian P.']]);
  assert.deepEqual(grid.kicking, ['Ian P.', 'Drew L.', 'Carl Ca.?', 'Carl Co.']);
});
