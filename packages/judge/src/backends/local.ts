/**
 * Local backend — DEVELOPMENT ONLY. Never expose this to students.
 *
 * It wraps the same runner.py in `unshare --user --net --pid --fork`, which on
 * an unprivileged host gives real isolation for:
 *
 *   - network      (own empty netns: no sockets out, no `system("curl ...")`)
 *   - processes    (own pid namespace)
 *   - memory, CPU, output size, process count, wall clock  (rlimits in runner.py)
 *
 * What it does NOT give, and cannot without root: filesystem isolation. Without
 * a writable uid_map there is no way to drop to an unprivileged uid or pivot
 * into a minimal rootfs, so student code runs with the judge user's own file
 * permissions and can read anything that user can read.
 *
 * That is precisely why this backend refuses to start unless
 * CJUDGE_ALLOW_LOCAL_BACKEND=1 is set explicitly — and refuses even then if
 * CJUDGE_PUBLIC_ORIGIN is set, because that combination is a development switch
 * that has reached a machine serving real students. Production uses
 * DockerBackend, and there is no configuration in which it does not.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { parseOutcome, runSandboxProcess } from './process.ts';
import { totalBudgetMs, type ExecutionBackend, type JudgeJob, type SandboxOutcome } from './types.ts';

const execFileAsync = promisify(execFile);

/** runner.py ships next to the compiled backend, one directory up. */
export function runnerScriptPath(): string {
  return fileURLToPath(new URL('../runner/runner.py', import.meta.url));
}

export class LocalBackend implements ExecutionBackend {
  readonly name = 'local';

  async isAvailable(): Promise<boolean> {
    if (process.env.CJUDGE_ALLOW_LOCAL_BACKEND !== '1') return false;

    /*
     * An opt-in is not enough on a machine that serves students.
     *
     * `CJUDGE_ALLOW_LOCAL_BACKEND=1` is a development switch, and a development
     * switch reaches production the ordinary way: somebody copies a working
     * `.env`. The consequence is not a broken page — it is student code running
     * with the judge user's own file permissions, on the host holding the class
     * records, and nothing on the screen looks any different.
     *
     * `CJUDGE_PUBLIC_ORIGIN` is the marker of a real deployment: it is what the
     * site is served as, and a laptop running the tests has no reason to set it.
     * So the two together are refused outright rather than warned about.
     *
     * Read directly rather than through `@cjudge/db/origin` because this package
     * has no dependencies at all, and the judge having none is worth more than
     * sharing one three-line reader.
     */
    if ((process.env.CJUDGE_PUBLIC_ORIGIN ?? '').trim() !== '') {
      console.error(
        '[cjudge] REFUSING the local backend: CJUDGE_ALLOW_LOCAL_BACKEND=1 is set on an ' +
          'installation with a public origin. The local backend cannot isolate the ' +
          'filesystem, so student code would run with this account\'s own permissions. ' +
          'Install Docker, or unset CJUDGE_PUBLIC_ORIGIN if this is not a real deployment.',
      );
      return false;
    }
    try {
      // Confirm this kernel actually permits unprivileged user+net namespaces;
      // many hardened hosts do not, and failing here beats failing per-submission.
      await execFileAsync('unshare', ['--user', '--net', '--pid', '--fork', 'true'], {
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async execute(job: JudgeJob): Promise<SandboxOutcome> {
    /*
     * C only, here.
     *
     * The local backend has no cgroup, so the memory ceiling is whatever
     * RLIMIT_AS the runner sets — and Java cannot run under an RLIMIT_AS at
     * all, which is why the runner exempts it. Under Docker that exemption is
     * safe because `--memory` is a real limit enforced elsewhere; here there is
     * nothing to fall back on, and a Java submission would run unbounded.
     *
     * Refusing is the only honest answer. Silently running it would make the
     * development backend less safe than the production one in exactly the way
     * nobody would think to check.
     */
    if ((job.language ?? 'c') !== 'c') {
      return {
        compiled: false,
        compileLog: '',
        runs: [],
        internalError:
          `the local backend runs C only — ${job.language} needs the container's memory limit`,
      };
    }
    const workRoot = await mkdtemp(join(tmpdir(), 'cjudge-local-'));
    try {
      const result = await runSandboxProcess(
        'unshare',
        ['--user', '--net', '--pid', '--fork', '--', 'python3', runnerScriptPath()],
        JSON.stringify({ ...job, workRoot }),
        totalBudgetMs(job),
      );
      return parseOutcome(result, this.name);
    } finally {
      await rm(workRoot, { recursive: true, force: true });
    }
  }
}
