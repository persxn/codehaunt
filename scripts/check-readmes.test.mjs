import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';

import { checkReadmes } from './check-readmes.mjs';

const readme = (names) =>
  `# x\n\n## Contents\n| Path | What it does |\n|---|---|\n${names.map((n) => `| \`${n}\` | thing |`).join('\n')}\n\n## Gotchas\n`;

let root;
function tree(files) {
  root = mkdtempSync(join(tmpdir(), 'check-readmes-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return Object.keys(files);
}
afterEach(() => rmSync(root, { recursive: true, force: true }));

const documented = () => ({
  'README.md': readme(['a.ts', 'src/']),
  'a.ts': '',
  'src/README.md': readme(['b.ts']),
  'src/b.ts': '',
});

test('a fully documented tree passes', () => {
  const files = tree(documented());
  assert.deepEqual(checkReadmes(root, files), []);
});

test('a sub-folder without README fails', () => {
  const files = documented();
  delete files['src/README.md'];
  const paths = tree(files);
  assert.deepEqual(checkReadmes(root, paths), ['src: missing README.md']);
});

test('a file missing from the table fails', () => {
  const files = tree({ ...documented(), 'src/c.ts': '' });
  const errors = checkReadmes(root, files);
  assert.deepEqual(errors, ['src/README.md: Contents is missing c.ts']);
});

test('a listed file that does not exist fails', () => {
  const files = tree({ ...documented(), 'README.md': readme(['a.ts', 'src/', 'gone.ts']) });
  const errors = checkReadmes(root, files);
  assert.deepEqual(errors, ['README.md: Contents lists gone.ts but it does not exist']);
});

test('a README without a Contents section fails', () => {
  const files = tree({ ...documented(), 'src/README.md': '# src\n' });
  const errors = checkReadmes(root, files);
  assert.deepEqual(errors, ['src/README.md: no ## Contents section']);
});

test('node_modules and vendored sub-folders need no README', () => {
  const files = tree({
    'README.md': readme(['packages/']),
    'node_modules/x/index.js': '',
    'packages/README.md': readme(['judge/']),
    'packages/judge/README.md': readme(['src/']),
    'packages/judge/src/deep/a.ts': '',
  });
  assert.deepEqual(checkReadmes(root, files), []);
});

test('brace lists expand', () => {
  const files = tree({ 'README.md': readme(['{a,b}.txt']), 'a.txt': '', 'b.txt': '' });
  assert.deepEqual(checkReadmes(root, files), []);
});
