/**
 * Docker backend — the production sandbox.
 *
 * One throwaway container per submission: compile once, run every test inside
 * it, then the container is gone. Per-test containers would be cleaner still
 * but cost ~200ms of startup each; at 60 students x 10 tests that is minutes of
 * pure overhead per assignment.
 */

import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { parseOutcome, runSandboxProcess } from './process.ts';
import { totalBudgetMs, type ExecutionBackend, type JudgeJob, type SandboxOutcome } from './types.ts';
import type { Language } from '../types.ts';

const execFileAsync = promisify(execFile);

export interface DockerBackendOptions {
  image?: string;
  /** CPU shares per submission; 1 keeps timings comparable between students. */
  cpus?: string;
  dockerPath?: string;
}

export class DockerBackend implements ExecutionBackend {
  readonly name = 'docker';

  private readonly image: string;
  private readonly cpus: string;
  private readonly dockerPath: string;

  constructor(options: DockerBackendOptions = {}) {
    this.image = options.image ?? process.env.CJUDGE_RUNNER_IMAGE ?? 'cjudge-runner:1';
    this.cpus = options.cpus ?? '1';
    this.dockerPath = options.dockerPath ?? 'docker';
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync(this.dockerPath, ['image', 'inspect', this.image], { timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Container flags, and why each one is here:
   *
   *   --network=none          no exfiltration, no `system("curl ...")`
   *   --memory / --memory-swap  cgroup ceiling; swap equal to memory disables swap
   *   --pids-limit            the real fork-bomb defence (RLIMIT_NPROC is a backstop)
   *   --cpus                  keeps one student's busy loop from starving the queue
   *   --read-only             the image filesystem cannot be modified
   *   --cap-drop=ALL          no capabilities at all
   *   --security-opt no-new-privileges  setuid binaries cannot escalate
   *   --user 65534:65534      runs as nobody
   *
   * Two tmpfs mounts, deliberately different: /box holds the compiled binary and
   * must therefore allow exec, while /tmp is locked down with noexec so nothing
   * can be staged and run from the conventional scratch location.
   */
  private buildArgs(job: JudgeJob, containerName: string): string[] {
    // The cgroup ceiling must clear the larger of the compile and execution
    // budgets, plus headroom for the runner itself. Sizing it from the execution
    // limit alone lets the cgroup kill gcc before its own RLIMIT_AS applies,
    // which surfaces as a mystifying compile failure on correct code.
    const memory = `${Math.max(job.compileLimits.memoryLimitMb, job.limits.memoryLimitMb) + 128}m`;
    return [
      'run',
      '--rm',
      '-i',
      '--name',
      containerName,
      '--network=none',
      `--memory=${memory}`,
      `--memory-swap=${memory}`,
      `--pids-limit=${job.limits.pidLimit}`,
      `--cpus=${this.cpus}`,
      '--read-only',
      '--tmpfs',
      '/box:rw,exec,nosuid,size=64m,mode=1777',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=8m,mode=1777',
      '--cap-drop=ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '65534:65534',
      this.imageFor(job.language ?? 'c'),
      'python3',
      '/opt/cjudge/runner.py',
    ];
  }

  /**
   * One image per language, rather than one image with all three toolchains.
   *
   * A JDK is the better part of two hundred megabytes and every byte in a
   * sandbox image is reachable by student code. Putting it in the image that
   * runs C submissions would triple the attack surface of the 87% of runs that
   * never touch Java, for no benefit — and the C path is the one currently
   * carrying real assessments, so leaving it byte-for-byte unchanged is worth
   * more than the convenience of a single build.
   */
  private imageFor(language: Language): string {
    if (language === 'c') return this.image;
    // Derived from the C image's tag so a version bump moves all three
    // together; overridable for a deployment that names them differently.
    const [name, tag = 'latest'] = this.image.split(':');
    return process.env[`CJUDGE_RUNNER_IMAGE_${language.toUpperCase()}`] ?? `${name}-${language}:${tag}`;
  }

  async execute(job: JudgeJob): Promise<SandboxOutcome> {
    const containerName = `cjudge-${randomUUID()}`;

    // The process ceiling is enforced by the cgroup via --pids-limit, so the
    // runner is told not to also set RLIMIT_NPROC. That rlimit counts processes
    // per-UID across the entire host: processes running as the same uid outside
    // the container eat into the budget, and gcc dies with
    // "vfork: Resource temporarily unavailable" while compiling a correct program.
    const payload = JSON.stringify({
      ...job,
      limits: { ...job.limits, pidLimit: 0 },
      workRoot: '/box',
    });

    const result = await runSandboxProcess(
      this.dockerPath,
      this.buildArgs(job, containerName),
      payload,
      totalBudgetMs(job),
      () => {
        // Killing the local `docker run` client does not stop the container;
        // the daemon owns it, so it has to be killed by name.
        execFile(this.dockerPath, ['kill', containerName], () => {});
      },
    );

    return parseOutcome(result, this.name);
  }
}
