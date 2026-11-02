/**
 * Copies runner.py into dist/ after compilation.
 *
 * tsc only emits JavaScript, but the local backend resolves runner.py relative
 * to its own compiled location, so the script has to sit alongside it. The
 * Docker image gets its copy separately, via docker/runner/build.sh.
 */

import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(packageRoot, 'src', 'runner', 'runner.py');
const target = join(packageRoot, 'dist', 'runner', 'runner.py');

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
process.stdout.write(`copied runner.py -> ${target}\n`);
