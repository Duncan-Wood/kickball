import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeResult, resultFromText } from '../../site/result.js';

test('free text that contains a win, loss or tie with both scores is read as a result', () => {
  assert.deepEqual(resultFromText('W, 12-0'), { outcome: 'W', ourRuns: 12, theirRuns: 0 });
  assert.deepEqual(resultFromText('l 3 - 5'), { outcome: 'L', ourRuns: 3, theirRuns: 5 });
  assert.deepEqual(resultFromText('T, 5-5'), { outcome: 'T', ourRuns: 5, theirRuns: 5 });
  assert.deepEqual(resultFromText('Won 9-5'), { outcome: 'W', ourRuns: 9, theirRuns: 5 });
  assert.deepEqual(resultFromText('Lost 2-4 in extra innings'), { outcome: 'L', ourRuns: 2, theirRuns: 4 });
  assert.deepEqual(resultFromText('Playoff semifinal W, 9-5'), { outcome: 'W', ourRuns: 9, theirRuns: 5 });
});

test('text without an outcome and both scores is not a result', () => {
  assert.equal(resultFromText('Rained out'), null);
  assert.equal(resultFromText('Won'), null);
  assert.equal(resultFromText('9-5'), null);
  assert.equal(resultFromText(''), null);
});

test('a result is described in words', () => {
  assert.equal(describeResult({ outcome: 'W', ourRuns: 12, theirRuns: 0 }), 'Won 12-0');
  assert.equal(describeResult({ outcome: 'T', ourRuns: 4, theirRuns: 4 }), 'Tied 4-4');
});
