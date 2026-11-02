/**
 * CodeRunner: the only path by which model-generated code executes (standards §2).
 *
 * Wraps the vendored `@cjudge/judge` Docker backend without modifying it (ADR-001):
 * one throwaway container per run with --network=none, memory/pids/cpus caps,
 * --read-only, --cap-drop=ALL, no-new-privileges, uid 65534. Expected outputs stay
 * in this process; the sandbox receives inputs only.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { DockerBackend, judge, TIME_MULTIPLIER, type TestCase } from '@cjudge/judge';
import { Language, RunRequest, RunResult, type Language as LanguageT } from '@codehaunt/contracts';

const execFileAsync = promisify(execFile);

export interface CodeRunner {
  run(request: RunRequest): Promise<RunResult>;
}

export interface DockerCodeRunnerOptions {
  /** C image; the others derive as `<name>-<lang>:<tag>`, as the vendored backend does. */
  image?: string;
  /** CPU share per run. 1 keeps timings comparable between participants. */
  cpus?: string;
  dockerPath?: string;
}

export const DEFAULT_RUNNER_IMAGE = 'codehaunt-runner:1';

export class DockerCodeRunner implements CodeRunner {
  private readonly backend: DockerBackend;
  private readonly image: string;
  private readonly dockerPath: string;

  constructor(options: DockerCodeRunnerOptions = {}) {
    this.image = options.image ?? process.env.RUNNER_IMAGE ?? DEFAULT_RUNNER_IMAGE;
    this.dockerPath = options.dockerPath ?? 'docker';
    // The Docker backend only; the vendored local backend has no filesystem isolation.
    this.backend = new DockerBackend({ image: this.image, cpus: options.cpus ?? '1', dockerPath: this.dockerPath });
  }

  /** Image per language, mirroring DockerBackend.imageFor (including its per-language env overrides). */
  imageFor(language: LanguageT): string {
    if (language === 'c') return this.image;
    const [name, tag = 'latest'] = this.image.split(':');
    return process.env[`CJUDGE_RUNNER_IMAGE_${language.toUpperCase()}`] ?? `${name}-${language}:${tag}`;
  }

  /** Languages whose runner image is missing on this host. Empty means ready (/readyz). */
  async missingImages(): Promise<LanguageT[]> {
    const missing: LanguageT[] = [];
    for (const language of Language.options) {
      try {
        await execFileAsync(this.dockerPath, ['image', 'inspect', this.imageFor(language)], { timeout: 10_000 });
      } catch {
        missing.push(language);
      }
    }
    return missing;
  }

  async run(input: RunRequest): Promise<RunResult> {
    const request = RunRequest.parse(input);
    const tests: TestCase[] = request.tests.map((t, ord) => ({
      id: t.id,
      input: t.input,
      expectedOutput: t.expectedOutput,
      isSample: false,
      ord,
    }));

    /*
     * `limits.timeLimitMs` is the effective limit the caller wants (base × the event's
     * per-language multiplier, ADR-005). The vendored judge multiplies by its own table,
     * so divide that out here; its JVM/Python startup allowance still applies on top.
     */
    const timeLimitMs = Math.ceil(request.limits.timeLimitMs / TIME_MULTIPLIER[request.language]);

    const result = await judge(this.backend, {
      language: request.language,
      program: { source: request.source },
      tests,
      limits: { timeLimitMs, memoryLimitMb: request.limits.memoryLimitMb },
      checker: {
        kind: request.checker.kind,
        ...(request.checker.tolerance !== undefined ? { tolerance: request.checker.tolerance } : {}),
      },
      scoring: 'partial',
    });

    return RunResult.parse({
      verdict: result.verdict,
      testsPassed: result.testsPassed,
      testsTotal: result.testsTotal,
      maxTimeMs: result.maxTimeMs,
      maxMemoryKb: result.maxMemoryKb,
      compileLog: result.compileLog,
      results: result.results.map((r) => ({
        testId: r.testCaseId,
        verdict: r.verdict,
        timeMs: r.timeMs,
        memoryKb: r.memoryKb,
        outputExcerpt: r.outputExcerpt,
      })),
      ...(result.internalError ? { internalError: result.internalError } : {}),
    });
  }
}
