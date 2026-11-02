/**
 * Containment suite.
 *
 * Every program here is something a student could plausibly submit — by
 * accident or on purpose — that would take down an unprotected judge. Each must
 * produce a clean verdict, promptly, with no effect on the host.
 *
 * A note on backends: the local backend isolates the network, processes, memory,
 * CPU, output size and wall clock, but *cannot* isolate the filesystem without
 * root. The filesystem cases below therefore assert full isolation only under
 * Docker, and assert "handled cleanly" everywhere. That gap is exactly why the
 * local backend refuses to run without CJUDGE_ALLOW_LOCAL_BACKEND=1.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { judge } from '../src/judge.ts';
import type { Verdict } from '../src/types.ts';
import { backend, cases, skipReason } from './helpers.ts';

const isDocker = backend?.name === 'docker';
const dockerOnly = skipReason || (isDocker ? false : 'filesystem isolation requires the Docker backend');

/** Tight limits keep the suite fast; containment should not need long to prove. */
const LIMITS = { timeLimitMs: 1500, memoryLimitMb: 128, outputLimitBytes: 32 * 1024, pidLimit: 32 };

async function run(source: string, expectedOutput = 'never matched\n') {
  return judge(backend!, {
    program: { source },
    tests: cases([['', expectedOutput]]),
    limits: LIMITS,
  });
}

function assertVerdictIn(actual: Verdict, allowed: Verdict[], what: string) {
  assert.ok(
    allowed.includes(actual),
    `${what}: expected one of ${allowed.join('/')}, got ${actual}`,
  );
}

describe('resource exhaustion is contained', () => {
  test('fork bomb', { skip: skipReason }, async () => {
    const started = Date.now();
    const result = await run(`#include <unistd.h>
int main(void) { while (1) fork(); return 0; }`);

    assertVerdictIn(result.verdict, ['TLE', 'RE', 'MLE'], 'fork bomb');
    assert.ok(
      Date.now() - started < 30_000,
      'the judge must not wedge on a fork bomb',
    );
  });

  test('infinite loop hits the time limit', { skip: skipReason }, async () => {
    const result = await run(`int main(void) { volatile long x = 0; while (1) x++; return 0; }`);
    assert.equal(result.verdict, 'TLE');
    assert.ok(result.maxTimeMs >= LIMITS.timeLimitMs * 0.8, 'ran for roughly the limit');
  });

  test('sleeping past the limit is TLE, not a hang', { skip: skipReason }, async () => {
    const result = await run(`#include <unistd.h>
int main(void) { sleep(3600); return 0; }`);
    assert.equal(result.verdict, 'TLE');
  });

  test('malloc bomb is reported as MLE, not a confusing crash', { skip: skipReason }, async () => {
    const result = await run(`#include <stdlib.h>
#include <string.h>
int main(void) {
  for (long i = 0; i < 100000; i++) {
    char* p = malloc(10 * 1024 * 1024);
    if (!p) return 1;
    memset(p, 1, 10 * 1024 * 1024);
  }
  return 0;
}`);
    assertVerdictIn(result.verdict, ['MLE', 'RE'], 'malloc bomb');
  });

  test('output flood is stopped as OLE without buffering it all', { skip: skipReason }, async () => {
    const result = await run(`#include <stdio.h>
int main(void) {
  for (long i = 0; i < 100000000L; i++) puts("flooding the judge with output");
  return 0;
}`);
    assert.equal(result.verdict, 'OLE');
    assert.ok(
      result.results[0]!.outputExcerpt.length <= 64 * 1024,
      'the judge retains only a bounded excerpt',
    );
  });

  test('runaway recursion is a runtime error', { skip: skipReason }, async () => {
    const result = await run(`int depth(int n) { volatile int pad[256]; pad[0] = n; return depth(n + 1) + pad[0]; }
int main(void) { return depth(0); }`);
    assertVerdictIn(result.verdict, ['RE', 'MLE'], 'stack overflow');
  });
});

