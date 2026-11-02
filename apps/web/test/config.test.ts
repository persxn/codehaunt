/** Startup config (audit N2): an unset COOKIE_SECURE, as compose passes it, must not stop the web app. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sessionCookieOptions } from '@codehaunt/auth';

import { parseConfig } from '../src/lib/config.ts';

const base = { DATABASE_URL: 'postgresql://x@db/x', NODE_ENV: 'production' };

test('COOKIE_SECURE="" is accepted as unset, and cookies are Secure in production', () => {
  const parsed = parseConfig({ ...base, COOKIE_SECURE: '' });
  assert.ok(parsed.success);
  assert.equal(parsed.data.COOKIE_SECURE, undefined);
  const env = process.env as Record<string, string | undefined>;
  const saved = { NODE_ENV: env.NODE_ENV, COOKIE_SECURE: env.COOKIE_SECURE };
  try {
    env.NODE_ENV = 'production';
    env.COOKIE_SECURE = '';
    assert.equal(sessionCookieOptions().secure, true);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
});

test('only true/false are allowed otherwise', () => {
  assert.equal(parseConfig({ ...base, COOKIE_SECURE: 'yes' }).success, false);
  assert.ok(parseConfig({ ...base, COOKIE_SECURE: 'false' }).success);
});
