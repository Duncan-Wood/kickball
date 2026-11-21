import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortNames } from '../../site/names.js';

const shortFor = (names) => Object.fromEntries(shortNames(names));

test('a full name becomes the first name and last initial', () => {
  assert.deepEqual(shortFor(['Alex Rivera', 'Bennett Okafor', 'Liv']), { 'Alex Rivera': 'Alex R.', 'Bennett Okafor': 'Bennett O.', Liv: 'Liv' });
});

test('two players who would share a short name get more letters until they differ', () => {
  assert.deepEqual(shortFor(['Carl Carlson', 'Carl Cooper', 'Sam Lee', 'Sam Leeds']), {
    'Carl Carlson': 'Carl Ca.',
    'Carl Cooper': 'Carl Co.',
    'Sam Lee': 'Sam Lee',
    'Sam Leeds': 'Sam Lee.',
  });
});

test('a long name is cut off with an ellipsis and keeps its initial', () => {
  assert.deepEqual(shortFor(['Maximiliano Fitzgerald-Hughes', 'Alexandrinaaaa', 'Carlos Looooooooooooos']), {
    'Maximiliano Fitzgerald-Hughes': 'Maximili… F.',
    Alexandrinaaaa: 'Alexandrina…',
    'Carlos Looooooooooooos': 'Carlos L.',
  });
});

test('extra spaces around a name do not make it a different player', () => {
  assert.deepEqual(shortFor(['  Alex Rivera ', 'Alex Rivera']), { 'Alex Rivera': 'Alex R.' });
});