describe('the outside world is unreachable', () => {
  test('outbound network connections fail', { skip: skipReason }, async () => {
    const result = await run(`#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
int main(void) {
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) { printf("no socket\\n"); return 0; }
  struct sockaddr_in addr;
  memset(&addr, 0, sizeof addr);
  addr.sin_family = AF_INET;
  addr.sin_port = htons(80);
  addr.sin_addr.s_addr = inet_addr("1.1.1.1");
  printf("%s\\n", connect(fd, (struct sockaddr*)&addr, sizeof addr) == 0
    ? "CONNECTED" : "blocked");
  return 0;
}`, 'blocked\n');

    assert.equal(result.verdict, 'AC', 'the connection attempt must fail, not succeed');
    assert.doesNotMatch(result.results[0]!.outputExcerpt, /CONNECTED/);
  });

  test('shelling out to a network tool achieves nothing', { skip: skipReason }, async () => {
    const result = await run(`#include <stdio.h>
#include <stdlib.h>
int main(void) {
  int rc = system("curl -s -m 2 https://example.com");
  printf("rc=%d\\n", rc == 0 ? 0 : 1);
  return 0;
}`, 'rc=1\n');

    assertVerdictIn(result.verdict, ['AC', 'RE', 'TLE'], 'system() network call');
    assert.doesNotMatch(result.results[0]!.outputExcerpt, /<html/i, 'no page content came back');
  });
});

describe('the filesystem is protected', () => {
  test('the image filesystem is read-only', { skip: dockerOnly }, async () => {
    const result = await run(`#include <stdio.h>
int main(void) {
  FILE* f = fopen("/etc/cjudge-pwned", "w");
  printf("%s\\n", f ? "WRITABLE" : "read-only");
  if (f) fclose(f);
  return 0;
}`, 'read-only\n');

    assert.equal(result.verdict, 'AC');
    assert.doesNotMatch(result.results[0]!.outputExcerpt, /WRITABLE/);
  });

  test('a write attempt never crashes the judge', { skip: skipReason }, async () => {
    const result = await run(`#include <stdio.h>
int main(void) {
  FILE* f = fopen("/etc/cjudge-pwned", "w");
  if (f) { fputs("x", f); fclose(f); }
  printf("done\\n");
  return 0;
}`, 'done\n');

    assertVerdictIn(result.verdict, ['AC', 'RE'], 'filesystem write attempt');
  });

  test('the sandbox holds no answer key to steal', { skip: skipReason }, async () => {
    // Expected outputs are never sent into the sandbox, so even a program that
    // reads every file it can reach cannot find them.
    const result = await judge(backend!, {
      program: {
        source: `#include <stdio.h>
#include <stdlib.h>
int main(void) {
  system("grep -rl SECRET_ANSWER / 2>/dev/null | head -5");
  printf("searched\\n");
  return 0;
}`,
      },
      tests: [
        { id: 't1', input: '', expectedOutput: 'SECRET_ANSWER\n', isSample: false, ord: 0 },
      ],
      limits: LIMITS,
    });

    assert.notEqual(result.verdict, 'AC', 'a grep for the answer must not produce it');
    assert.doesNotMatch(result.results[0]!.outputExcerpt, /SECRET_ANSWER/);
  });
});

describe('ordinary failures still read correctly', () => {
  test('a non-zero exit is a runtime error', { skip: skipReason }, async () => {
    const result = await run(`int main(void) { return 1; }`);
    assert.equal(result.verdict, 'RE');
  });

  test('a deliberate abort is a runtime error with its signal', { skip: skipReason }, async () => {
    const result = await run(`#include <stdlib.h>
int main(void) { abort(); }`);
    assert.equal(result.verdict, 'RE');
    assert.equal(result.results[0]!.signal, 'SIGABRT');
  });

  test('dividing by zero is caught as a runtime error', { skip: skipReason }, async () => {
    // Both operands come from stdin. Neither `volatile int z = 0; 1 / z` nor a
    // scanf-read divisor with a literal 1 numerator traps under -O2: gcc folds
    // the first outright, and rewrites `1 / z` into a comparison chain because
    // a numerator of 1 can only yield 1, -1 or 0. A genuine runtime `a / b`
    // compiles to idiv, which is what actually raises SIGFPE.
    const result = await judge(backend!, {
      program: {
        source: `#include <stdio.h>
int main(void) {
  int a, b;
  if (scanf("%d %d", &a, &b) != 2) return 1;
  printf("%d\\n", a / b);
  return 0;
}`,
      },
      tests: cases([['7 0\n', 'unreachable\n']]),
      limits: LIMITS,
    });

    assert.equal(result.verdict, 'RE');
    assert.equal(result.results[0]!.signal, 'SIGFPE');
  });

  test('a null dereference is a runtime error, not a judge failure', { skip: skipReason }, async () => {
    const result = await run(`int main(void) { volatile int* p = 0; *p = 1; return 0; }`);
    assert.equal(result.verdict, 'RE');
    assert.equal(result.results[0]!.signal, 'SIGSEGV');
  });
});
