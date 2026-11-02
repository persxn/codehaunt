import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Language } from '@codehaunt/contracts';

import { DockerCodeRunner } from '../src/sandbox/code-runner.ts';

const runner = new DockerCodeRunner();
const missing = await runner.missingImages();
// Fails loudly rather than skipping: these tests are WP-01 acceptance criteria.
assert.deepEqual(missing, [], `runner images missing: ${missing.join(', ')} (run packages/judge/docker/build.sh)`);

const limits = { timeLimitMs: 4000, memoryLimitMb: 256 };

const HELLO: Record<Language, string> = {
  c: '#include <stdio.h>\nint main(void){char n[64];scanf("%63s",n);printf("Hello, %s\\n",n);return 0;}\n',
  cpp: '#include <bits/stdc++.h>\nint main(){std::string n;std::cin>>n;std::cout<<"Hello, "<<n<<"\\n";}\n',
  java: 'import java.util.*;\npublic class Main{public static void main(String[] a){Scanner s=new Scanner(System.in);System.out.println("Hello, "+s.next());}}\n',
  python: 'print("Hello, " + input().strip())\n',
};

describe('hello world through CodeRunner', () => {
  for (const language of Object.keys(HELLO) as Language[]) {
    test(language, async () => {
      const result = await runner.run({
        language,
        source: HELLO[language],
        tests: [
          { id: 't1', input: 'world\n', expectedOutput: 'Hello, world\n' },
          { id: 't2', input: 'haunt\n', expectedOutput: 'Hello, haunt\n' },
        ],
        limits,
      });
      assert.equal(result.verdict, 'AC', result.compileLog || result.internalError);
      assert.equal(result.testsPassed, 2);
    });
  }
});

test('a wrong answer is WA and reports the first failing test', async () => {
  const result = await runner.run({
    language: 'python',
    source: 'print("nope")\n',
    tests: [{ id: 'a', input: '', expectedOutput: 'yes\n' }],
    limits,
  });
  assert.equal(result.verdict, 'WA');
  assert.equal(result.results[0]?.testId, 'a');
});

test('a compile error is CE with a log', async () => {
  const result = await runner.run({
    language: 'c',
    source: 'int main( { return 0; }\n',
    tests: [{ id: 'a', input: '', expectedOutput: '' }],
    limits,
  });
  assert.equal(result.verdict, 'CE');
  assert.ok(result.compileLog.length > 0);
});

describe('runner containers have no network', () => {
  // Raw sockets, not curl: the runner images ship no curl, and a socket is what a program would use.
  // Raw IPs only: a name lookup with no reachable resolver hangs until TLE, which proves nothing.
  test('python cannot open TCP or send UDP', async () => {
    const source = [
      'import socket',
      'try:',
      '    socket.create_connection(("1.1.1.1", 80), timeout=2).close()',
      '    print("OPEN")',
      'except OSError:',
      '    print("BLOCKED")',
      'try:',
      '    socket.socket(socket.AF_INET, socket.SOCK_DGRAM).sendto(b"x", ("8.8.8.8", 53))',
      '    print("OPEN")',
      'except OSError:',
      '    print("BLOCKED")',
    ].join('\n');
    const result = await runner.run({
      language: 'python',
      source,
      tests: [{ id: 'net', input: '', expectedOutput: 'BLOCKED\nBLOCKED\n' }],
      limits,
    });
    assert.equal(result.verdict, 'AC', `sandbox reached the network: ${result.results[0]?.outputExcerpt}`);
  });

  test('C cannot connect out', async () => {
    const source = `#include <stdio.h>
#include <string.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <unistd.h>
int main(void){
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) { puts("BLOCKED"); return 0; }
  struct sockaddr_in a; memset(&a, 0, sizeof a);
  a.sin_family = AF_INET; a.sin_port = htons(80); inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);
  puts(connect(fd, (struct sockaddr*)&a, sizeof a) == 0 ? "OPEN" : "BLOCKED");
  close(fd); return 0;
}
`;
    const result = await runner.run({
      language: 'c',
      source,
      tests: [{ id: 'net', input: '', expectedOutput: 'BLOCKED\n' }],
      limits,
    });
    assert.equal(result.verdict, 'AC', `sandbox reached the network: ${result.results[0]?.outputExcerpt}`);
  });
});

test('the effective time limit is enforced (busy loop is TLE)', async () => {
  const result = await runner.run({
    language: 'python',
    source: 'while True:\n    pass\n',
    tests: [{ id: 'spin', input: '', expectedOutput: '' }],
    limits: { timeLimitMs: 1000, memoryLimitMb: 128 },
  });
  assert.equal(result.verdict, 'TLE');
});
