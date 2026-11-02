import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notesFromResult, resultFromNotes } from '../../site/result.js';

test('notes that follow the result format are read as a result', () => {
  assert.deepEqual(resultFromNotes('W, 12-0'), { outcome: 'W', ourRuns: 12, theirRuns: 0 });
  assert.deepEqual(resultFromNotes('l 3 - 5'), { outcome: 'L', ourRuns: 3, theirRuns: 5 });
  assert.deepEqual(resultFromNotes('T, 5-5'), { outcome: 'T', ourRuns: 5, theirRuns: 5 });
  assert.equal(resultFromNotes('Rained out'), null);
  assert.equal(resultFromNotes(''), null);
});

test('a result is written in the format the reader understands', () => {
  assert.equal(notesFromResult({ outcome: 'W', ourRuns: 12, theirRuns: 0 }), 'W, 12-0');
  assert.deepEqual(resultFromNotes(notesFromResult({ outcome: 'T', ourRuns: 4, theirRuns: 4 })), { outcome: 'T', ourRuns: 4, theirRuns: 4 });
});

test('a result whose scores disagree with its outcome is refused', () => {
  assert.throws(() => notesFromResult({ outcome: 'W', ourRuns: 3, theirRuns: 3 }), /win needs more runs/);
  assert.throws(() => notesFromResult({ outcome: 'L', ourRuns: 5, theirRuns: 3 }), /loss needs fewer runs/);
  assert.throws(() => notesFromResult({ outcome: 'T', ourRuns: 5, theirRuns: 3 }), /tie needs the same runs/);
  assert.throws(() => notesFromResult({ outcome: 'W', ourRuns: Number.NaN, theirRuns: 1 }), /whole numbers/);
});
