/**
 * `users.role` changes only through the one audited admin route (WP-01 R4, WP-04): no other source file in the web
 * app updates a user's role. Static, so a new route that tries is caught the day it is written.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const ALLOWED = 'server/staff-service.ts';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

test('only staff-service updates users.role, and only in changeRole', () => {
  const offenders: string[] = [];
  for (const file of files(SRC)) {
    const source = readFileSync(file, 'utf8');
    // A user update whose data mentions `role` (within the call's first few hundred characters).
    for (const m of source.matchAll(/\.user\.(update|updateMany|upsert)\(([\s\S]{0,400}?)\);/g)) {
      if (/\brole\s*[:,}]/.test(m[2]!)) offenders.push(`${relative(SRC, file)}: ${m[0].slice(0, 80)}`);
    }
    if (/\$executeRaw|\$queryRaw/.test(source) && /UPDATE\s+users[\s\S]{0,200}role/i.test(source)) offenders.push(`${relative(SRC, file)}: raw SQL`);
  }
  assert.equal(offenders.length, 1, offenders.join('\n'));
  assert.match(offenders[0]!, new RegExp(`^${ALLOWED.replace('/', '\\/')}`));
  const staff = readFileSync(join(SRC, ALLOWED), 'utf8');
  const changeRole = staff.slice(staff.indexOf('export async function changeRole'), staff.indexOf('export async function resetPassword'));
  assert.match(changeRole, /\.user\.update\(\{ where: \{ id: userId \}, data: \{ role: input\.role \} \}\)/);
  assert.match(changeRole, /action: 'user\.role_changed'/);
});
