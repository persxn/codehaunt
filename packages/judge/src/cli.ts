#!/usr/bin/env node
/**
 * Judge CLI — drives the judge without the web app.
 *
 * Useful for verifying a host's sandbox after deployment, for checking a
 * problem's reference solution and test data before publishing it to students,
 * and for debugging a submission that a student disputes.
 */

import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { selectBackend } from './backends/index.ts';
import { judge } from './judge.ts';
import { JudgeQueue } from './queue.ts';
import { VERDICT_LABELS, type ScoringMode, type TestCase } from './types.ts';

/**
 * Loads test cases from a directory of `<name>.in` / `<name>.out` pairs.
 * Cases whose name starts with `sample` are marked as samples, which is what
 * makes their expected I/O visible to students.
 */
async function loadTests(directory: string): Promise<TestCase[]> {
  const entries = await readdir(directory);
  // Samples first: students see them as "test 1" onward, and a failure on a
  // visible case is far more useful to report than one they cannot inspect.
  const inputs = entries
    .filter((name) => name.endsWith('.in'))
    .sort((a, b) => {
      const aSample = a.startsWith('sample');
      const bSample = b.startsWith('sample');
      if (aSample !== bSample) return aSample ? -1 : 1;
      return a.localeCompare(b, 'en', { numeric: true });
    });

  const tests: TestCase[] = [];
  for (const [index, inputName] of inputs.entries()) {
    const stem = basename(inputName, '.in');
    const expectedName = `${stem}.out`;
    if (!entries.includes(expectedName)) {
      throw new Error(`${inputName} has no matching ${expectedName}`);
    }
    tests.push({
      id: stem,
      input: await readFile(join(directory, inputName), 'utf8'),
      expectedOutput: await readFile(join(directory, expectedName), 'utf8'),
      isSample: stem.startsWith('sample'),
      ord: index,
    });
  }

  if (tests.length === 0) throw new Error(`no .in/.out pairs found in ${directory}`);
  return tests;
}

function parseArgs(argv: string[]): { command: string; positional: string[]; flags: Map<string, string> } {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string>();

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (token.startsWith('--')) {
      const [key, inline] = token.slice(2).split('=', 2);
      flags.set(key!, inline ?? rest[++i] ?? '');
    } else {
      positional.push(token);
    }
  }

  return { command, positional, flags };
}

const USAGE = `cjudge — C submission judge

  cjudge run <source.c> --tests <dir> [--scoring partial|allOrNothing]
                                      [--time-limit <ms>] [--memory <mb>]
      Judge a source file against a directory of <name>.in / <name>.out pairs.

  cjudge selftest
      Compile and run a trivial program to confirm the sandbox works on this host.

  cjudge backend
      Report which execution backend is active.
`;

async function commandRun(positional: string[], flags: Map<string, string>): Promise<number> {
  const sourcePath = positional[0];
  const testsDir = flags.get('tests');
  if (!sourcePath || !testsDir) {
    process.stderr.write(USAGE);
    return 2;
  }

  const backend = await selectBackend();
  const source = await readFile(sourcePath, 'utf8');
  const tests = await loadTests(testsDir);

  const result = await judge(backend, {
    program: { source },
    tests,
    scoring: (flags.get('scoring') as ScoringMode) ?? 'partial',
    limits: {
      ...(flags.has('time-limit') ? { timeLimitMs: Number(flags.get('time-limit')) } : {}),
      ...(flags.has('memory') ? { memoryLimitMb: Number(flags.get('memory')) } : {}),
    },
  });

  if (result.compileLog.trim()) {
    process.stdout.write(`\n${result.compileLog.trim()}\n`);
  }

  if (result.verdict !== 'CE' && result.verdict !== 'IE') {
    process.stdout.write('\n');
    for (const test of result.results) {
      const mark = test.verdict === 'AC' ? '+' : '-';
      const detail = test.signal ? ` (${test.signal})` : '';
      process.stdout.write(
        `  ${mark} ${test.testCaseId.padEnd(16)} ${test.verdict.padEnd(4)}` +
          ` ${String(test.timeMs).padStart(5)}ms ${String(Math.round(test.memoryKb / 1024)).padStart(4)}MB${detail}\n`,
      );
    }
  }

  process.stdout.write(
    `\n  ${VERDICT_LABELS[result.verdict]} — ${result.testsPassed}/${result.testsTotal} tests, ` +
      `score ${(result.score * 100).toFixed(0)}%\n\n`,
  );

  return result.verdict === 'AC' ? 0 : 1;
}

async function commandSelftest(): Promise<number> {
  const backend = await selectBackend();
  process.stdout.write(`backend: ${backend.name}\n`);

  const queue = new JudgeQueue();
  const result = await queue.run(() =>
    judge(backend, {
      program: {
        source: `#include <stdio.h>
int main(void) { int a, b; if (scanf("%d %d", &a, &b) != 2) return 1; printf("%d\\n", a + b); return 0; }`,
      },
      tests: [
        { id: 'sum', input: '2 3\n', expectedOutput: '5\n', isSample: true, ord: 0 },
      ],
    }),
  );

  if (result.verdict === 'AC') {
    process.stdout.write('sandbox selftest: OK\n');
    return 0;
  }

  process.stderr.write(`sandbox selftest FAILED: ${result.verdict}\n${result.compileLog}\n`);
  return 1;
}

async function main(): Promise<number> {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case 'run':
      return commandRun(positional, flags);
    case 'selftest':
      return commandSelftest();
    case 'backend': {
      const backend = await selectBackend();
      process.stdout.write(`${backend.name}\n`);
      return 0;
    }
    default:
      process.stdout.write(USAGE);
      return command === 'help' ? 0 : 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
