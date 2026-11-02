// Fails when a folder has no README.md, or a README's "## Contents" table doesn't match the folder
// (engineering standards §6). Files come from git, so ignored paths (.env, node_modules, build output) never count.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A folder with one of these segments, and everything below it, needs no README. */
export const EXEMPT_SEGMENTS = ['node_modules', '.git', 'dist', '.next', 'generated', '.github'];

/** These folders need a README, but their sub-folders are covered by it. */
export const SINGLE_README_ROOTS = ['packages/judge', 'packages/db/prisma/migrations'];

function isExempt(folder) {
  if (folder.split('/').some((s) => EXEMPT_SEGMENTS.includes(s))) return true;
  return SINGLE_README_ROOTS.some((root) => folder.startsWith(`${root}/`));
}

/** "`{a,b}.ts`" → a.ts, b.ts (one level of braces). */
function expandBraces(token) {
  const match = token.match(/\{([^}]+)\}/);
  return match ? match[1].split(',').map((part) => token.replace(match[0], part.trim())) : [token];
}

/** Backticked names in the first cell of each "## Contents" table row, or null if there is no such section. */
export function parseContents(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Contents\s*$/.test(line));
  if (start === -1) return null;
  const entries = new Set();
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    if (!line.trim().startsWith('|') || /^\s*\|[\s:|-]+\|\s*$/.test(line)) continue;
    const firstCell = line.split('|')[1] ?? '';
    for (const [, token] of firstCell.matchAll(/`([^`]+)`/g)) {
      for (const name of expandBraces(token.trim())) entries.add(name);
    }
  }
  return entries;
}

/** Direct children of `folder`: files by name, sub-folders with a trailing slash. */
function childrenOf(folder, files) {
  const prefix = folder === '.' ? '' : `${folder}/`;
  const children = new Set();
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const [head, ...rest] = file.slice(prefix.length).split('/');
    if (EXEMPT_SEGMENTS.includes(head)) continue;
    if (rest.length > 0) children.add(`${head}/`);
    else if (head !== 'README.md') children.add(head);
  }
  return children;
}

/** Error strings for a repo root and its repo-relative file list ('/' separators). */
export function checkReadmes(root, files) {
  const existing = files.filter((file) => {
    try {
      return statSync(join(root, file)).isFile();
    } catch {
      return false;
    }
  });

  const folders = new Set(['.']);
  for (const file of existing) {
    for (let dir = dirname(file); dir !== '.'; dir = dirname(dir)) folders.add(dir);
  }

  const errors = [];
  for (const folder of [...folders].sort()) {
    if (isExempt(folder)) continue;
    const readme = folder === '.' ? 'README.md' : `${folder}/README.md`;
    if (!existsSync(join(root, readme))) {
      errors.push(`${folder}: missing README.md`);
      continue;
    }
    const listed = parseContents(readFileSync(join(root, readme), 'utf8'));
    if (!listed) {
      errors.push(`${readme}: no ## Contents section`);
      continue;
    }
    const actual = childrenOf(folder, existing);
    for (const name of listed) if (!actual.has(name)) errors.push(`${readme}: Contents lists ${name} but it does not exist`);
    for (const name of actual) if (!listed.has(name)) errors.push(`${readme}: Contents is missing ${name}`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const out = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  });
  const files = out.split('\0').filter(Boolean);
  const errors = checkReadmes(root, files);
  for (const error of errors) console.error(error);
  if (errors.length) process.exit(1);
  const folders = new Set(['.']);
  for (const file of files) for (let d = dirname(file); d !== '.'; d = dirname(d)) folders.add(d);
  console.log(`check-readmes: ${[...folders].filter((f) => !isExempt(f)).length} folders OK`);
}
