import test from 'node:test';
import assert from 'node:assert/strict';
import { isDevTestLogin } from './devTestAuth.ts';

test('development credentials work only in development with the explicit flag', () => {
  assert.equal(isDevTestLogin('abcd', '1234', true, 'true'), true);
  assert.equal(isDevTestLogin('abcd', '1234', false, 'true'), false);
  assert.equal(isDevTestLogin('abcd', '1234', true, 'false'), false);
  assert.equal(isDevTestLogin('abcd', 'wrong', true, 'true'), false);
  assert.equal(isDevTestLogin('other', '1234', true, 'true'), false);
});
