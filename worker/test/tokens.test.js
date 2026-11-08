import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptToken, encryptToken, newTeamSlug } from '../src/tokens.js';
import { ENCRYPTION_KEY } from './support.js';

test('a refresh token decrypts to what was stored and is not readable in storage', async () => {
  const stored = await encryptToken('1//refresh-token-value', ENCRYPTION_KEY);
  assert.equal(stored.includes('refresh-token-value'), false);
  assert.equal(await decryptToken(stored, ENCRYPTION_KEY), '1//refresh-token-value');
});

test('encrypting the same token twice gives different stored text', async () => {
  assert.notEqual(await encryptToken('same', ENCRYPTION_KEY), await encryptToken('same', ENCRYPTION_KEY));
});

test('a different key cannot decrypt the token', async () => {
  const stored = await encryptToken('secret', ENCRYPTION_KEY);
  await assert.rejects(decryptToken(stored, Buffer.alloc(32, 9).toString('base64')));
});

test('a tampered token is refused', async () => {
  const [initializationVector, encrypted] = (await encryptToken('secret', ENCRYPTION_KEY)).split('.');
  const flipped = Buffer.from(encrypted, 'base64');
  flipped[0] ^= 1;
  await assert.rejects(decryptToken(`${initializationVector}.${flipped.toString('base64')}`, ENCRYPTION_KEY));
});

test('team slugs are 12 characters from an alphabet without look-alike letters, and differ', () => {
  const slugs = Array.from({ length: 50 }, newTeamSlug);
  assert.ok(slugs.every((slug) => /^[a-hjkmnp-z2-9]{12}$/.test(slug)));
  assert.equal(new Set(slugs).size, 50);
});
