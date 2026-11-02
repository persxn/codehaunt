/**
 * Shared helper for driving a sandbox process: JSON job in, JSON result out,
 * with a hard wall-clock budget and bounded output buffering.
 */

import { spawn } from 'node:child_process';

import type { SandboxOutcome } from './types.ts';

/** Cap on the runner's own JSON reply, so a wedged backend cannot exhaust the worker's heap. */
const MAX_REPLY_BYTES = 32 * 1024 * 1024;

export interface SandboxProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export function runSandboxProcess(
  command: string,
  args: string[],
  input: string,
  budgetMs: number,
  onTimeoutKill?: () => void,
): Promise<SandboxProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      // Give the backend its own chance to tear down (e.g. `docker kill`)
      // before falling back to killing the local process.
      onTimeoutKill?.();
      child.kill('SIGKILL');
    }, budgetMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_REPLY_BYTES) stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

    const settle = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8').slice(0, 8192),
        exitCode,
        timedOut,
      });
    };

    child.on('error', () => settle(null));
    child.on('close', (code) => settle(code));

    child.stdin.on('error', () => {
      /* the sandbox may exit before consuming the job; not our problem */
    });
    child.stdin.end(input);
  });
}

/** Parses the runner's JSON reply, converting any malformation into an IE outcome. */
export function parseOutcome(result: SandboxProcessResult, backend: string): SandboxOutcome {
  if (result.timedOut) {
    return {
      compiled: false,
      compileLog: '',
      runs: [],
      internalError: `${backend}: sandbox exceeded its total wall-clock budget`,
    };
  }
  if (!result.stdout.trim()) {
    return {
      compiled: false,
      compileLog: '',
      runs: [],
      internalError: `${backend}: runner produced no output (exit ${result.exitCode})${
        result.stderr ? `: ${result.stderr}` : ''
      }`,
    };
  }
  try {
    const parsed = JSON.parse(result.stdout) as SandboxOutcome;
    return parsed;
  } catch {
    return {
      compiled: false,
      compileLog: '',
      runs: [],
      internalError: `${backend}: unparseable runner reply: ${result.stdout.slice(0, 500)}`,
    };
  }
}
