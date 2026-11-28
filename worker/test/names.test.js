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

test('names written without initials, like Japanese, Chinese and Korean, stay whole', () => {
  assert.deepEqual(shortFor(['山田 太郎', '김민준', '李小龙']), { '山田 太郎': '山田 太郎', 김민준: '김민준', 李小龙: '李小龙' });
});

test('cutting a name never splits an accented letter or an emoji', () => {
  const decomposedSurname = 'A\u030Alvarez';
  const short = shortFor([`Zoë 👩🏽‍🦱 ${decomposedSurname}`, 'Nguyễn Thị Minh Ánh', '👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱']);
  assert.equal(short[`Zoë 👩🏽‍🦱 ${decomposedSurname}`], 'Zoë A\u030A.');
  assert.equal(short['Nguyễn Thị Minh Ánh'], 'Nguyễn Á.');
  assert.equal(short['👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱👩🏽‍🦱'], `${'👩🏽‍🦱'.repeat(11)}…`);
});
test('a note in brackets or a stray symbol is never used as the last initial', () => {
  assert.deepEqual(shortFor(['Ana Ruiz (sub)', 'Jo Walsh - captain', '(sub)']), { 'Ana Ruiz (sub)': 'Ana R.', 'Jo Walsh - captain': 'Jo c.', '(sub)': '(sub)' });
});

test('a repeated first word is all first name', () => {
  assert.deepEqual(shortFor(['Cey Cey', 'Cey Cey (sub)', 'Cey Cey Moore']), { 'Cey Cey': 'Cey Cey', 'Cey Cey (sub)': 'Cey Cey', 'Cey Cey Moore': 'Cey Cey M.' });
});
