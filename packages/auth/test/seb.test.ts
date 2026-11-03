/** SEB Config Key hash (ADR-013 §3): the exact URL, the exact key, fail closed on half config. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sebConfig, sebHash, sebHeaderValid } from '../src/seb.ts';

const KEY = 'ab'.repeat(32);
const ORIGIN = 'https://codehaunt.jojocode.in';
const config = { configKey: KEY, publicOrigin: ORIGIN };

test('hash is SHA-256 of URL + key, hex', () => {
  // echo -n 'https://a.test/xk' | sha256sum
  assert.equal(sebHash('https://a.test/x', 'k'), 'd5abf032510c57a80d14539b62ed74b8bb3587f410cb77f80af0c845ec509240');
});

test('valid only for the exact path and query', () => {
  const header = sebHash(`${ORIGIN}/contest/a?x=1`, KEY);
  assert.equal(sebHeaderValid(config, '/contest/a?x=1', header), true);
  assert.equal(sebHeaderValid(config, '/contest/a?x=1', header.toUpperCase()), true);
  assert.equal(sebHeaderValid(config, '/contest/a', header), false);
  assert.equal(sebHeaderValid(config, '/contest/b?x=1', header), false);
});

test('wrong key, another origin, missing or malformed header are refused', () => {
  assert.equal(sebHeaderValid(config, '/contest', sebHash(`${ORIGIN}/contest`, 'cd'.repeat(32))), false);
  assert.equal(sebHeaderValid(config, '/contest', sebHash('https://evil.test/contest', KEY)), false);
  assert.equal(sebHeaderValid(config, '/contest', null), false);
  assert.equal(sebHeaderValid(config, '/contest', ''), false);
  assert.equal(sebHeaderValid(config, '/contest', 'zz'.repeat(32)), false);
  assert.equal(sebHeaderValid(config, '/contest', 'ab'), false);
});

test('config: both or neither, well-formed', () => {
  assert.equal(sebConfig({}), null);
  assert.equal(sebConfig({ SEB_CONFIG_KEY: '', PUBLIC_ORIGIN: '' }), null);
  assert.deepEqual(sebConfig({ SEB_CONFIG_KEY: KEY.toUpperCase(), PUBLIC_ORIGIN: `${ORIGIN}/` }), config);
  assert.throws(() => sebConfig({ SEB_CONFIG_KEY: KEY }), /together/);
  assert.throws(() => sebConfig({ PUBLIC_ORIGIN: ORIGIN }), /together/);
  assert.throws(() => sebConfig({ SEB_CONFIG_KEY: 'abc', PUBLIC_ORIGIN: ORIGIN }), /64 hex/);
  assert.throws(() => sebConfig({ SEB_CONFIG_KEY: KEY, PUBLIC_ORIGIN: 'http://codehaunt.jojocode.in' }), /https/);
  assert.throws(() => sebConfig({ SEB_CONFIG_KEY: KEY, PUBLIC_ORIGIN: `${ORIGIN}/contest` }), /no path/);
});
