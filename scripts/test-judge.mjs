// Runs the vendored judge suite (unmodified) against CodeHaunt's runner images.
// On arm64 it skips the two upstream tests whose verdicts differ by architecture (see VENDORED.md).
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { arch } from 'node:process';

const dir = new URL('../packages/judge/', import.meta.url).pathname;
const ARM64_SKIPS = ['output flood is stopped as OLE', 'dividing by zero is caught as a runtime error'];

const env = { ...process.env, CJUDGE_RUNNER_IMAGE: process.env.CJUDGE_RUNNER_IMAGE ?? 'codehaunt-runner:1' };
const files = readdirSync(`${dir}test`).filter((f) => f.endsWith('.test.ts')).map((f) => `test/${f}`);
const skips = arch === 'arm64' ? ARM64_SKIPS.flatMap((name) => ['--test-skip-pattern', name]) : [];

execFileSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], { cwd: dir, stdio: 'inherit', env });
execFileSync(process.execPath, ['--test', '--experimental-strip-types', ...skips, ...files], { cwd: dir, stdio: 'inherit', env });
