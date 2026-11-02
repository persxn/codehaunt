import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { LANGUAGES, LANGUAGE_LABEL, TIME_MULTIPLIER } from '../src/types.ts';

/**
 * The TypeScript union and the sandbox's own table have to agree.
 *
 * They are different languages in different files, and nothing compiles them
 * together: `runner.py` is copied into an image and reached over a JSON
 * boundary. So a language added to the union alone typechecks, builds, deploys,
 * and fails on the first submission with `unsupported language: <name>` from
 * inside a container — which is exactly what happened while C++ was being added,
 * and only because the image had been built before the table was edited.
 *
 * Reading the Python rather than importing it: the alternative is running
 * python3 from a Node test, which makes the suite depend on an interpreter it
 * otherwise does not need.
 */
const RUNNER = fileURLToPath(new URL('../src/runner/runner.py', import.meta.url));

function tableKeys(): string[] {
  const source = readFileSync(RUNNER, 'utf8');
  const start = source.indexOf('LANGUAGES = {');
  assert.notEqual(start, -1, 'runner.py no longer declares a LANGUAGES table');

  // Keys are the quoted names at one level of indentation inside the literal.
  const body = source.slice(start, source.indexOf('\n}\n', start));
  return [...body.matchAll(/^ {4}"([a-z+]+)": \{/gm)].map((match) => match[1]!);
}

describe('the language table crosses a process boundary', () => {
  test('every language the judge offers, the sandbox can run', () => {
    const inRunner = new Set(tableKeys());
    for (const language of LANGUAGES) {
      assert.ok(
        inRunner.has(language),
        `'${language}' is in the TypeScript union but not in runner.py — ` +
          `a submission in it fails inside the container with "unsupported language"`,
      );
    }
  });

  test('and nothing in the sandbox is unreachable from the judge', () => {
    const offered = new Set<string>(LANGUAGES);
    for (const language of tableKeys()) {
      assert.ok(
        offered.has(language),
        `runner.py can run '${language}' but nothing offers it — either add it to ` +
          `LANGUAGES or drop the toolchain, because an image carries every byte of it`,
      );
    }
  });

  test('each language is priced and labelled', () => {
    for (const language of LANGUAGES) {
      assert.ok(LANGUAGE_LABEL[language], `${language} has no label`);
      assert.ok(TIME_MULTIPLIER[language] > 0, `${language} has no time multiplier`);
    }
  });
});

describe('the local backend cannot be enabled on a real deployment', () => {
  test('the opt-in alone is not enough when a public origin is set', async () => {
    const { LocalBackend } = await import('../src/backends/local.ts');
    const wasAllow = process.env.CJUDGE_ALLOW_LOCAL_BACKEND;
    const wasOrigin = process.env.CJUDGE_PUBLIC_ORIGIN;
    const errors: unknown[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => void errors.push(args.join(' '));

    try {
      process.env.CJUDGE_ALLOW_LOCAL_BACKEND = '1';
      process.env.CJUDGE_PUBLIC_ORIGIN = 'https://judge.example.edu';

      assert.equal(
        await new LocalBackend().isAvailable(),
        false,
        'a machine serving students must never fall back to an unisolated filesystem',
      );
      assert.match(String(errors.join(' ')), /REFUSING the local backend/);
    } finally {
      console.error = realError;
      if (wasAllow === undefined) delete process.env.CJUDGE_ALLOW_LOCAL_BACKEND;
      else process.env.CJUDGE_ALLOW_LOCAL_BACKEND = wasAllow;
      if (wasOrigin === undefined) delete process.env.CJUDGE_PUBLIC_ORIGIN;
      else process.env.CJUDGE_PUBLIC_ORIGIN = wasOrigin;
    }
  });
});
