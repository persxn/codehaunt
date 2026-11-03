/**
 * Every route under src/app is denied without a session, except the public allowlist.
 * Walks the filesystem, so a new page or route handler is covered the day it is added.
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { authorize } from '@codehaunt/auth/policy';

const APP = fileURLToPath(new URL('../src/app', import.meta.url));
const PUBLIC = new Set(['/login', '/api/auth/login', '/healthz', '/readyz', '/system-check', '/projector/x', '/api/projector/x']);

function routes(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...routes(path));
    else if (/^(page|route)\.tsx?$/.test(entry.name)) {
      const route = '/' + relative(APP, dir).split(sep).filter((s) => s && !/^\(.*\)$/.test(s)).join('/');
      // Dynamic segments get a concrete value; the policy matches by prefix.
      found.push(route.replace(/\[\.{0,3}[^\]]+\]/g, 'x'));
    }
  }
  return found;
}

test('the app has routes to check', () => {
  assert.ok(routes(APP).length >= 5);
});

for (const route of routes(APP)) {
  test(`${route} without a session`, () => {
    const decision = authorize(route, null);
    if (PUBLIC.has(route)) assert.deepEqual(decision, { allow: true });
    else assert.deepEqual(decision, { allow: false, status: 401 });
  });
}
