import { LocalBackend } from '../src/backends/local.ts';
import { DockerBackend } from '../src/backends/docker.ts';
import type { ExecutionBackend } from '../src/backends/types.ts';
import type { TestCase } from '../src/types.ts';

async function resolve(): Promise<ExecutionBackend | null> {
  const docker = new DockerBackend();
  if (await docker.isAvailable()) return docker;

  process.env.CJUDGE_ALLOW_LOCAL_BACKEND = '1';
  const local = new LocalBackend();
  if (await local.isAvailable()) return local;

  return null;
}

/**
 * Resolved at module load via top-level await, so `skip` conditions evaluated
 * while the test tree is being built already know whether a backend exists.
 * Doing this in a `before` hook is too late — the suite body runs first.
 *
 * Docker is preferred so CI exercises the production path; developer machines
 * without it fall back to the local backend.
 */
export const backend: ExecutionBackend | null = await resolve();

export const skipReason: string | false = backend
  ? false
  : 'no execution backend available on this host';

/** Builds test cases from plain [input, expectedOutput] pairs. */
export function cases(pairs: [string, string][]): TestCase[] {
  return pairs.map(([input, expectedOutput], i) => ({
    id: `t${i + 1}`,
    input,
    expectedOutput,
    isSample: i === 0,
    ord: i,
  }));
}
